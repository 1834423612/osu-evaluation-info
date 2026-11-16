# 学期规划

[English](../../planning/guide.md) · 简体中文

从 **你的空间 → 学期规划** 打开 /planning。五个视图分别为导入与核对、学期看板、学业要求图、下学期推荐和官方培养方案。

## 私人导入与核对

一次最多选择 12 个 PDF/JSON，总计不超过 60 MB。单份文本 PDF 上限 20 MB、100 页、30,000 行和 60 秒；JSON 备份上限 4 MB。不支持扫描件和加密 PDF。自动识别使用内容和暂时性的文件名提示。批次失败/取消不会部分替换草稿。

建议先导入 Student Plan，再追加 Official 与 Planned audit。各文件独立保存版式、报告模式和打印来源。Official/Planned 是报告模式，declared/undeclared 是各项目声明状态，均不能证明注册或学位资格。项目代码、Applied Version、Catalog Term、出版年和 GE 独立保存。Applied Version 来自 SIS plan/subplan 要求学期，参见 [Registrar 说明](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)。

逐项核对原文。Audit 替代项是可选课程，不是已修证据。规划记录、转学/考试学分、占位、学期报告总分和未知学分独立保留。空白/横线不会转成零，也不按总分反推。冲突保留来源。成绩、例外原文、GPA 条件和个人笔记不保存。

来源编辑器支持项目/版本、要求层级、all/any/数值条件和明确确认的分配。推断层级初始为未核对。确认工作区审核后才能本地保存或导出私人 JSON；编辑使审核失效。载入/替换非空草稿前确认，未保存内容使用共用导航保护。一个工作区可包含多个来源。恢复 JSON 同样经过白名单，并需重新确认审核。

## 看板与要求图

桌面拖放及原生移动选择器支持鼠标、键盘和触屏。可新增 Autumn、Spring、Summer 学期，按来源/前缀筛选。排课覆盖独立于原始学期/页码。已完成课、audit 可选项和转学/考试组不可拖动。总分是去重后已知课程记录的下界，未知项另列，不是毕业总分。

要求图按来源/项目/版本显示可折叠分支。已核对数值条件区分已完成、计划覆盖、不足及待核对；计划课不算已完成。冲突及未核对层级保持未知。数值匹配不能证明最低成绩、替代、居住学分、GPA 或全部毕业条件。课程链接复用现有目录/评价/session 视图。

## 下学期推荐

选择项目快照、当前及更晚的目标学期、学分上限、可选官方样表/年级，以及可编辑前缀（如 MATH STAT PHYSICS CHEM CSE）的课程数量上限。这些是用户偏好，不推断数学能力或残障情况。

候选来自要求选项、计划记录及所选公开样表。一致的已完成/进行中记录排除重复，冲突仍可见。

| 依据                       | 分值 |
| -------------------------- | ---: |
| 已核对且未完成要求的可选课 |   45 |
| 未核对要求候选             |   15 |
| 对应样表年级/季节          |   25 |
| 样表其他学期               |    8 |
| 已有计划记录               |   10 |
| 评价分量                   | 0–15 |
| 记录冲突                   |  −20 |

评价使用 (评分 × 回答数 + 3.6 × 20) / (回答数 + 20) 收缩，再从 1–5 映射到 0–15。缺失评价使用中性排序基准，仍标未知。现有评价服务每次提供一种工具，SEI 与 SSLE 不混合。

束搜索最多处理 60 门候选、保留 128 个状态，在学分/前缀限制内组合，降低同一要求替代项的重复奖励。启发式算法不保证全局最优或毕业适用性。仅在样表其他学期出现、且无个人计划/要求依据的课程不进自动组合。未知/冲突学分不进自动组合，但可逐门加入待核对草稿。加入建议保留原始来源，建立/复用手动记录。待审核样表可能省略课程或适用另一要求学期。

只有点击 **查询前 24 门的评分** 才发送请求，内容仅含课程代码、校区和空教师数组，不含私人 ID、项目/版本、学期、成绩或状态。课程链接通过目录发送所选查询。先修、实际 session 开课、余位及时间冲突仍需查目录/顾问；不执行注册。

## 隐私与种子

使用应用内 PDF.js worker 本地解析。原始文件/文本、文件名、姓名、学号、联系信息、顾问和成绩不保存/导出。结束后销毁 worker、清空行引用，并尽力覆写未被转移的输入缓冲区。JavaScript 字符串、垃圾回收及浏览器内部副本无法保证彻底安全擦除，产品不作此保证。

版本 2 白名单保存枚举来源、本地 ID、项目代码/版本、学期、课程代码、学分、数值要求候选、确认分配和排课覆盖。读取时升级版本 1。存储键 course-atlas:private-planning:v1 与收藏/账户同步/公共交换分开。浏览器存储未加密，可能失败或清空。课程组合仍可能识别个人。JSON 仍是私人信息，下载文件需另行删除。

规划页抑制第一方分析及回放内容，入口销毁此前加载的记录器。正常账户/session/资源请求仍可能发生。当前无私人规划上传、云同步或公共投稿接口。未来云备份需单独设计明确授权、按账户隔离的流程，收藏同步不会上传规划。

**导出要求模板** 需逐项目明确勾选、工作区审核、项目代码/Applied Version 及已核对层级。仅下载重新映射的数值规则/课程选项，不含个人课程、学期、分配、声明、剩余学分或来源 ID。运维种子归档将其标为 pending；用户模板不会变成官方来源或自动发布。

## 公开覆盖与适配器

