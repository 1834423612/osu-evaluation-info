# 管理员账号

[English](../admin-roles.md) · [文档目录](README.md)

管理员是身份数据库中拥有 `admin` 角色的已有前台账号。`/admin/users` 支持按姓名、邮箱或完整账号 ID 搜索，并展示权限变更的操作者、理由和时间。`/admin/rmp` 使用同一角色校验。

生产访问要求邮箱已验证、最近 30 分钟内登录、数据库中仍有管理员角色，并通过现有管理员解锁。每次请求都会重新读取角色。撤销将在下一次请求生效，包括使用已有会话的请求。生产写入必须是同源 JSON 请求。

## 初始化与授予首名管理员

对目标环境运行账号迁移。在认证用户表存在后，它会包含 `db/migrations/20261126_admin_roles.sql`：

```sh
pnpm account:migrate --production --apply
node scripts/user-data/admin-roles.mjs list --production --search 'name or email'
node scripts/user-data/admin-roles.mjs grant --production --user-id EXISTING_ACCOUNT_ID --actor OPERATOR_NAME --reason 'Initial administrator approved'
```

上面的授权命令只输出计划。核对账号 ID、邮箱和环境后，再添加 `--apply` 重复执行以写入授权。系统不会自动选择首名管理员，只有已有数据库访问权限的操作者可以完成首次授权。账号列表含有私密邮箱，应只保留在操作者本地终端。

后续管理员可使用 `/admin/users` 或同一 CLI。CLI 变更始终要求明确的账号 ID、操作者，以及 8–500 个字符的理由。`revoke` 与 `grant` 使用相同选项。`audit --production --page 1` 列出权限历史。不传 `--production` 时选择开发环境；开发角色工具拒绝访问生产 `osu_identity` 命名空间。

## 存储与直接数据库操作

`account_role.user_id` 关联配置的认证 `user.id`。角色、`account_role_audit` 和 `admin_role_guard` 位于 `osu_identity`，开发环境默认位于 `osu_identity_dev`，并遵循 `AUTH_SCHEMA` 与 `AUTH_TABLE_PREFIX`。这些表已纳入账号初始化与用户数据备份。

使用默认命名空间与表前缀时，直接数据库操作应调用带审计的函数：

```sql
SELECT osu_identity.change_admin_role(
  'EXISTING_ACCOUNT_ID', 'grant', 'operator:OPERATOR_NAME',
  'Initial administrator approved', NULL
);
```

移除权限时使用 `revoke`。SQL 函数会串行处理角色变更，并在持锁后重新校验执行操作的管理员。数据库触发器禁止移除最后一名管理员、更新角色记录，以及修改或删除审计。删除管理员账号前应先撤销其角色；最后一名管理员必须先由其他管理员替代。审计记录将账号 ID、操作者与理由作为安全记录保留。

## 验证

```sh
node --test tests/auth/admin-roles.test.mjs tests/user-data/backup.test.mjs
ADMIN_ROLES_DATABASE_TEST=1 node --test tests/auth/admin-roles-postgres.integration.test.mjs
```

第一条命令使用内存 PostgreSQL 检查角色、外键、审计、命名空间和来源校验。显式启用的第二条命令需要 `DATABASE_URL`，会创建并删除临时命名空间，检查并发撤销和执行者等待期间被撤权的情况，不会修改已有账号或角色。`tests/auth/admin-users.browser.mjs` 使用拦截的账号接口验证页面；设置 `ADMIN_TEST_BASE_URL`，并按需设置 `PLAYWRIGHT_MODULE` 与 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。其中模拟的授权不会访问数据库。设置 `ADMIN_TEST_EXPECT_PRODUCTION=1` 还会检查生产预览拒绝未登录的 GET 与 POST 请求。
