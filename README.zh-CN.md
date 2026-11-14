# 蛙O！

选课不迷路，毕业有蛙助。

[English](README.md) · [中文文档目录](docs/zh-CN/README.md) · [测试说明](docs/zh-CN/testing.md)

基于 Next.js App Router、React、TypeScript 和共享 UI 组件的双语课程探索网站。课程、班次、教学大纲、官方 SEI／SSLE 与 RMP 保持各自来源和时间。首页默认课程搜索；课程探索菜单同时提供 RMP 教师库，说明菜单提供 OSU 字段解释与数据方法。

## 启动与检查

需要 Node.js 24+。历史评价与完整目录需要 PostgreSQL。复制 `.env.example` 为 `.env.local` 并配置自己的 `DATABASE_URL`，凭据不得提交。

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm test
pnpm test:python
pnpm typecheck
pnpm lint
pnpm lint:docs
pnpm build
pnpm start
```

打开 http://localhost:3000。缺少数据库时仍可使用官方实时查询，但历史评价与完整索引不可用。CSS 检查包含在 lint 中；独立规则和逐脚本说明见测试文档。

开发启动器可发现 Tailscale 地址，允许对应开发 origin 并打印访问链接。WSL2 可借助 Windows Tailscale 建立 tailnet-only Serve 转发；正常退出会移除自身转发，强制终止可能需要人工清理。它不是公开 Funnel。`pnpm dev -- --no-tailscale` 禁用此行为；显式 hostname 会覆盖监听地址。

## 数据与维护

```sh
pnpm catalog:migrate
pnpm catalog:discover
pnpm catalog:sync
pnpm syllabus:migrate
pnpm syllabus:sync
```

完整课程代码先尝试一页官方结果；标题、介绍、拼写与课程号容错使用已发布索引。课程详情另行刷新官方资料，空位始终单独实时读取。目录与大纲按完整版本保存，官方删去旧学期不会删除已抓取副本；当前删改通过新的完整主版本生效。永久归档不等于外部图片、字体及附件的完整离线镜像。

官方评价按课程、校区和精确教师邮箱匹配；SEI、SSLE、RMP 不混算。RMP 待确认档案仍显示自身评论与分数，但不计入课程汇总。教师库支持跨课程阅读、网格／列表与本机记忆。

大纲提供官方／清爽阅读、目录、搜索、班次匹配与浏览器 Letter PDF。字体使用支持跨域的 BUX 官方 CDN。收藏保存在当前设备；大纲更新需要显式确认已读。

## 代码与文档

- `src/app`：课程、教师库、收藏、说明页面与 API。
- `src/components`、`src/hooks`、`src/lib`：按功能分区的 UI、偏好、传输、评分和检索。
- `src/content`：独立英中文案和对应语言样式。
- `scripts`：采集、迁移、关联、审计、资源与检查工具。
- `db/schemas`、`db/migrations`：显式数据库定义与增量迁移。
- `tests`：按功能分类的单元、集成及浏览器验证。
- `docs`：默认英文；`docs/zh-CN`：中文分类文档。

[中文文档目录](docs/zh-CN/README.md) 列出各模块操作、历史审计和测试入口。搜索参数保存在 URL，收藏在设备本地；服务器完整目录与 SQL 导出不会整体发送给浏览器。
