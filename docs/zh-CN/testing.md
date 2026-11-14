# 测试说明

[English](../testing.md) · 简体中文

单元测试把一条规则放在可控输入下执行，并核对输出，通常不需要浏览器或外部服务。例如课程代码解析、评分权重、身份判定和滚动手势归属。它能防止改代码时破坏既有行为，但通过单元测试不能证明官方接口、真实数据库和页面布局都正常。

集成测试核对多个模块协作，包括 SQL、事务和恢复；浏览器脚本核对实际渲染、键盘／触摸、导航和接口到页面的链路。三者互补，不能相互代替。

## 默认检查

在仓库根目录使用 Node.js 24+ 并安装依赖后运行：

```sh
pnpm test
pnpm test:python
pnpm typecheck
pnpm lint
pnpm lint:docs
pnpm build
```

`pnpm test` 使用 Node 测试运行器执行 `tests/**/*.test.mjs`，数据库／在线项目默认跳过。Python 使用 unittest discovery，需要采集和研究模块的 Python 依赖。类型、lint、CSS、文档及构建检查与单元测试分开。

```sh
node --test tests/search/exact-route.test.mjs
python3 -m unittest tests.rmp.test_course_matching
```

## 数据库与外部服务开关

使用独立测试库或已备份的开发库。schema 测试建立随机临时 schema，结束后回滚／清理，需要建 schema 权限；RMP 集成查询对现有数据使用只读事务。普通迁移／采集命令不一定具备同样隔离，不能把它们当成测试直接执行。

| 开关                           | 范围与影响                                  |
| ------------------------------ | ------------------------------------------- |
| `CATALOG_DATABASE_TEST=1`      | 临时 schema 中的快照、学期主版本和命令恢复  |
| `SYLLABUS_DATABASE_TEST=1`     | 临时 schema 中的大纲索引与正文留存          |
| `TRANSLATION_DATABASE_TEST=1`  | 临时 schema 中的节点协调与使用汇总          |
| `RMP_INTEGRATION_TESTS=1`      | 只读现有 RMP、课程和评价数据                |
| `RMP_RESEARCH_DATABASE_TEST=1` | Python 身份证据的临时数据库测试             |
| `CATALOG_LIVE_TEST=1`          | 真实请求 OSU 并写入隔离存储，不属于默认检查 |

```sh
RMP_INTEGRATION_TESTS=1 CATALOG_DATABASE_TEST=1 SYLLABUS_DATABASE_TEST=1 TRANSLATION_DATABASE_TEST=1 \
  node --env-file-if-exists=.env.local --test tests/**/*.test.mjs
RMP_RESEARCH_DATABASE_TEST=1 python3 -m unittest tests.test_identity_research_db
```

`DATABASE_URL` 只从环境或 `.env.local` 读取，不复制到命令和报告。Python 数据库测试需先将变量加载到当前 shell。跳过表示未执行，不算通过；在线验证受源服务影响，结果单独报告。

## 浏览器验证

