# 学期规划

[English](../../planning/guide.md) · 简体中文

打开**我的空间 → 学期规划**（`/planning`），选择 Student Plan、Standard Audit、Expanded Audit (Beta) 或 Compact Audit，并指定 BDP 导出或浏览器打印。推荐先导入 Student Plan，再单独核对 Planned Standard；Expanded 可补充约束背景。每次导入是独立快照，不会自动合并。替换前请导出当前草稿。

## 本地流程

1. 选择不超过 20 MB、100 页的文本 PDF。暂不支持加密或扫描文件。由随应用打包的 PDF.js worker 在本地提取，不向外部 PDF 服务发送文件。
2. 对照原文件逐项检查候选。可修改学科、课号、学分、类型和来源状态，删除错误行，补充课程及学期。空白学分表示未知。学期格式为 `Autumn2026`、`Spring2027` 或 `Summer2027`。
3. 将 Applied Version（如 `AU2017`）与 Catalog Term 分开。Applied Version 来自 SIS plan/sub-plan 要求学期，不是 PDF 发布日期或入学年份。不同要求可能使用不同版本，冲突版本保持未知。
4. 确认审核后，在当前浏览器保存或导出结构化 JSON。修改字段会取消审核状态。当前浏览器仅保存一个快照；载入或导入替换非空草稿前会确认。删除本地规划会移除该快照并清空草稿，导出的文件需自行删除。

课程链接复用已有课程搜索、详情与评价入口。打开课程会通过现有搜索流程发送所选课程查询，不包含 PDF 或其他规划内容。

## 解释边界

这是候选提取和规划编辑器，不是毕业审核、先修约束求解器、注册系统或课表冲突检查器。尚未验证所有 BDP 输出。版式研究仅覆盖一名学生的导出族；仓库不含私人附件及其原文。自动化测试使用合成数据。

Standard 和 Expanded 审核可能在多个要求节点重复列出课程。候选仅在同一提取分组中去重，不计算累计审核学分，也不合并剩余学分。审核文件的课程学期保持未分配。Compact 双栏版仅有限支持；浏览器打印顺序也不受信任，保持未分配。转学分和考试学分未经核对不能当作普通上课学期。未知格式可能无法提取候选，此时需手动输入。原始要求、详细约束、例外和成绩不导入。

有课号也可能是占位项。PDF 的 “Planned” 不证明尚未注册。学期总学分 13 不能确定标为 `-` 的占位项学分，未知仍为空。课程候选和来源总学分分别保存。请与顾问确认学位要求及注册情况。

## 隐私边界

原始文件、文件名、姓名、学号、联系方式、顾问信息、成绩、自由备注及提取原文不保存、不导出。处理完成后释放提取内存并销毁 worker。私有数据模型仅允许枚举来源信息、学期、课号、学分、页码和审核状态；保存时剔除未知字段。浏览器存储可能失败或被清除，请按需导出备份。本地存储未加密，能访问浏览器配置或运行同源脚本的人仍可读取。

删除姓名后，课程组合仍可能识别个人。JSON 是私人信息，不是匿名公共数据集。当前没有贡献或公开分享接口。将来的公共样本库必须采用独立、明确选择加入的流程与服务端白名单，不能把私有快照直接转成公开种子。

规划页面禁止第一方事件及分析载荷，规划内容屏蔽会话回放，导航入口执行整页跳转以销毁已加载的录制器。原始 PDF、提取全文和身份信息不发送到诊断。网站现有账号会话和资源请求仍可能独立发生；“PDF 本地处理”不意味着整个网站没有网络请求。

## 官方培养方案目录

当前仓库包含 8 个来源入口、1 份待人工复核的分子遗传学结构化样例，人工审核通过的结构化方案为 0。并未覆盖全校专业。按学院分类的专业索引仅是发现基准，不是培养方案 API。项目、部门和分页搜索结果不能视作同一个全集。历史版本可能不完整或仅顾问可见。

来源记录、培养方案版本与私有规划分离。每个版本保留来源 URL、SHA-256、抓取和验证日期、文档类型、专业、方向、校区、GEN/GEL、适用范围、证据、学分区间和审核状态。未知适用范围保留 null。样例规划不能提升为正式要求。结构适配器目前仅支持分子遗传学 HTML，保留备选方案证据供复核，未识别到八个学期则拒绝结构化。仓库预览将原文压缩为课程代码事实，未完整复现脚注；使用前必须核对来源。其他格式保持待审。

官方参考：

