# 学期规划

[English](../../planning/guide.md) · 简体中文

从“个人空间 → 学期规划”打开 /planning。默认显示“我的规划”，顶栏提供“导入与来源”“学业要求图”“下学期推荐”和“四年示例课表”。进入页面时会恢复当前浏览器保存的工作区。

## 推荐上传的 PDF

通常从两份报告开始。

- **Student Plan** 从 Plan your Path 导出，提供课程、学期安排、转学分与考试学分组。
- **Official · Expanded (Beta)** 从 Track Progress 获取当前正式专业的详细审核，展开相关项目与详情，打印时关闭浏览器页眉页脚。
- 规划其他专业或未来课程时，增加 **Planned · Expanded**，在导入指引中选择对应报告视图。

2026-11-16 重新读取了提供的全部 11 份 PDF。其中两份 Expanded 都是 Official 内容，期望专业显示“Only available in Planned View”。现有 Planned Standard 提供专业要求概览，完整条件仍需补充 Planned Expanded。因此现有附件可以先使用 Student Plan + Official Expanded + Planned Standard 三份。Standard、Compact 从两处导航导出的副本重复学术内容，第二份 Expanded 增加浏览器页眉页脚，这些副本无需重复上传。

Official/Planned 表示报告视图，declared/undeclared 表示项目声明状态。专业代码、Applied Version、Catalog Term、发布年份和 GE 体系分别保存。Applied Version 对应 SIS 中专业或方向的要求学期。[Registrar 说明](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)

## 本地导入与核对

一次最多选择 12 个 PDF/JSON 文件、合计 60 MB。每份文本 PDF 上限为 20 MB、100 页、30,000 行、60 秒，JSON 备份上限为 4 MB。目前支持文本层 PDF，扫描件与加密 PDF 尚不支持。版式识别使用内容和临时文件名提示。失败或取消的批次保留原草稿。

每份文件独立保留版式、报告视图和浏览器打印来源。审核中的课程选项、Student Plan 课程记录、转学分、考试学分、占位项、学期总学分和未知学分分别处理。Planned 标签无法独立证明是否注册。空白学分保留未知值，冲突保留来源引用。成绩、例外说明、GPA 条件和私人备注原文暂未持久化。

来源编辑支持专业与版本修正、要求层级、all/any/数值条件及课程分配确认。推断层级初始需要核对。保存到设备或导出私人 JSON 前，需要确认全局审核勾选框，后续编辑会取消该确认。载入或替换非空草稿前会确认，未保存编辑受站点共享草稿保护。一个工作区可以保存多个来源，恢复 JSON 仍经过白名单处理并要求重新核对。

## 排课看板与学业要求树

桌面可拖动课程，也可用移动下拉菜单进行键盘或触屏操作。“学期设置”可添加学期，搜索框按课号筛选已有课程。课程搜索、推荐、要求树和课程详情共用右侧面板，窄屏使用抽屉或对话框并保留目标学期选择。重复添加复用已有计划课程，移动单独保存位置覆盖。其他来源中的已完成、进行中及转学或考试记录会保护同课号的计划行。

课程名称、学分范围和先修原文通过现有匿名课程目录查询，按校区和目录学期区分缓存。请求仅包含公开课程标识，共享队列合并重复查询、限制并发并支持重试。查询失败时使用来源学分或显示待查询状态。浮动学分显示范围，在固定数值明确前不加入自动组合。原始修读或导入学分保留在来源核对中，学期合计为规划估算，未明确与冲突项目单独标示。

课程详情保留完整先修原文，并提供包括省略前缀课号的跳转引用。当前引用导航尚未计算完整先修逻辑。班次与评价入口保留在详情面板中。

要求树按来源、专业和版本分组，可折叠、查看候选课并添加到目标学期。已核对数值规则区分已完成覆盖、计划覆盖、覆盖不足与待核对。计划课程保持计划状态，冲突和未确认层级保持未解决。数值匹配无法独立判断最低成绩、替代规则、校内修读、GPA 或全部毕业条件。

## 下学期推荐

选择专业快照、当前与未来目标学期、学分上限、可选官方示例及年级，以及指定课程前缀的数量上限。MATH、STAT、PHYSICS、CHEM、CSE 等前缀可以编辑。偏好由用户选择。

候选来自要求选项、已有计划课程和所选公开示例。已完成与进行中记录用于排除重复，冲突保留可见。

| 依据                     | 分值 |
| ------------------------ | ---: |
| 已核对且未满足的要求选项 |   45 |
| 未核对的要求选项         |   15 |
| 匹配示例年级与季节       |   25 |
| 示例中的其他学期         |    8 |
| 已有计划记录             |   10 |
| 评价部分                 | 0–15 |
| 来源冲突                 |  −20 |

