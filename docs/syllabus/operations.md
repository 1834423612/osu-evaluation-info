# Simple Syllabus：接口、关联与运维

课程卡片和详情的「教学大纲」提供班次级大纲。以教师卡片选择班次，大纲速览展示教材、考核和按周整理的课程安排；下方独立阅读器提供官方版式、清爽阅读、正文搜索、目录跳转、阅读进度、缩放和可用时的全屏阅读。课程列表不会批量预取正文或加载 PDF 库。

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

`officialHtml` 保留清理后的官方 DOM、布局类、图片、表格宽度和允许的内联样式。独立 iframe 使用版本化的 `public/syllabus/official.css`，还原核验过的 BuckeyeSans/BuckeyeSerif 字体、字号、字重、标题边线、段落间距与 300px 校徽。iframe 不允许脚本与表单，正文样式不会影响本站。阅读器限制自身高度，在内部滚动正文，工具栏、目录和进度保持可用；手机默认收起目录，打开后在正文上方展开，点章节后收起。模式切换紧贴正文容器，正文搜索保持固定边框宽度。

清爽阅读使用单独的语义 HTML。`extractSyllabusSections`、`extractSyllabusHighlights`、`extractSyllabusSchedule` 和 `SyllabusHighlights` 可供收藏、对比或其他页面复用。课程安排支持 Week 段落、周次范围及日期表格，保留原顺序、重复/重叠周次和原文说明，不截断主题；无法识别的正文继续按原文显示。速览可跳转对应正文章节，不推断课程难度、工作量或缺失的评分权重。

PDF 库、WOFF2 解码器和导出代码仅在下载时加载，文件完全在浏览器生成。导出使用独立的 816px 官方版式，不受当前过滤、阅读模式和缩放影响；读取计算后的正文字号、字重、颜色、行距及段落间距，加载对应 BuckeyeSans/BuckeyeSerif 字体。在本机把 WOFF2 解码为 SFNT 后交给 pdfmake 子集嵌入，避免 fontkit 对转换过的 WOFF2 复合字形编码失败。实际图片在本机转成 PNG 后嵌入，文字仍可选中，不再将图片替换为 alt 链接。

纸张为 612 × 792 pt（US Letter），支持多页、表格、文本及链接。预览文档以 816px 为基准，四周 48px 留白；PDF 对应四周 36pt 页边距，正文宽度同为 720px / 540pt。手机预览自适应窄屏留白，导出保持 Letter 尺寸。导出保留水平内边距、同一行的 flex 分栏，并合并相邻外边距；链接装饰采用转换器支持的空默认值，避免空数组嵌套导致 pdfmake 报错。表格 caption 单独处理，避免 ART 时间表中的空 caption 被转换为缺列的一行。页脚包含官方来源链接和页码。导出按 Letter 分页；官方上传附件仍通过官网查看，不假装已并入生成文件。

浏览器支持 `showSaveFilePicker` 时，在点击事件内先请求保存位置，待 PDF 生成并写入、关闭成功后显示「已保存」。取消窗口即结束，不继续下载。明确收到 `SecurityError` / `NotAllowedError` 才表示保存窗口被拒绝，并在支持 Popover 的设备上提示；不支持时仅保留按钮下方的小字链接。普通 Blob 下载无法可靠检测浏览器是否弹出保存窗口，因此不使用定时器、失焦或窗口可见性来猜测，不弹此类 toast。写入失败提供手动保存链接。

图片/字体先尝试浏览器匿名读取；仅已知的官方 account-image UUID 路径和 BUX 字体路径可通过 `/api/syllabus/assets` 兼容转发。接口拒绝其他 URL、凭据、重定向和非预期文件签名，并限制并发、队列、超时及响应大小。服务端只转发字节，不接收用户文档，不构建 PDF。无法读取的图片会使导出明确失败，避免静默生成缺图文件；第三方图片仍取决于其 CORS 和可用性。

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

本轮新增验证：CSE 1110 的 Week 段落与 ART 2000 的表格时间表、手机目录/模式切换/搜索/全屏、实际下载 PDF 的 Letter 纸张、图片 XObject、Buckeye 字体嵌入和时间表文本完整性。Windows 原生保存窗口检查因浏览器工具无法可靠识别当前 URL 而中止；保存成功、取消、窗口拒绝、写入失败的逻辑有单元测试，但不将原生窗口端到端验证标为完成。