[官方按学院专业索引](https://undergrad.osu.edu/majors-and-academics/majors-by-college) 提供 14 个学院、151 个发现条目，不等于所有学位变体、校区或历史版本的全集。

2026-11-16 检查点：**2,061 个已下载来源版本；858 个包含课程引用；120/151 个索引条目关联引用；199 个受阻/失败 URL；674 个未访问链接；11 份八学期候选；零份人工批准方案。** 覆盖仍不完整，关联/引用不等于已提取完整培养方案。

筛选包括学院/专业、类型、学年、明确要求学期及 GE。详情显示官方链接、哈希、日期、版本依据、引用及支持的学期预览。未知适用时间保持未知。API 分页，完整课程列表按需读取。

归档保存原始公开 HTML/PDF 和哈希。引用识别使用匿名目录观测的 242 个官方前缀/名称。严格适配器处理明确八学期 HTML 标题/网格及支持的 PDF 列，数学专业支持居中年级及成对总分。替代课保留原文依据。不支持的版式、三年联合项目、歧义学分和脚注不会强转八学期。提取不等于批准。

## 运维与数据库

仓库根目录需 Node 24+、Python 3 和依赖：

```sh
# 仅预览，不加 --apply 不请求网络/写数据库。
pnpm planning:refresh --limit 100 --delay 2
# 采集 → PDF 文本 → 索引 → 待核对候选。
pnpm planning:refresh --limit 100 --delay 2 --apply
# 刷新最久未检查的来源，保留旧版本。
pnpm planning:refresh --refresh --limit 100 --apply
# 明确重试失败链接。
pnpm planning:refresh --retry --limit 100 --apply
# 指定学期后更新前缀词表。
pnpm planning:subjects --term 1272

# 独立嵌入式 PostgreSQL；去掉 --apply 预览。
pnpm planning:archive init --local .planning-cache/public-db --apply
pnpm planning:archive archive data/planning/directory.json --local .planning-cache/public-db --apply
pnpm planning:archive curricula data/planning/curricula.json --local .planning-cache/public-db --apply
pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:archive seed program-requirements.json --local .planning-cache/public-db --apply
```

缓存位于其他位置时传 --cache <public-cache>。刷新也支持 --archive-local <directory> --apply，在转换后初始化并归档。当前未安装定时任务；经检查的任务执行器可调用有界流水线，保留检查点并检查覆盖/pending 清单。

仅允许公开 HTTPS osu.edu 和 ohio-state.edu。拒绝含凭据 URL、身份/登录站点和任意查询，唯一例外为有界公开 PDF VersionId。逐跳检查 robots/重定向，DNS 须为公网，下载上限 8 MB，限制超时/跳数，逐域限速（默认两秒、至少一秒）。拒绝/失败保留 pending。不得复用 HAR 头、学生 Cookie、个人登录态或合作令牌。

开发域 osu_planning_dev，生产域 osu_planning；PLANNING_SCHEMA 可指定该域下的隔离名称。全部表通过专用 helper 访问。

| 表                 | 保存内容                             |
| ------------------ | ------------------------------------ |
| source_document    | 不可变公开 URL/哈希/获取标识         |
| source_asset       | 校验后的公开原文件、提取及分类元数据 |
| directory_snapshot | 带日期的发现/覆盖快照                |
| curriculum_version | 独立项目/样例版本、适用及审核信息    |
| template_seed      | 仅要求规则的模板，待运维核对         |

PostgreSQL 去掉 --local，仅配置专用 PLANNING_DATABASE_URL，不推断课程/账户配置。先初始化再导入。失败事务回滚，相同 ID 不变；其他 ID 与来源/项目/版本冲突时失败。变更证据/审核需新 ID 和版本。批准需审核人/日期/来源验证日期，草稿要求不可成为权威批准版本。保留全部版本，不自动删除。

嵌入式备份仅写不存在的新文件并限制权限，可用 PGlite loadDataDir 在一次性数据库恢复。原生 PostgreSQL 备份使用 node scripts/planning/database.mjs backup <new-file> --apply，恢复用 pg_restore。账户备份不含此域。本次未验证原生 PostgreSQL 连接、部署或恢复。

## 验证与边界

参见 [测试说明](../testing.md)。研究包括 11 份私人文本 PDF（71 页）、十张截图及仅离线 HAR 响应 JSON。未使用 HAR 请求/Cookie/头，未提交私人 fixture。

| 版式         | 文件数 | 课程候选 | 已知 / 未知学分 | 出勤学期 |
| ------------ | -----: | -------: | --------------: | -------: |
| Student Plan |      1 |       19 |          15 / 4 |        2 |
| Standard     |      4 |      158 |         94 / 64 |        0 |
| Compact      |      4 |       72 |          0 / 72 |        0 |
| Expanded     |      2 |      168 |        46 / 122 |        0 |

Standard 有 372 个要求/238 个分配候选，Expanded 为 78/162。这是提取数量，不是语义准确率、毕业总数或通用召回率。HAR 有 74 份 JSON，七个无歧义重叠记录的学分/年份一致，一个明确计划状态一致；注册仍未知。九份要求树/九份 audit 无可靠语义映射，未测精确率/召回率。

附件全部有文本层，未加入 OCR；未来需验证本地栅格化、受限 worker/WASM、准确率及手机内存。

2026-11-16 自动检查：Node 共 575 项，546 通过、29 跳过；主 Python 99 项，两项跳过；规划 Python 13 项通过。隔离 PGlite 验证原始字节、重复导入、唯一版本、回滚及恢复。最终 UI 核对后补记浏览器验收；独立浏览器脚本仅供复现场景，不代表本次执行。