评价收缩公式为 (score × responses + 3.6 × 20) / (responses + 20)，再将 1–5 映射为 0–15。缺失评分保持未知并使用中性排序基准，SEI 与 SSLE 分开处理。推荐评分在选择“为前 24 门加载评分”后加载，目录元数据查询也可能通过现有目录服务返回评价。

最多 60 个候选的 128 状态 beam search 先计入目标学期已有课程，再生成满足学分与前缀数量上限的新增组合，并降低重复满足同一要求选项的奖励。它是启发式算法，无法保证最优解或学位适用性。仅由其他示例学期支持的课程、未知或冲突学分不进入自动组合。目标学期已有的未知或浮动学分需先明确，才能计算符合上限的追加组合。应用推荐保留原始来源，复用已有计划记录，仅为新增课创建手动记录。

评分请求仅包含公开课号、校区和空教师数组。实际班次、座位、时间冲突与先修资格仍需在目录及顾问处核对，系统不执行注册。

## 隐私与种子

PDF.js 使用本地打包的 worker。原文件、原文、文件名、姓名、学号、联系方式、顾问和成绩不写入保存或导出内容。解析后销毁 worker、清除行引用，在缓冲区未转移或分离时进行覆写。JavaScript 字符串、垃圾回收和浏览器内部副本使彻底内存擦除无法得到保证。

版本 2 白名单保存枚举来源、本地标识、专业代码与版本、学期、课号、学分、数值规则候选、确认分配和位置覆盖。版本 1 备份读取时升级。存储键 course-atlas:private-planning:v1 独立于收藏、账号同步及公开分享。浏览器存储未加密，可能失败或被清除，课程组合仍可能识别个人。导出的 JSON 属于私人信息，下载副本需要单独管理。

规划页面关闭第一方统计与回放内容采集，并清理之前加载的录制器。正常账号、会话与资源请求仍可能发生。私人规划云同步和公开投稿端点尚未实现，收藏同步不包含规划。

“导出要求模板”需要明确选择专业、确认工作区审核、填写专业代码与 Applied Version，并核对规则层级。模板仅导出重新映射的数值规则和课程选项，排除实际修读课程、学期、分配、声明状态、剩余学分与原始来源标识。种子归档保持待审状态，不会自动发布。

## 公开示例覆盖与适配器

2026-11-16 检查的当前图库有 **7 个专业方向、8 份示例、64 个学期**，包括 CIS BA、CIS BS、CSE BS、两份 Molecular Genetics、Earth Sciences Geophysics、Earth Sciences Climate/Water/Environment 和 Actuarial Science。当前覆盖限于上述方向。历史发现档案保留在目录 API 和显式探索工具中。

`data/planning/sample-sources.json` 在编写适配器前记录人工检查的 URL、下载链接、文件结构与排除原因。默认刷新只沿这份登记表下载七份 HTML/PDF 来源及三份 Word 原件。HTML/PDF 原件和结构化版本存入规划数据库，Word 原件及哈希保留在公开下载缓存。每个适配器要求八个非空学期，版式变化时停止更新。

CIS BA 使用带标题的 Course/Hours 表，CIS BS 和 CSE BS 使用 Autumn/Spring 双列与合并 Year 标题，Molecular Genetics 使用年级季节标题及列表。Earth Sciences 使用 Year/Autumn/Spring 网格，并将项目符号选项保留为一个选择组。Actuarial Science 使用 PDF 第二页的年级与双列结构。选修项、不完整课号、条件学分和原表总数保持可见，条件排除项不生成添加课程按钮。Fisher Information Systems 的要求清单缺少八学期安排，因此未进入示例图库。

CIS BS 和 CSE BS 下载版把 STAT 3470 记为 4 学分，网页示例记为 3 学分。图库明确标示网页来源和差异，排课卡片查询课程目录。Actuarial PDF 页脚修订日期为 2/11/2025，文件名仍含 2024。未知 Applied Version 与适用范围保持未设置，结构化提取审核状态保持待审。

## 更新与数据库

环境需要 Node 24+、Python 3、curl 和仓库依赖。

```sh
# 预览已检查来源的处理流程。
pnpm planning:refresh
# 下载登记来源、提取 PDF、生成分学期示例。
pnpm planning:refresh --apply
# 重新请求来源并保留变更版本。
pnpm planning:refresh --refresh --apply
# 同时归档到隔离的嵌入式 PostgreSQL。
pnpm planning:refresh --apply --archive-local .planning-cache/public-db
# 显式启动原有广泛探索流程。
pnpm planning:refresh --discovery --limit 100 --delay 2 --apply
pnpm planning:subjects --term 1272

pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:archive seed program-requirements.json --local .planning-cache/public-db --apply
```