- [按学院分类的专业索引](https://undergrad.osu.edu/majors-and-academics/majors-by-college)
- [分子遗传学培养方案样例](https://molgen.osu.edu/sample-curriculum)
- [Registrar：BDP 要求学期](https://registrar.osu.edu/buckeye-degree-planner/advisor-guide/requirement-terms-in-bdp/)

## 运维与架构

浏览器使用 `src/lib/planning/model.ts`、`parser.ts`，通过 `pdf.ts` 按需加载 PDF.js。私有存储键为 `course-atlas:private-planning:v1`，独立于收藏、账号同步和公开交换。没有私有规划后端。

公共培养方案在生产使用 `osu_planning`，开发使用 `osu_planning_dev`。`PLANNING_SCHEMA` 允许以 `osu_planning_` 开头的隔离名称。`source_document` 保存不可变来源标识；`curriculum_version` 保存明确的样例/要求版本和审核信息。SQL 均通过专用命名空间解析。该独立域自行初始化、备份并永久保留版本，账号备份不包含它。

在仓库根目录运行：

```sh
# 仅公开网络请求，不使用凭据；仅写本地缓存。
python3 scripts/planning/sync.py --delay 2 --limit 8
# 恢复发现；--refresh 才重新访问已下载来源。
python3 scripts/planning/sync.py --delay 2 --limit 20
# 仅本地转换，所有候选保持待审。
python3 scripts/planning/structure.py
# 输出操作计划，不连接 PostgreSQL。
node scripts/planning/database.mjs init
node scripts/planning/database.mjs retention
# 配置隔离的 PLANNING_DATABASE_URL 后，显式执行：
node scripts/planning/database.mjs init --apply
node scripts/planning/database.mjs import <candidate.json> --apply
node scripts/planning/database.mjs backup <new-backup.dump> --apply
```

先使用可丢弃的 PostgreSQL 数据库和测试凭据。规划数据库命令仅需 `PLANNING_DATABASE_URL`；本地编辑、解析测试、lint、typecheck 和 build 不需要生产凭据。既有可选服务仍参考 `.env.example`。禁止用学生 cookie、HAR 凭据、partner API token 或登录会话发现来源。不得提交私人附件、HAR 或学生提取原文。

抓取器仅允许公开 HTTPS `osu.edu` 域，拒绝凭据、查询字符串及自动重定向，检查 robots，请求间隔至少 1 秒（默认 2 秒），下载上限 8 MB，并原子保存恢复点。请求失败、robots 不允许和未知格式保持待审。刷新时缓存保留先前版本，不自动发布或猜造要求。分别检查 `state.json` 的发现、下载、待审计数及生成候选。审核后可由 cron 调用幂等工具；本功能没有安装生产定时任务。

审核前需核对原文、脚注、适用范围和替代规则。批准必须包含审核人、审核日期及来源验证日期。入库使用事务和不可变插入，重复 ID 无操作；修正或更改审核决定需同时使用新 ID 和新版本。备份由显式 `pg_dump` 自定义归档产生，应在可丢弃数据库验证恢复。所有来源和版本永久保留，没有自动删除命令或生产清理任务。

## 验证

各脚本见[测试说明](../testing.md)。浏览器场景在内存中生成合成 PDF，检查导入、纠错、审核门槛、保存/导出、来源目录、中英语言，以及 390/768/1440 像素浅深色布局，并检查 POST 正文是否泄露合成私人内容。真实 PostgreSQL 和完整浏览器验证需要可访问的隔离服务器及支持浏览器的环境。受阻不等于通过。

### 2026-11-15 验证记录

- `pnpm lint`、`pnpm typecheck` 和 `pnpm build` 通过。
- `pnpm test`：501 项，474 通过、27 跳过、0 失败。跳过项需要各自的可选服务或测试开关，不能视为通过。
- `pnpm test:python`：99 项，2 跳过；规划 Python 测试单独运行，3 项通过。
- PDF.js 合成 PDF 集成测试通过；出现标准字体数据路径提示，文本提取断言仍通过。未对用户真实附件运行解析回归。
- 有界官方抓取：8 个入口成功下载、146 个发现链接、2 份待审结构化候选；仓库仅附 1 份待审预览，0 份人工审核通过。
- 数据库命令 dry-run 通过；没有可用的隔离 PostgreSQL，实际迁移、入库和备份恢复未运行。
- 浏览器测试受环境阻碍：Chromium 启动时 `socket() failed: Operation not permitted`；云浏览器连接本地开发端口返回 `ERR_CONNECTION_REFUSED`。因此导入 UI 和 390/768/1440 像素实际交互、视觉及网络断言尚未验证。没有开放公网端口。