先启动开发服务，或 build 后 start。`.browser.mjs` 是独立脚本，不包含在 `pnpm test` 中；需安装 Playwright、Chromium 及其系统依赖。环境无法解析模块时，`PLAYWRIGHT_MODULE` 可指定绝对模块文件 URL，`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 可指定浏览器程序。

| 分类 | 地址／输出变量                                   | 数据与网络                                           |
| ---- | ------------------------------------------------ | ---------------------------------------------------- |
| 导航 | `NAV_TEST_BASE_URL`、`NAV_TEST_OUTPUT`           | 模拟数据不可用，真实操作导航、表单和键盘             |
| RMP  | `RMP_TEST_BASE_URL`、`RMP_TEST_OUTPUT`           | 教师库／线索读取真实本地 API；分区布局使用夹具       |
| 大纲 | `SYLLABUS_TEST_BASE_URL`、`SYLLABUS_TEST_OUTPUT` | 体验使用夹具，真实布局读取保存正文，字体直连官方 CDN |
| 搜索 | `SEARCH_TEST_BASE_URL`、`SEARCH_TEST_OUTPUT`     | 精确直连／索引回退使用确定性响应                     |

其他脚本的专用变量在文件开头列出，默认通常为 localhost:3000 与临时输出目录。使用独立浏览器上下文：测试会更改本机收藏／偏好、拦截请求，并可能下载文件，不会发布评价或投票。翻译和引导使用受控模型响应，模型下载相关检查应使用隔离浏览器配置。

```sh
node tests/layout/navigation.browser.mjs
node tests/rmp/library.browser.mjs
node tests/syllabus/experience.browser.mjs
node tests/syllabus/fonts.browser.mjs
```

Windows 测试进程无法解析 Linux 包链接时，`FONT_TEST_DOCUMENT_FILE` 可传入 `officialSyllabusFrame` 生成的文件；`SYLLABUS_DOCUMENT_FILE` 可传入官方文档响应进行真实版式和 PDF 检查。截图、PDF、基准 JSON 和源捕获应放在未跟踪的产物目录。

## 逐脚本目录

每行说明一个脚本的主要目的。完整夹具、断言和启用条件在源文件内；某些集成文件同时含有确定性单元检查和受开关控制的数据库检查。

### analytics

| 脚本                                                                                       | 类型 | 用途                             |
| ------------------------------------------------------------------------------------------ | ---- | -------------------------------- |
| [tests/analytics/audit.test.mjs](../../tests/analytics/audit.test.mjs)                     | 单元 | 统计分页、生产流量隔离与隐私过滤 |
| [tests/analytics/search-outcomes.test.mjs](../../tests/analytics/search-outcomes.test.mjs) | 单元 | 搜索结果状态、计数口径与错误区分 |
| [tests/analytics/umami.test.mjs](../../tests/analytics/umami.test.mjs)                     | 单元 | 事件字段、搜索标签与输入规范化   |

### catalog

| 脚本                                                                                                       | 类型   | 用途                             |
| ---------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| [tests/catalog/availability.test.mjs](../../tests/catalog/availability.test.mjs)                           | 单元   | 实时席位与归档数据隔离           |
| [tests/catalog/browser-transport.test.mjs](../../tests/catalog/browser-transport.test.mjs)                 | 单元   | 官方直连、发现配置与副本回退     |
| [tests/catalog/detail-refresh.test.mjs](../../tests/catalog/detail-refresh.test.mjs)                       | 单元   | 详情去重、取消和过期响应隔离     |
| [tests/catalog/empty-card.browser.mjs](../../tests/catalog/empty-card.browser.mjs)                         | 浏览器 | 搜索卡片无数据时只显示文本       |
| [tests/catalog/exact-search.test.mjs](../../tests/catalog/exact-search.test.mjs)                           | 单元   | 完整课程代码解析与学科筛选       |
| [tests/catalog/experience.browser.mjs](../../tests/catalog/experience.browser.mjs)                         | 浏览器 | 完整页面操作、响应式布局与滚动   |
| [tests/catalog/filters.browser.mjs](../../tests/catalog/filters.browser.mjs)                               | 浏览器 | 课程筛选层级、选中与移动布局     |
| [tests/catalog/floating-controls.test.mjs](../../tests/catalog/floating-controls.test.mjs)                 | 单元   | 回顶等悬浮控件的视口避让         |
| [tests/catalog/live-sync.integration.test.mjs](../../tests/catalog/live-sync.integration.test.mjs)         | 集成   | 真实官方全量同步到隔离存储       |
| [tests/catalog/official-availability.test.mjs](../../tests/catalog/official-availability.test.mjs)         | 单元   | 固定官方空位地址、限流与匿名请求 |
| [tests/catalog/official-exact.test.mjs](../../tests/catalog/official-exact.test.mjs)                       | 单元   | 精确编号、筛选、跨页和校区边界   |
| [tests/catalog/permanent-archive.test.mjs](../../tests/catalog/permanent-archive.test.mjs)                 | 单元   | 永久副本不会被旧清理选项删除     |
| [tests/catalog/presentation.test.mjs](../../tests/catalog/presentation.test.mjs)                           | 单元   | 学生层级与线上授课显示证据       |
| [tests/catalog/ranked-search.test.mjs](../../tests/catalog/ranked-search.test.mjs)                         | 单元   | 字段相关性、排序与分页边界       |
| [tests/catalog/related-search.test.mjs](../../tests/catalog/related-search.test.mjs)                       | 单元   | 近似学科与官方请求次数边界       |
| [tests/catalog/request-pool.test.mjs](../../tests/catalog/request-pool.test.mjs)                           | 单元   | 请求并发、去重、优先级与取消     |
| [tests/catalog/search-debug.browser.mjs](../../tests/catalog/search-debug.browser.mjs)                     | 浏览器 | 调试模拟与真实搜索隔离           |
| [tests/catalog/search-query.test.mjs](../../tests/catalog/search-query.test.mjs)                           | 单元   | 学科名、简称、歧义和筛选冲突     |
| [tests/catalog/search.browser.mjs](../../tests/catalog/search.browser.mjs)                                 | 浏览器 | 检索页面的匹配、分页与来源       |
| [tests/catalog/section-availability.test.mjs](../../tests/catalog/section-availability.test.mjs)           | 单元   | 班次实时空位与课程身份           |
| [tests/catalog/section-filters.test.mjs](../../tests/catalog/section-filters.test.mjs)                     | 单元   | 多个筛选必须匹配同一班次         |
| [tests/catalog/smart-search.test.mjs](../../tests/catalog/smart-search.test.mjs)                           | 单元   | 检索规划、回退与原输入保留       |
| [tests/catalog/snapshots.integration.test.mjs](../../tests/catalog/snapshots.integration.test.mjs)         | 集成   | 不可变版本、发布与失败恢复       |
| [tests/catalog/sync-cli.integration.test.mjs](../../tests/catalog/sync-cli.integration.test.mjs)           | 集成   | 真实命令的断点恢复和损坏数据拒绝 |
| [tests/catalog/sync-safety.test.mjs](../../tests/catalog/sync-safety.test.mjs)                             | 单元   | 同步分页、计数和安全发布         |
| [tests/catalog/term-archives.integration.test.mjs](../../tests/catalog/term-archives.integration.test.mjs) | 集成   | 学期消失、删改和历史恢复         |
| [tests/catalog/transactions.test.mjs](../../tests/catalog/transactions.test.mjs)                           | 单元   | 事务提交、回滚与版本边界         |
| [tests/catalog/watch-selection.test.mjs](../../tests/catalog/watch-selection.test.mjs)                     | 单元   | 班次监控选择与本机偏好           |
| [tests/catalog/workflow.test.mjs](../../tests/catalog/workflow.test.mjs)                                   | 单元   | 计划任务和同步运行约束           |

### evaluations

| 脚本                                                                                   | 类型 | 用途                         |
| -------------------------------------------------------------------------------------- | ---- | ---------------------------- |
| [tests/evaluations/batch-input.test.mjs](../../tests/evaluations/batch-input.test.mjs) | 单元 | 评价批量输入校验与数量边界   |
| [tests/evaluations/scoring.test.mjs](../../tests/evaluations/scoring.test.mjs)         | 单元 | SEI／SSLE 加权、阈值与样本量 |

### gestures

| 脚本                                                                                   | 类型 | 用途                       |
| -------------------------------------------------------------------------------------- | ---- | -------------------------- |
| [tests/gestures/drawer-dismiss.test.mjs](../../tests/gestures/drawer-dismiss.test.mjs) | 单元 | 抽屉关闭手势与正文滚动隔离 |

### layout

| 脚本                                                                             | 类型   | 用途                    |
| -------------------------------------------------------------------------------- | ------ | ----------------------- |
| [tests/layout/navigation.browser.mjs](../../tests/layout/navigation.browser.mjs) | 浏览器 | navigation 的行为与边界 |

### people

| 脚本                                                                                     | 类型 | 用途                         |
| ---------------------------------------------------------------------------------------- | ---- | ---------------------------- |
| [tests/people/identity-research.test.mjs](../../tests/people/identity-research.test.mjs) | 单元 | 姓名证据与来源判定           |
| [tests/people/people-cache.test.mjs](../../tests/people/people-cache.test.mjs)           | 单元 | 人员缓存、失败与过期状态     |
| [tests/people/people-directory.test.mjs](../../tests/people/people-directory.test.mjs)   | 单元 | 官方账号、姓名查询及员工标签 |
| [tests/people/photo.test.mjs](../../tests/people/photo.test.mjs)                         | 单元 | 固定照片来源与响应校验       |

### preferences

| 脚本                                                                                                 | 类型 | 用途                         |
| ---------------------------------------------------------------------------------------------------- | ---- | ---------------------------- |
| [tests/preferences/build-info.test.mjs](../../tests/preferences/build-info.test.mjs)                 | 单元 | 构建版本读取和显示           |
| [tests/preferences/debug-services.test.mjs](../../tests/preferences/debug-services.test.mjs)         | 单元 | 模拟服务、缓存和调试隔离     |
| [tests/preferences/debug-ui-state.test.mjs](../../tests/preferences/debug-ui-state.test.mjs)         | 单元 | 调试工具展开、授权与界面状态 |
| [tests/preferences/debug.test.mjs](../../tests/preferences/debug.test.mjs)                           | 单元 | 调试参数和入口规则           |
| [tests/preferences/locale.test.mjs](../../tests/preferences/locale.test.mjs)                         | 单元 | 语言检测、切换与本机记忆     |
| [tests/preferences/logo-clicks.test.mjs](../../tests/preferences/logo-clicks.test.mjs)               | 单元 | 品牌连续点击和手势去重       |
| [tests/preferences/release-time.test.mjs](../../tests/preferences/release-time.test.mjs)             | 单元 | 版本时间与时区格式           |
| [tests/preferences/storage-migrations.test.mjs](../../tests/preferences/storage-migrations.test.mjs) | 单元 | 旧偏好和收藏的安全升级       |
| [tests/preferences/update-notice.test.mjs](../../tests/preferences/update-notice.test.mjs)           | 单元 | 更新提示、版本比较和确认     |

### reference

| 脚本                                                                                         | 类型   | 用途                           |
| -------------------------------------------------------------------------------------------- | ------ | ------------------------------ |
| [tests/reference/experience.browser.mjs](../../tests/reference/experience.browser.mjs)       | 浏览器 | 完整页面操作、响应式布局与滚动 |
| [tests/reference/methodology.browser.mjs](../../tests/reference/methodology.browser.mjs)     | 浏览器 | 数据方法文章的语言和布局       |
| [tests/reference/nested-drawer.browser.mjs](../../tests/reference/nested-drawer.browser.mjs) | 浏览器 | 课程内二级说明抽屉的视口和焦点 |

### rmp

| 脚本                                                                                                         | 类型   | 用途                               |
| ------------------------------------------------------------------------------------------------------------ | ------ | ---------------------------------- |
| [tests/rmp/course-groups.test.mjs](../../tests/rmp/course-groups.test.mjs)                                   | 单元   | 本学期／历史教师分区及歧义姓名     |
| [tests/rmp/course-leads.browser.mjs](../../tests/rmp/course-leads.browser.mjs)                               | 浏览器 | 真实校区课程线索与待确认档案       |
| [tests/rmp/course-leads.integration.test.mjs](../../tests/rmp/course-leads.integration.test.mjs)             | 集成   | 真实校区课程线索与待确认档案       |
| [tests/rmp/course-matching.integration.test.mjs](../../tests/rmp/course-matching.integration.test.mjs)       | 集成   | RMP 课程证据映射与校区约束         |
| [tests/rmp/course.browser.mjs](../../tests/rmp/course.browser.mjs)                                           | 浏览器 | 课程内 RMP 展开、分页与评分        |
| [tests/rmp/display.test.mjs](../../tests/rmp/display.test.mjs)                                               | 单元   | 缺失分数、百分比和姓名缩写         |
| [tests/rmp/inline-unconfirmed.integration.test.mjs](../../tests/rmp/inline-unconfirmed.integration.test.mjs) | 集成   | 未确认档案在课程内显示且不混分     |
| [tests/rmp/library-input.test.mjs](../../tests/rmp/library-input.test.mjs)                                   | 单元   | 教师库输入、过滤与分页边界         |
| [tests/rmp/library.browser.mjs](../../tests/rmp/library.browser.mjs)                                         | 浏览器 | 教师库、原始课程过滤与返回导航     |
| [tests/rmp/library.integration.test.mjs](../../tests/rmp/library.integration.test.mjs)                       | 集成   | 教师库、原始课程过滤与返回导航     |
| [tests/rmp/period-layout.browser.mjs](../../tests/rmp/period-layout.browser.mjs)                             | 浏览器 | 教师分区、长标签布局和真实触摸滚动 |
| [tests/rmp/review-facts.test.mjs](../../tests/rmp/review-facts.test.mjs)                                     | 单元   | 评论字段、未知值与只读点赞         |
| [tests/rmp/review-fields.integration.test.mjs](../../tests/rmp/review-fields.integration.test.mjs)           | 集成   | 预览、分页和教师页完整保留评论字段 |
| [tests/rmp/rmp-input.test.mjs](../../tests/rmp/rmp-input.test.mjs)                                           | 单元   | RMP 请求身份和参数校验             |
| [tests/rmp/rmp-insights.test.mjs](../../tests/rmp/rmp-insights.test.mjs)                                     | 单元   | 已确认评分汇总和未确认隔离         |
| [tests/rmp/rmp-pagination.test.mjs](../../tests/rmp/rmp-pagination.test.mjs)                                 | 单元   | 评论分页、数量和可达范围           |
| [tests/rmp/source-retention.integration.test.mjs](../../tests/rmp/source-retention.integration.test.mjs)     | 集成   | 源档案与评论删除保护               |
| [tests/rmp/test_course_matching.py](../../tests/rmp/test_course_matching.py)                                 | 单元   | 课程别名推导、歧义和校区边界       |
| [tests/rmp/test_mapping_batches.py](../../tests/rmp/test_mapping_batches.py)                                 | 单元   | 关联批次、事务和冲突重试           |
| [tests/rmp/test_mapping_coverage.py](../../tests/rmp/test_mapping_coverage.py)                               | 单元   | 全目录证据覆盖与可重复映射         |
| [tests/rmp/test_rmp_collector.py](../../tests/rmp/test_rmp_collector.py)                                     | 单元   | RMP 查询、游标、限额与异常恢复     |
| [tests/rmp/test_rmp_mapping.py](../../tests/rmp/test_rmp_mapping.py)                                         | 单元   | 教师身份候选、证据和人工决定       |
| [tests/rmp/test_rmp_supplement.py](../../tests/rmp/test_rmp_supplement.py)                                   | 单元   | 旧 SQLite 补充导入与幂等           |
| [tests/rmp/word-cloud.test.mjs](../../tests/rmp/word-cloud.test.mjs)                                         | 单元   | 关键词统计、权重与显示边界         |

### search

| 脚本                                                                                 | 类型   | 用途                               |
| ------------------------------------------------------------------------------------ | ------ | ---------------------------------- |
| [tests/search/cache.test.mjs](../../tests/search/cache.test.mjs)                     | 单元   | 索引缓存与版本并发加载             |
| [tests/search/client.test.mjs](../../tests/search/client.test.mjs)                   | 单元   | 索引查询、游标与官方回退           |
| [tests/search/engine.test.mjs](../../tests/search/engine.test.mjs)                   | 单元   | 全词汇召回、拼写和课程号容错       |
| [tests/search/exact-route.test.mjs](../../tests/search/exact-route.test.mjs)         | 单元   | 元数据简称、官方单页和超时回退     |
| [tests/search/live-routing.browser.mjs](../../tests/search/live-routing.browser.mjs) | 浏览器 | 浏览器官方结果优先与无结果回索引   |
| [tests/search/result-cache.test.mjs](../../tests/search/result-cache.test.mjs)       | 单元   | 相同查询合并与内存／队列上限       |
| [tests/search/results.test.mjs](../../tests/search/results.test.mjs)                 | 单元   | 排名结果、同班次筛选和固定版本游标 |
| [tests/search/search.browser.mjs](../../tests/search/search.browser.mjs)             | 浏览器 | 检索页面的匹配、分页与来源         |

### styles

| 脚本                                                                         | 类型 | 用途                             |
| ---------------------------------------------------------------------------- | ---- | -------------------------------- |
| [tests/styles/css-hygiene.test.mjs](../../tests/styles/css-hygiene.test.mjs) | 单元 | 重复选择器、属性与响应式规则顺序 |

### syllabus

| 脚本                                                                                             | 类型     | 用途                                  |
| ------------------------------------------------------------------------------------------------ | -------- | ------------------------------------- |
| [tests/syllabus/assets.test.mjs](../../tests/syllabus/assets.test.mjs)                           | 单元     | 字体／图片白名单、文件签名和字节上限  |
| [tests/syllabus/check-pdf.py](../../tests/syllabus/check-pdf.py)                                 | PDF 检查 | 生成 PDF 的页面、文本、链接与布局检查 |
| [tests/syllabus/choices.test.mjs](../../tests/syllabus/choices.test.mjs)                         | 单元     | 大纲默认顺序、教师与评分筛选          |
| [tests/syllabus/experience.browser.mjs](../../tests/syllabus/experience.browser.mjs)             | 浏览器   | 完整页面操作、响应式布局与滚动        |
| [tests/syllabus/fonts.browser.mjs](../../tests/syllabus/fonts.browser.mjs)                       | 浏览器   | 真实官方 CDN 字体的跨域和 CSP         |
| [tests/syllabus/insights.test.mjs](../../tests/syllabus/insights.test.mjs)                       | 单元     | 周次、日期、表格与课程安排提取        |
| [tests/syllabus/normalize.test.mjs](../../tests/syllabus/normalize.test.mjs)                     | 单元     | 官方大纲结构、分页和精确身份          |
| [tests/syllabus/official-render.test.mjs](../../tests/syllabus/official-render.test.mjs)         | 单元     | 官方 DOM、样式清理与隔离 CSP          |
| [tests/syllabus/pdf-content.test.mjs](../../tests/syllabus/pdf-content.test.mjs)                 | 单元     | PDF 文字、标题、链接及下划线范围      |
| [tests/syllabus/pdf-typography.test.mjs](../../tests/syllabus/pdf-typography.test.mjs)           | 单元     | 嵌入字体高度与 CSS 行距               |
| [tests/syllabus/save.test.mjs](../../tests/syllabus/save.test.mjs)                               | 单元     | 原生保存取消、写入和失败分支          |
| [tests/syllabus/saved.test.mjs](../../tests/syllabus/saved.test.mjs)                             | 单元     | 收藏更新基线、通知与显式确认          |
| [tests/syllabus/scroll-chain.test.mjs](../../tests/syllabus/scroll-chain.test.mjs)               | 单元     | 容器边界和外层滚动距离计算            |
| [tests/syllabus/scroll-intent.test.mjs](../../tests/syllabus/scroll-intent.test.mjs)             | 单元     | 连续手势归属、速度与边界交接          |
| [tests/syllabus/selection.test.mjs](../../tests/syllabus/selection.test.mjs)                     | 单元     | 首份可读大纲和异步选择顺序            |
| [tests/syllabus/source-layout.browser.mjs](../../tests/syllabus/source-layout.browser.mjs)       | 浏览器   | 真实官方日期课表及窄屏阅读            |
| [tests/syllabus/storage.integration.test.mjs](../../tests/syllabus/storage.integration.test.mjs) | 集成     | 索引版本、归档、断点和数据库回退      |
| [tests/syllabus/teacher-data.test.mjs](../../tests/syllabus/teacher-data.test.mjs)               | 单元     | 教师精确评分、来源和颜色              |
| [tests/syllabus/time.test.mjs](../../tests/syllabus/time.test.mjs)                               | 单元     | 浏览器时区中的官方更新时间            |
| [tests/syllabus/transport.test.mjs](../../tests/syllabus/transport.test.mjs)                     | 单元     | 官方大纲直连、兼容和缓存更新          |

### tests

| 脚本                                                                             | 类型 | 用途                         |
| -------------------------------------------------------------------------------- | ---- | ---------------------------- |
| [tests/test_identity_pdf_research.py](../../tests/test_identity_pdf_research.py) | 单元 | 历史 PDF 证据提取与有限读取  |
| [tests/test_identity_research.py](../../tests/test_identity_research.py)         | 单元 | 人员与网页证据判定           |
| [tests/test_identity_research_db.py](../../tests/test_identity_research_db.py)   | 集成 | 临时数据库中的证据应用与重放 |

### translation

| 脚本                                                                                                                       | 类型   | 用途                             |
| -------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| [tests/translation/local-model.browser.mjs](../../tests/translation/local-model.browser.mjs)                               | 浏览器 | 浏览器模型检测、授权下载和恢复   |
| [tests/translation/onboarding.browser.mjs](../../tests/translation/onboarding.browser.mjs)                                 | 浏览器 | 翻译首次引导及设置流程           |
| [tests/translation/provider-state.integration.test.mjs](../../tests/translation/provider-state.integration.test.mjs)       | 集成   | 提供者状态、租约与过期结果隔离   |
| [tests/translation/provider-state.test.mjs](../../tests/translation/provider-state.test.mjs)                               | 单元   | 提供者状态、租约与过期结果隔离   |
| [tests/translation/translation-browser-usage.test.mjs](../../tests/translation/translation-browser-usage.test.mjs)         | 单元   | 匿名浏览器报告、限额和状态维度   |
| [tests/translation/translation-browser.test.mjs](../../tests/translation/translation-browser.test.mjs)                     | 单元   | Chrome 模型能力检测与资源释放    |
| [tests/translation/translation-concurrency.test.mjs](../../tests/translation/translation-concurrency.test.mjs)             | 单元   | 共享并发名额、FIFO 和缓存复用    |
| [tests/translation/translation-gateway.test.mjs](../../tests/translation/translation-gateway.test.mjs)                     | 单元   | NAS 请求格式、凭据和安全边界     |
| [tests/translation/translation-handler.test.mjs](../../tests/translation/translation-handler.test.mjs)                     | 单元   | 批量输入、限流和错误脱敏         |
| [tests/translation/translation-management.test.mjs](../../tests/translation/translation-management.test.mjs)               | 单元   | 管理命令校验与配置同步边界       |
| [tests/translation/translation-model.test.mjs](../../tests/translation/translation-model.test.mjs)                         | 单元   | 手动提供者选择与自动回退隔离     |
| [tests/translation/translation-onboarding.test.mjs](../../tests/translation/translation-onboarding.test.mjs)               | 单元   | 引导进度、显式完成和重复点击     |
| [tests/translation/translation-recovery.test.mjs](../../tests/translation/translation-recovery.test.mjs)                   | 单元   | 临时故障、冷却和单次恢复探测     |
| [tests/translation/translation-retry.test.mjs](../../tests/translation/translation-retry.test.mjs)                         | 单元   | 指数退避、Retry-After 和重试恢复 |
| [tests/translation/translation-scheduler.test.mjs](../../tests/translation/translation-scheduler.test.mjs)                 | 单元   | 可见文本调度、取消与去重         |
| [tests/translation/translation-service.test.mjs](../../tests/translation/translation-service.test.mjs)                     | 单元   | 目标语言、解析和译文校验         |
| [tests/translation/translation-usage.integration.test.mjs](../../tests/translation/translation-usage.integration.test.mjs) | 集成   | 汇总缓冲、失败重试与隐私         |
| [tests/translation/translation-usage.test.mjs](../../tests/translation/translation-usage.test.mjs)                         | 单元   | 汇总缓冲、失败重试与隐私         |
| [tests/translation/word-cloud-preference.test.mjs](../../tests/translation/word-cloud-preference.test.mjs)                 | 单元   | 新旧配置均默认关闭词云自动翻译   |

夹具文件（如 `tests/syllabus/fixtures.mjs` 与 HTML 样本）提供输入，不是独立测试命令。`scripts/catalog/benchmark-search.mjs` 测量本机并发，`scripts/search/evaluate.mjs` 评估完整语料召回，均不包含在默认单元测试中。
