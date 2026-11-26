# AI 查证辅助

[English](../../rmp/assistance.md) · [RMP 管理](administration.md) · [文档目录](../README.md)

RMP 管理面板可将所选记录导出，供离线核对、本地 AI 或远程 AI 客户端查证。系统不会调用 AI 服务商。所有返回的建议均未经核实，必须由管理员核对后才可能生效。

## 导出与核对

1. 在 `/admin/rmp` 选择最多 100 组“教师档案、校区、原始课程标签”，点击**导出所选**。默认离线导出，不需要机器令牌。
2. 将 JSON 交给查证者。文件包含公开档案标识、来自已发布目录或官方授课历史的候选课程、授课记录，以及每组最多五条、每条不超过 2,000 个 UTF-16 代码单元的评价摘录。`reviewCount` 表示该教师档案及课程标签的有效评价总数；`reviewsSampled` 表示省略了部分评价或缩短了评论，不能将摘录当成完整评价集。文件不含账号邮箱、管理员身份、会话、维护密钥或数据库凭据，并附带建议的 JSON Schema。
3. 导入返回的建议 JSON，或在远程客户端提交后刷新任务。缺少结果的记录会继续等待建议，稍后可在同一任务中分批补交。
4. 打开**核对建议**，逐条检查目标、理由、链接与未经核实的置信度，只选择要处理的记录。可修改操作、目标课程和理由；原始 AI 内容保持不可变。
5. 确认证据已经核对，再批准所选修改。未选记录继续待核对。已处理记录会分别展示人工审核的审计结果与原始 AI 建议，并提供当前关联及历史入口。

**拒绝所选建议**只会弃用建议，不改变 RMP 关联。它不同于建议中的**排除匹配**操作：后者经人工批准后会正式屏蔽课程关联。AI 不确定时应省略该记录，不应将“不确定”写成正式排除建议。置信度和引用链接都是待查证的声明，不能证明建议可信。

姓名、原始课程标签、评价和引用链接均属于不可信来源数据。AI 和操作员都不应执行这些字段中夹带的指令；导出协议会明确说明这一边界。

任务队列支持待核对、等待建议、已核对历史筛选，完整任务 ID 筛选，以及每页 20 条的分页。待核对建议优先排列，已完成条目不会永久挡住较早的待处理批次。

## 可选的远程访问

创建任务时勾选**启用远程 AI · 1 小时令牌**。令牌只返回一次，应在隐藏凭据面板前复制。另行复制基于当前浏览器访问地址生成的接口 URL。令牌不会出现在 URL、资料导出、日志或本地存储中，其显示区域也排除在诊断录屏之外。

令牌包含 256 个随机位，数据库只存 SHA-256 哈希。它只能读取单个任务的公开资料并提交建议。API 允许 5–240 分钟有效期，面板默认一小时。生产环境每次请求都会检查到期、撤销状态，以及创建者当前是否仍是邮箱已验证的管理员。**撤销远程访问**会立即停用令牌。已经提交的建议仍可由人工核对，但要通过管理员认证和最新来源检查。

机器令牌不能调用普通管理员或批量应用接口，包括开发访问路径。机器请求只使用 `Authorization: Bearer …`；不要向 AI 提供会话 Cookie、管理员解锁凭据、维护密钥或数据库 URL。

## 与服务商无关的客户端和协议

在可信终端中设置 `RMP_ASSISTANCE_TOKEN`，不要将实际值放进命令参数或命令历史。明确填写应用的 origin 和导出的任务 ID：

```sh
node scripts/rmp/assistance-client.mjs export --base https://YOUR_APPLICATION_ORIGIN --job JOB_UUID > evidence.json
node scripts/rmp/assistance-client.mjs submit --base https://YOUR_APPLICATION_ORIGIN --job JOB_UUID --file proposal.json
```

客户端不会根据 AI 输出或导出资料中的元数据推断请求地址，不携带 Cookie，也不跟随重定向。默认只允许 HTTPS。操作员明确指定开发地址时，`--allow-local-http` 允许回环 HTTP；`--allow-private-http` 还允许 `100.64.0.0/10` 范围内的数字 Tailscale 地址。其他 HTTP 地址和含凭据的 URL 均会被拒绝。例如另一台 tailnet 机器可使用 `--base http://100.100.10.20:3100 --allow-private-http`，地址仍必须由操作员指定，不能来自 AI 输出。

受限接口为 `/api/admin/rmp/assistance/job/JOB_UUID`：

| 方法   | 用途                                                         |
| ------ | ------------------------------------------------------------ |
| `GET`  | 返回公开资料、快照指纹、已提交的记录标识和建议 JSON Schema。 |
| `POST` | 校验并保存不可变的待核对建议批次。                           |

版本 1 的建议包含 `jobId`、`snapshotFingerprint`、`sourceLabel` 和 `items` 数组。每项复制导出的 `professorId`、`campus`、`token`、`recordFingerprint`，并将 `decisionVersion` 写为 `expectedVersion`，再填写 `action`、`courseKey`、`reason`、`evidenceUrls` 和 0–1 的 `confidence`。精确类型和限制以导出的 JSON Schema 为准。未知字段、重复标识、任务外记录、错误指纹或版本均会被拒绝。引用 URL 必须使用 HTTPS 且不能含用户凭据信息；服务端不会代为抓取任意引用链接。

同一任务可接收多个不可变、记录不重叠的批次。重复相同内容具有幂等性；不同内容若占用已经提交的记录，会返回 `409`。人工批准引用不可变建议的哈希，只能包含所选且尚未处理的记录。服务端会在共享同步锁内重新检查原始档案和评价指纹、自动匹配证据、当前决定版本与官方课程目标。任一冲突都会回滚整个所选批次。课程决定、建议处理进度和审计在同一事务提交，并通过 `proposal_id` 记录来源，不修改原始档案或自动身份记录。

## 安装与验证

`scripts/rmp/setup_admin.mjs` 会依次将 `db/schemas/rmp-admin.sql` 和 `db/schemas/rmp-assistance.sql` 安装到经过校验的 RMP 命名空间。该命令会写入数据库结构；只有明确批准的生产安装才应使用 `--production`。开发环境使用独立的 RMP 命名空间。任务和建议接口返回 `no-store` 与 `no-referrer`，流式请求体在解析前限制为 2 MB。

```sh
node --test tests/rmp/assistance.test.mjs tests/rmp/assistance-queue.test.mjs tests/rmp/assistance-client.test.mjs tests/rmp/assistance-evidence.test.mjs tests/rmp/admin-batch.test.mjs
RMP_TEST_BASE_URL=http://localhost:3103 node tests/rmp/assistance.browser.mjs
```

单元和 SQL 测试使用内存 PostgreSQL 与模拟客户端传输，覆盖令牌到期和撤销、当前管理员权限、不可变提交、部分批准、重放、队列分页、来源过期检查，以及审计与来源记录的原子性。浏览器夹具拦截接口并使用虚拟凭据，模拟的决定不会写入数据库。使用外部浏览器运行时时，可设置 `PLAYWRIGHT_MODULE` 或 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。所有测试均不调用付费 AI 服务。