已检查来源默认缓存为 `.planning-cache/samples`，可用 `--cache <directory>` 指定其他公开缓存。下载或解析失败时保留上一份生成结果。定向来源清单为 `data/planning/sample-directory.json`。广泛探索默认使用 `.planning-cache` 和既有目录格式，实验性候选写入 `<cache>/discovery-curricula.json`，独立于已检查的示例图库。目前未安装定时任务。

仅接受公开 HTTPS osu.edu 和 ohio-state.edu URL。拒绝凭据、身份登录域与任意查询参数，公开 PDF 的有界 VersionId 为例外。检查 robots、每次重定向和公共 DNS，单次下载最多 8 MB，超时与重定向有界，请求默认间隔两秒、最低一秒。部分公开页面的 urllib 传输返回 403 时，可使用默认 curl 匿名重试，关闭 curl 配置读取且不跟随重定向。失败保留在检查点，禁止复用 HAR 请求头、学生 Cookie、个人会话或合作方令牌。

开发命名空间为 osu_planning_dev，生产为 osu_planning。PLANNING_SCHEMA 可指定同域隔离名称，表访问统一使用命名空间辅助函数。

| 表                 | 保存内容                               |
| ------------------ | -------------------------------------- |
| source_document    | 公开 URL、哈希与获取身份               |
| source_asset       | 哈希校验后的原始字节、提取和分类元数据 |
| source_extraction  | 不可变解析器版本、坐标文本与提取时间   |
| directory_snapshot | 有日期的来源与覆盖快照                 |
| curriculum_version | 专业或示例版本、适用范围、审核元数据   |
| template_seed      | 待审的纯要求模板                       |

原生 PostgreSQL 使用独立 PLANNING_DATABASE_URL，先初始化，再归档，禁止从课程或账号配置推断连接。事务失败回滚，相同 ID 为不可变空操作，不同 ID 的来源/专业/版本冲突会失败。修改证据或审核信息需要新 ID 与版本。批准要求审核者、审核日期和来源验证日期。版本默认全部保留。

嵌入式备份仅写入新文件并限制权限，可用 PGlite loadDataDir 在临时库恢复。原生 PostgreSQL 使用 node scripts/planning/database.mjs backup <new-file> --apply 与 pg_restore，连接、部署和恢复尚未在本环境验证。账号备份不包含规划域。

## 验证与边界

测试入口见[测试清单](../testing.md)。研究覆盖 11 份私人文本 PDF、71 页及十张截图。此前仅离线对照 HAR 响应 JSON，本轮 PDF 回归未读取 HAR。私人附件未进入仓库。

| 版式         | 文档数 | 课程候选 | 已知 / 未知原始学分 | 修读学期 |
| ------------ | -----: | -------: | ------------------: | -------: |
| Student Plan |      1 |       19 |              15 / 4 |        2 |
| Standard     |      4 |      158 |             94 / 64 |        0 |
| Compact      |      4 |       72 |              0 / 72 |        0 |
| Expanded     |      2 |      168 |            46 / 122 |        0 |

Standard 产生 368 个规则候选与 238 个分配候选，Expanded 为 78 与 162。这些是提取统计，无法代表语义准确率、毕业总学分或一般召回率。此前 HAR 对照有 74 个 JSON 响应，七个无歧义重叠记录的学分与年份一致，一个明确 Planned 状态一致。注册状态保持未知，要求树的语义精确率与召回率仍未测量。

附件全部有文本层，OCR 尚未实现。2026-11-16 全量 Node 测试共 588 项，通过 559 项，跳过 29 项，失败 0 项。生产构建、TypeScript、ESLint、CSS 和双语文档检查均通过。针对性回归覆盖导入隐私、目录请求白名单、来源保留、锁定修读记录、推荐上限、示例选项、数据库事务与备份恢复。

浏览器验收使用隔离本地生产构建和合成数据。五个页面在中文 320/390/768/1440 和英文 390/1440 宽度下均无横向溢出。已验证公开目录搜索、添加与查看课程、触屏学期移动、要求抽屉、保存及自动恢复。已有 11 学分的学期追加一门 4 学分课后保持 15 学分上限，八份示例均提供八学期布局与来源差异说明。更新后的独立浏览器脚本完成语法检查，本次验收未执行该脚本。

公开 PDF 提取中不兼容 PostgreSQL jsonb 的 NUL 或孤立 UTF-16 字符按明确策略替换为 U+FFFD，原件与哈希保持一致。提取缓存按内容哈希与解析器版本复用，不支持的文档保留原因。
