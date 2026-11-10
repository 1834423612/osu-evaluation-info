# Simple Syllabus：接口、关联与运维

课程卡片和详情的「教学大纲」提供班次级大纲。默认使用官方版式，可切换清爽阅读、查找分区、查看原文摘录和下载浏览器本地生成的 Letter PDF。课程列表不会批量预取正文或加载 PDF 库。

## 已验证的协议

依据用户提供的两个 HAR 及 2026-11-10 的匿名实测：PNG 是列表缩略图；正文是已经发布的 HTML 组件，不是 PDF 绘图元数据。HAR 仅用于识别协议，没有导入 session、账号目录、Cookie、认证数据或读取统计。

| 接口                                           | 用途与重要字段                                                                                                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api2/app-state?locale=en-US`                 | `items[0].state.terms` 提供学期 UUID、名称、状态、发布标记和起止日期。只提取学期字段。                                                                     |
| `/api2/doc-library-search?term_id=UUID&page=0` | 从 0 开始分页，核对 `pagination.total/returned/page/page_size`；记录包含 `code/entity_id/term_id/title/visibility`。支持 `subject_name`、`course_number`。 |
| `/api2/doc-full-page-get?code=CODE`            | `items[0].doc_data` 包含正文、发布状态、学期、`published_snapshot_id` 和 `modified`。组件包含顺序、语言、HTML、公开标记与 snapshot。                       |
| `/api2/doc-png/CODE/...`                       | 列表预览图，不作为正文来源。                                                                                                                               |
| `/api2/doc-version-check?...`                  | 样本仅有 `id/has_versioning`，无法证明正文未变，不用于跳过归档。                                                                                           |

只接收已发布、非 working 文档，以及属于发布 snapshot、标记为公开的英语组件。拒绝未知 envelope、无效标识、重复页、分页总数漂移、跨学期结果和过大响应。非数字班次标识保留为 `sectionIdentifier`。

AU2026 在样本中已发布；SU2026、SP2026 和 Demo Term 虽存在于学期列表，样本中未发布，不能解释为已有可用大纲。SP2027 的 UUID 和发布时间仍由未来官方返回决定。代码不将 `current` 固定为某学期，也不预设未知学期 UUID。

## 数据获取

1. 浏览器匿名直连官方固定 origin，`credentials: omit`。
2. CORS、网络或官方读取失败后，调用本站 `/api/syllabus`。
3. 本站兼容接口先匿名请求官方，失败后才查询数据库，明确返回 `official-direct`、`official-relay` 或 `backup` 及获取/备份时间。

实测官方 JSON 未开放 CORS，因此目前通常需要兼容接口。Node 默认 User-Agent 会触发正文接口的 CDN 403；使用公开浏览器 User-Agent 可匿名获取 ART 样本，无需抓包凭据或版本 header。HTML 403 被视为服务/CDN 不可用；JSON 401/403 才标记访问受限。失败不显示为「课程没有大纲」。

兼容接口仅支持固定资源与严格校验的标识，不接受任意目标 URL，也不转发访客 Cookie 或 Authorization。请求有字节上限、超时、队列和并发限制，成功结果短期缓存。

官方页面的 HTTP 源码是 Angular 启动壳，没有正文。此次已通过正常匿名 JSON 请求解决兼容问题，未引入服务端浏览器采集进程。未来若权限或协议改变，保留官网入口和历史备份，依据新返回更新适配器。

## 官方版式、结构提取和 PDF

`officialHtml` 保留清理后的官方 DOM、布局类、图片、表格宽度和允许的内联样式。独立 iframe 使用版本化的 `public/syllabus/official.css`，还原核验过的 BuckeyeSans/BuckeyeSerif 字体、字号、字重、标题边线、段落间距与 300px 校徽。iframe 不允许脚本与表单，正文样式不会影响本站；随父页面重排，自动调整高度，避免双重纵向滚动。

清爽阅读使用单独的语义 HTML。`extractSyllabusSections`、`extractSyllabusHighlights` 和 `SyllabusHighlights` 可供收藏、对比或其他页面复用。摘录来自原文，不推断课程难度、工作量或缺失的评分权重。

PDF 库和内置字体仅在下载时加载，文件完全在浏览器生成。生成后通过 Blob 下载，并保留「PDF 已就绪 · 点击保存」链接，兼容未触发自动保存的浏览器。纸张为 612 × 792 pt（US Letter），支持多页、正文文本和链接。导出采用语义排版，不承诺与官网屏幕分页或字体完全一致。图片保留为描述与源链接；官方上传附件通过官网查看，不假装已并入生成文件。

官方版式基于 2026-11-10 的 BUX 样式。外部官方字体和图片仍依赖源服务，字体不可用时回退到系统字体。数据库归档 HTML 和结构，不归档图片、字体或附件的二进制文件。完整离线媒体归档需另加资产存储、校验和及来源记录。

## 数据库和关联

```sh
pnpm syllabus:migrate
pnpm syllabus:discover
pnpm syllabus:sync
```

复用 `.env.local` 或环境中的 `DATABASE_URL`。迁移显式执行；每日脚本不执行 DDL，不修改现有课程或教学评价表。

| 表/视图                        | 作用                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| `osu_syllabus.terms`           | 学期 UUID、OSU term code、完整学期字段和 `ever_published`。                |
| `sync_runs`、`sync_partitions` | 学期集合、分页断点、完整索引发布时间与官方不可用记录。                     |
| `entry_observations`           | 按页暂存、查重和正文处理断点；失败扫描不发布不完整索引。                   |
| `entries`                      | 持久索引，保留原始班次标识与 term/course/class 自然键，官方删除后仍保留。  |
| `document_versions`            | 按 code、发布 snapshot、SHA-256 内容散列保存版本；相同内容只刷新检查时间。 |
| `catalog_links`                | 连接最新已发布完整课程快照，提供课程 ID、offering、校区和匹配方式。        |

关联必须同时满足学期、学科、完整课程号与真实 class number，小数及 Honors 后缀不合并。实测 `ARCH 4410 s_10356` 对应官方课程库 `10356`，但只在同学期同课程中获得独立班次验证后才接受别名；原始标识不改写。其他未知标识继续保留而不强行绑定。

`catalog_links` 在版本化课程表存在时创建。若先安装 syllabus 后安装 catalog，再执行一次 `syllabus:migrate` 即可建立视图。没有会因课程快照清理而级联删除大纲的跨 schema 外键。

```sql
SELECT match_method, count(*) FROM osu_syllabus.catalog_links GROUP BY match_method;
SELECT status, started_at, completed_at, error FROM osu_syllabus.sync_runs ORDER BY started_at DESC LIMIT 5;
SELECT document_status, count(*) FROM osu_syllabus.entry_observations WHERE run_id = $1 GROUP BY document_status;
```

2026-11-10 首次完整索引共 8,972 条；当时课程快照关联 8,420 条数字班次与 66 条经校验的导入别名。剩余记录等待课程库更新或进一步核对，不以标题相似作为证据。这些数量是当次实测值，不是 UI 常量。

## 每日同步和恢复

`.github/workflows/osu-syllabus-sync.yml` 每天纽约时间 03:43 运行一次，使用现有 Actions secret `DATABASE_URL`。先迁移数据库，再推送至启用 Actions 的默认分支；仅本地 Git 提交不会启动远程计划任务。

默认串行匿名请求，间隔 350 ms，对 429 和可恢复 5xx 有有限重试与退避。分页批量写入，断点与数据一起提交；完整学期分页数量核对后，才原子发布索引。独占 advisory lock 防止重叠，正文逐份校验留存。连续 5 次正文失败即停止，保留旧版本和可续跑状态。

已知历史学期即使不再 current，也会保留。官方明确删除或拒绝旧学期时，继续其他学期并保留旧归档。分页漂移或重复项拒绝发布，下次重新扫描失败 generation；未知结构需检查解析器，必要时使用 `--new-run`。

```sh
# 完整建立索引，正文仍待归档
pnpm syllabus:sync --index-only

