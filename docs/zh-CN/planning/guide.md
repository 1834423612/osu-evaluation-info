# 学期规划

[English](../../planning/guide.md) · 简体中文

从**个人工具 → 学期规划**打开 `/planning`。工作区包括学期规划、学业进度、四年示例、导入与报告。导入后直接生成可操作的规划，修改自动保存在当前设备，不再要求逐行审查或确认后才能保存。

## 通常准备两份报告

1. **Student Plan**：在 BDP 的 **Plan your Path** 中打印／导出计划，提供课程、学期位置、转学分及考试学分。
2. **Official · Expanded**：在 **Track Progress** 选择 Official，打开审核打印菜单，选择 Expanded（Beta），勾选 **Include all constraints**，包含所需项目，再将预览打印为 PDF，关闭浏览器页眉页脚。
3. 规划尚未申报的专业或未来课程要求时，增加 **Planned · Expanded**。先切换视图及目标计划，再导出。Expanded 不可用时，Standard 可提供概览；通常不需要 Compact 或重复打印件。

2026-11-16 对提供的 11 份 PDF 进行了比较。其中两份 Expanded 都是 Official 审核，标注“Only available in Planned View”的目标专业需要另一份报告。对于这组附件，有用的临时组合是 Student Plan + Official Expanded + Planned Standard；目标专业的完整条件更适合使用 Planned Expanded。

主导入按钮可以一次选择多个文件。PDF 类型和 Official／Planned 视图依据正文识别，文件名和所点击的上传卡片不会覆盖正文证据。三张文件卡片分别包含下载位置与打印说明。未标明视图但包含明确未申报专业完整要求的审核会识别为 Planned，其余无法确定的视图单独保留。申报状态、报告视图、Applied Version 和 Catalog Term 分别存储。

每批最多 12 个文件、60 MB。单份文本 PDF 最多 20 MB、100 页、30,000 行，处理时限 60 秒；JSON 备份最多 4 MB。不支持加密 PDF 或扫描件。单个文件失败会报告，不丢弃其他成功解析的文件；取消操作或迟到的结果不会覆盖较新的编辑。

## 在同一工作区排课和查看要求

看板按学年排列秋季、春季及可选夏季。电脑版支持拖动，触屏和键盘可使用移动选择器。可添加学年、在看板中搜索课程、点击虚线要求占位项寻找课程，并用具体课程替换占位项。侧栏包含剩余要求、搜索课程和推荐课程，手机使用抽屉。转学分和考试学分分别分组。

已完成或正在修读的明确证据会跨报告保护相同课程。审核中的可选课程不等于修读记录。Student Plan 提供学期位置，后续移动使用独立的位置覆盖。“学业进度”显示完整学业标题、嵌套要求、可选课程、数值条件和导出时的 BDP 状态。课程详情和先修引用在侧栏或弹窗中打开。本站操作不会重新计算官方 BDP 审核。

课程卡片通过现有匿名课程目录查询所选校区和学期的名称、学分及先修条件，仅发送公开课程标识及目录范围。重复查询共用有并发限制的队列和缓存，不改写历史导入学分。浮动学分保留范围，无法确定的学分显示待查询。BDP 原表学期总学分与当前规划估算分开标注。GE 占位项使用准确的目录属性筛选；不明确的课程族会提供目录中真实存在的版本，不编造课程编号。

专业标题显示目标专业的未正式注册状态，并支持隐藏和恢复。每学期使用自定义校区选择器，导入校区作为默认值，后续修改持续保存。空夏季学期可以收起。课程支持鼠标和键盘拖拽、减少动态效果设置及自定义移动菜单。进行中、计划、占位符、退课、退选、未通过和重修具有独立标签与图标。退课、退选和未通过记录不计入学期学分合计。

## 推荐课程

推荐排除已完成、正在修读的课程，即使另一份文件把同一门课标成 planned；也排除已经位于目标学期的课程。候选来自尚未满足的要求、已有未来计划和可选的官方样表。默认优先选择有可选课程的目标专业。学期、负担、样表和评价设置默认折叠，可调整学分上限，以及指定课程前缀的数量上限。

本地评分综合要求依据（结构已验证的规则 45 分，其他导入选项 15 分）、样表对应学年及季节（25 分）、其他样表学期（8 分）、已有计划（10 分）、课程评价（0–15 分）和记录冲突（−20 分）。包含暑期的样表按明确年级和季节匹配。评价采用 `(评分 × 回答数 + 3.6 × 20) / (回答数 + 20)`；缺失评分保持未知并使用中性排序基准，SEI 和 SSLE 不混合。查询评分需要主动操作，仅发送课程代码和校区。