## 是否增加独立大纲页面

建议保留课程搜索作为主要入口，当前先使用嵌入阅读器和全屏能力，不再复制一套按学期/学科/课程/教师筛选的独立大纲库。现有课程结果已有课程详情、教师、班次与评价，重复筛选页会引入筛选状态、空结果和班次绑定的双份维护；AU2026 目前也是唯一已知有公开正文的学期。

收藏页已提供直接阅读侧栏，复用同一个 `SyllabusReader`、`SyllabusViewer` 和下载组件；打开收藏大纲不会触发课程搜索，也没有新建重复页面。侧栏和收藏卡片均提供课程与指定班次链接，使用收藏时已校验的课程、学期、校区与班次标识。未来若需要分享链接，可增加 `/syllabus/[code]` 详情页并继续复用这些组件。

完整独立大纲库可等多学期归档、跨班次比较或按教材反查课程成为明确需求后再增加；届时复用现有课程筛选组件，并将「有大纲」作为可组合筛选条件。当前没有创建该页面。

后续可增加正文版本差异、跨班次教材/评分摘录对比、未匹配记录核对界面，以及带二进制资产的完整离线归档。难度和工作量推断应与原文摘录分开标注，并提供来源位置。

## 滚动、更新时间与收藏提醒

大纲速览、可用列表、文档目录和清爽正文允许原生滚动接续；短内容和到达边界的容器不再阻断外层面板。官方 iframe 单独处理滚轮和单指触摸，仅将未消耗的滚动距离传给外层可滚动区域，保留缩放手势，并在课程面板边界停止，避免背景页面跟随。速览 Tab 只允许水平溢出，指示线放在容器内部。手机目录使用横向紧凑列表。

更新时间来自文档 `modifiedAt`，统一以 `America/New_York` 显示至分钟，含夏令时标识；备份时间、核验时间单独标注，缺少官方更新时间时显示「未提供」。索引没有更新时间，因此列表用两个并发任务逐份读取文档，和阅读器共享缓存。教师标签按每位教师的 OSU 身份分别查询 RMP，保持姓名、标签与收藏状态在同一行，不把合授教师评价混在一起。

`course-atlas:saved-syllabi:v1` 保存大纲身份、精简课程/班次快照、已确认版本与最近核验版本，不保存正文、座位实时状态或媒体。版本同时比较 `snapshotId` 和 `modifiedAt`。网站打开且可见时，每五分钟检查一次，返回页面时也检查；收藏区可手动重新核验。后台没有离线推送服务。官方失败、历史备份、身份不匹配或乱序响应均不能覆盖已有更新提醒。

新收藏以当时读取的版本作为基线；尚未读取正文时，首次官方核验建立基线。之后有更新，在导航、收藏分类和大纲卡片显示红点或标签。打开、关闭、刷新和选择「暂时保留提醒」均不清除提醒；只有显式选择「标为已读」且正在阅读最新官方版本时才确认该版本，防止阅读期间出现的新版本被误消除。

Dev Tools 使用当前模态容器的焦点范围和浏览器顶层 Popover，保持在课程弹窗、筛选导航及全屏阅读中可用。新增「教学大纲与滚动」分区，可手动检查收藏更新、导出版本状态和滚动区域几何信息；滚动诊断不导出正文。

浏览器回归：`node tests/syllabus/experience.browser.mjs`。可通过 `SYLLABUS_TEST_BASE_URL` 指定本地服务，使用已有的 `PLAYWRIGHT_MODULE`、`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指定浏览器环境；`SYLLABUS_TEST_OUTPUT` 指定截图和 PDF 目录。可选 `SYLLABUS_DOCUMENT_FILE` 读取本地保存的官方文档响应，额外检查真实字体、图片、链接和表格导出。固定夹具覆盖桌面滚轮、手机真实触摸、清爽阅读、教师标签归属、收藏直读、跨刷新通知保留、手动已读、课程班次链接，以及模态和导航中的 Dev Tools 点击与焦点。