# 有限批量验证，下次默认续跑
pnpm syllabus:sync --max-documents 20

# 显式创建新扫描，旧归档继续保留
pnpm syllabus:sync --new-run
```

`partial` 不代表全部正文已备份。`missing` 包括无可读公开正文的空壳文档，以及官方删除/未发布的记录；`uploaded` 表示还需从官网查看上传文件。不能仅以索引总数判断正文覆盖率。

本次完成全量索引和有限批量验证，保存了 19 份可读正文（含两个 ART 2000 班次），未执行全部 8,972 份正文的首次归档。不带限额运行 `pnpm syllabus:sync` 可继续完成；每日工作流也从断点续跑。

## 验证和后续扩展

```sh
pnpm test
SYLLABUS_DATABASE_TEST=1 node --test tests/syllabus/*.test.mjs
pnpm typecheck
pnpm lint
pnpm build
```

数据库测试使用随机临时 schema，覆盖分页回滚、版本去重、别名关联和备份读取，结束后清理，不清空业务表。浏览器已验证真实 ART 2000、390px 手机阅读和课表搜索、1440px 桌面版式与 Letter PDF 下载；独立进程模拟了官方故障后的真实数据库回退。

后续可增加正文版本差异、跨班次教材/评分摘录对比、未匹配记录核对界面，以及带二进制资产的完整离线归档。难度和工作量推断应与原文摘录分开标注，并提供来源位置。