算法在最多 60 个候选中保留 128 个束搜索状态，计算学分和前缀上限时包含目标学期已有课程，并降低同一要求替代选项的重复奖励。未知、浮动或冲突学分不进入自动受限组合；目标学期已有未知学分时，不宣称已得到有效总量，仍可逐门添加。这是排课启发式算法，不是完整先修、余位、时间冲突求解器或官方毕业审核，也不根据个人资料推断数学能力。

## 隐私和保存

PDF.js 在随应用提供的本地 worker 中运行。姓名、学号、邮箱、顾问字段、成绩、原始文件名及 PDF／原文不会进入保存或导出的规划。白名单保留学业标题和代码、状态依据、专业版本、数值要求、来源引用及位置覆盖。课程组合仍可能具有可识别性，备份属于私密数据。

处理后销毁 worker、清理行引用，并擦除仍由程序持有的输入缓冲区。JavaScript 字符串、垃圾回收和浏览器内部副本使程序无法保证安全擦除全部内存。不会删除 Downloads 中的原文件。

版本 2 模型读取时兼容升级版本 1 备份。本地键 `course-atlas:private-planning:v1` 与收藏隔离。浏览器存储未加密，保存失败会显示。点击**导出备份**下载 `course-atlas-plan.json`。已验证账号通过统一同步设置自动同步私密规划，学校邮箱验证账号还会自动提交去个人化的通用毕业要求模板。公开模板仅保留有明确可选项来源证据的课程。旧版未分类候选课程继续保存在私密备份中，重新导入报告后可建立公开可选项来源。原始 PDF 在本地处理。Umami 记录页面访问和白名单交互元数据，学业内容在回放中屏蔽，并从事件中排除。

`GET/PUT /api/planning/backup` 按账户隔离记录。行锁和递增版本检查保护不同设备的修改，相同内容重复提交具有幂等性。冲突后刷新并合并云端版本再保存。删除会清空规划，同时在账户存在期间保留版本，阻止旧设备恢复已删除的备份。本地编辑仍独立保存。

`POST /api/planning/templates` 保留专业及版本、要求层级、数值条件和课程选项，移除个人修读记录、来源标识、进度、排课位置及未匹配课程清单。内容哈希用于去重。记录标为 `user-submitted-bdp` 供后续参考，与已核验官方样表分别存储。

对已配置的账户数据数据库运行 `pnpm user-data:migrate --apply`，安装 `20261116_planning.sql`。私人记录存入 `osu_identity(_dev).planning_backup`，通用要求存入 `osu_planning(_dev).requirement_template`。既有用户数据备份命令包含这两个模式。账户维护会清理孤立的私人备份，通用模板独立保留。

## 公开样表覆盖范围

2026-11-16 的数据包含 **63 份示例、514 个学期安排、六个学院下 49 个专业／方向标签**。这不等于 63 个独立专业，覆盖仍不完整。

| 学院                        | 专业／方向来源条目 |
| --------------------------- | -----------------: |
| Arts and Sciences           |                 29 |
| Engineering                 |                 16 |
| Social Work                 |                  1 |
| Education and Human Ecology |                  1 |
| Nursing                     |                  1 |
| Public Health               |                  1 |

`data/planning/sample-sources.json` 是人工检查后的来源注册表，包含 49 个网页／PDF 来源及三个链接的 Word 原件。每项先记录网址、文件结构、版本依据及适配器，再进行自动更新。适配器保留明确学期、可选夏季、数学起点分支、替代课和占位项。数学专业课顺序、旧版 GEL 计划有独立标记，部分起点方案持续五年，页面显示实际学期数。仅列毕业要求或年度课程的文件不进入此样表库。广泛发现目录里的关键词和链接不代表已有可用课表。

保留来源差异：CIS BS／CSE 的 Word 与网页对 STAT 3470 学分记载不同；Materials Science 的文件名和印刷学年不一致；Environmental Public Health 二年级秋季印刷总量为 14 学分，但五个课程条目相加为 17。原表总量和课程数值分别保留，不暗中修正。不编造未知的 Applied Version。提取结果的学业适用性认证仍为 pending。

## 更新和归档

需要 Node 24+、Python 3、curl 和已安装的项目依赖。

```sh
pnpm planning:refresh
pnpm planning:refresh --apply
pnpm planning:refresh --refresh --apply
pnpm planning:refresh --apply --archive-local .planning-cache/public-db
pnpm planning:archive status --local .planning-cache/public-db --apply
pnpm planning:archive backup .planning-cache/new-backup.tar.gz --local .planning-cache/public-db --apply
pnpm planning:refresh --discovery --limit 100 --delay 2 --apply
pnpm planning:subjects --term 1272
```

不带 `--apply` 时只打印计划命令。默认公开缓存位于 `.planning-cache/samples`，可用 `--cache` 指定其他目录。来源验证哈希，保留变更版本，版式不符时停止生成。产物为 `data/planning` 下的 `curricula.json` 和 `sample-directory.json`。广泛发现的实验候选写入其缓存，不替换样表库。未安装定时任务。

仅接受 OSU 公开 HTTPS 域名。拒绝凭据、身份／登录域名及任意查询参数，唯一例外是有长度限制的公开 PDF VersionId。检查 robots、重定向和公开 DNS；下载上限 8 MB，限制超时和重定向次数，按来源限速，默认两秒、最少一秒。部分公开 Drupal 页面的传输拒绝可通过有界匿名 curl 重试处理，忽略 curl 配置且不跟随重定向。禁止复用 HAR 请求头、cookie、学生会话或合作方令牌。

使用独立 schema：`osu_planning_dev` 和 `osu_planning`；`PLANNING_SCHEMA` 可指定该领域内的隔离名称。PostgreSQL 优先使用 `PLANNING_DATABASE_URL`，未设置时使用 `DATABASE_URL`，所有表均带规划 schema 全名。

| 表                 | 保留的数据                                   |
| ------------------ | -------------------------------------------- |
| source_document    | 不可变的公开 URL、哈希及获取身份             |
| source_asset       | 哈希验证的原始公开文件、提取内容及元数据     |
| source_extraction  | 不可变解析版本及带坐标的文本                 |
| directory_snapshot | 带日期的覆盖快照                             |
| curriculum_version | 独立的来源、解析器、方案分支版本及适用元数据 |
| template_seed      | 经过审核的要求输入，等待运维发布审核         |

归档事务可重复执行，唯一标识不会静默覆盖其他方案。解析变化使用新版本。备份只能写入不存在的新文件并限制权限，PGlite 恢复使用一次性数据库验证；这些测试不等于原生 PostgreSQL 部署、连接及恢复已验证。公开 PDF 中不能写入 jsonb 的 NUL／孤立代理字符按明确策略替换为 U+FFFD，原文件和哈希保持不变。

## 验证与限制

参见[测试说明](../testing.md)。本地私密回归覆盖 11 份 PDF、71 页，只读取离线 HAR 的**响应 JSON**，不会回放请求、cookie 或请求头。仓库不包含真实私密附件 fixture。

| 版式         | 文件数 | 课程候选数 | 已知／未知学分 |
| ------------ | -----: | ---------: | -------------: |
| Student Plan |      1 |         19 |         15 / 4 |
| Standard     |      4 |        158 |        98 / 60 |
| Compact      |      4 |         72 |         0 / 72 |
| Expanded     |      2 |        168 |       46 / 122 |

合并后的名单包括八门已完成、六门正在修读、五项计划记录。15 个无歧义的名单交集与 HAR 的状态和学分一致；七个学期交集的位置及学分一致。可比较的要求父子关系在 Expanded 中为 28/28，Planned Standard 为 65/65，Official Standard 为 8/8。这些是交集检查，不代表完整审核召回率；HAR 有一些所提供 PDF 视图中没有的要求。最低成绩、GPA、驻校学分、替代规则和全部逻辑条件尚未完整求值。学业标题可能保留所需 GPA 门槛，但不保留学生实际 GPA。

浏览器验收覆盖真实文件自动导入、目录学分、占位项替换、同页详情、移动后恢复及响应式布局。自动测试覆盖隐私白名单、状态合并、要求树、推荐排除、公开版式、不可变归档事务及备份恢复。独立 Playwright 脚本与交互式浏览器验收分开维护，运行前提及执行状态以测试报告为准。

## 数据库发布与跨环境备份

运行时 `/api/planning/curricula` 从 PostgreSQL 读取最新的不可变 `catalog_release`。每个版本包含完整学期模板、目录证据、学科词表和来源元数据。仓库 JSON 用于管理员发布导入。数据库不可用时返回 503。开发环境默认 `osu_planning_dev`，生产环境默认 `osu_planning`。

```sh
node --env-file-if-exists=.env.local scripts/planning/database.mjs init --apply
node --env-file-if-exists=.env.local scripts/planning/database.mjs publish --apply
NODE_ENV=production node --env-file-if-exists=.env.local scripts/planning/database.mjs init --apply
NODE_ENV=production node --env-file-if-exists=.env.local scripts/planning/database.mjs publish --apply
```

发布先校验全部输入，再原子写入一个版本，重复发布相同内容会去重，历史版本完整保留。Schema 备份包含发布表。更新并核对模板后重新执行发布。成功读取具有一分钟进程缓存和五分钟 HTTP 缓存。

点击**导出备份**可保存完整脱敏规划 JSON。**导入备份**先预览校验后的文件，点击**恢复此备份**后通过统一的本地保存与账号同步流程替换当前规划。跨数据库环境保留 ID、校区、课程组、班次选择和模拟偏好，重复导入同一备份保留原有标识。恢复窗口也提供备份当前规划的操作。文件上限为 4 MB，旧版 schema 1 自动升级。
