# 测试说明

[English](../testing.md) · 简体中文

单元测试把一条规则放在可控输入下执行，并核对输出，通常不需要浏览器或外部服务。例如课程代码解析、评分权重、身份判定和滚动手势归属。它能防止改代码时破坏既有行为，但通过单元测试不能证明官方接口、真实数据库和页面布局都正常。

集成测试核对多个模块协作，包括 SQL、事务和恢复；浏览器脚本核对实际渲染、键盘／触摸、导航和接口到页面的链路。三者互补，不能相互代替。

## 默认检查

规划审查回归覆盖失败修读后的重修、独立审计记录、重复占位项、JSONB 键顺序变化后的重试，以及仅含明确可选课程的通用模板。`tests/planning/import-profile.test.mjs` 还使用 PDF.js 提取浏览器合成 PDF 后验证自动识别。浏览器工作区脚本通过自定义选择框选项操作，并在刷新后核对恢复的标签。私有 HAR 对比遇到学分冲突会失败。统计隐私测试覆盖规划页面访问、元数据白名单、弹窗与私密选择器浮层回放屏蔽、自定义选择器埋点和分享路径脱敏。可通过 `pnpm test` 执行，浏览器与私有文件脚本仍按下文说明显式运行。

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

| 开关                           | 范围与影响                                       |
| ------------------------------ | ------------------------------------------------ |
| `CATALOG_DATABASE_TEST=1`      | 临时 schema 中的快照、学期主版本和命令恢复       |
| `SYLLABUS_DATABASE_TEST=1`     | 临时 schema 中的大纲索引、正文留存与往年参考匹配 |
| `TRANSLATION_DATABASE_TEST=1`  | 临时 schema 中的节点协调与使用汇总               |
| `RMP_INTEGRATION_TESTS=1`      | 只读现有 RMP、课程和评价数据                     |
| `RMP_RESEARCH_DATABASE_TEST=1` | Python 身份证据的临时数据库测试                  |
| `CATALOG_LIVE_TEST=1`          | 真实请求 OSU 并写入隔离存储，不属于默认检查      |

```sh
RMP_INTEGRATION_TESTS=1 CATALOG_DATABASE_TEST=1 SYLLABUS_DATABASE_TEST=1 TRANSLATION_DATABASE_TEST=1 \
  node --env-file-if-exists=.env.local --test tests/**/*.test.mjs
RMP_RESEARCH_DATABASE_TEST=1 python3 -m unittest tests.test_identity_research_db
```

`DATABASE_URL` 只从环境或 `.env.local` 读取，不复制到命令和报告。Python 数据库测试需先将变量加载到当前 shell。跳过表示未执行，不算通过；在线验证受源服务影响，结果单独报告。

## 浏览器验证

课程更新脚本使用 `CHANGES_TEST_BASE_URL`／`CHANGES_TEST_OUTPUT`；`CATALOG_CHANGES_REAL_TEST=1` 额外只读检查实际数据库分页。

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

### 新增账号与大纲检查

| 脚本                                                                                                 | 类型 | 目的                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------ |
| [tests/user-data/draft-guard.test.mjs](../../tests/user-data/draft-guard.test.mjs)                   | 单元 | 草稿注册表、链接／刷新提示及前进后退恢复；模拟历史，不联网或写入               |
| [tests/user-data/institutional-policy.test.mjs](../../tests/user-data/institutional-policy.test.mjs) | 单元 | 学校邮箱精确域名和主动公开字段；无服务或写入                                   |
| [tests/user-data/network-fallback.test.mjs](../../tests/user-data/network-fallback.test.mjs)         | 单元 | 模拟降级、取消边界、无坐标／凭据及内网地址排除；不发送外部请求                 |
| [tests/user-data/share-scope.test.mjs](../../tests/user-data/share-scope.test.mjs)                   | 单元 | 内存存储验证账号与游客切换时的能力缓存隔离                                     |
| [tests/syllabus/translation.test.mjs](../../tests/syllabus/translation.test.mjs)                     | 单元 | Unicode、替换／双语 HTML、安全翻译文本、原文保留及取消；模拟翻译，无服务或写入 |
| [tests/syllabus/cjk-font.test.mjs](../../tests/syllabus/cjk-font.test.mjs)                           | 单元 | 本地 WOFF2 解码、真实中文字形和 OFL 署名；无写入                               |

### analytics

| 脚本                                                                                       | 类型 | 用途                             |
| ------------------------------------------------------------------------------------------ | ---- | -------------------------------- |
| [tests/analytics/audit.test.mjs](../../tests/analytics/audit.test.mjs)                     | 单元 | 统计分页、生产流量隔离与隐私过滤 |
| [tests/analytics/search-outcomes.test.mjs](../../tests/analytics/search-outcomes.test.mjs) | 单元 | 搜索结果状态、计数口径与错误区分 |
| [tests/analytics/umami.test.mjs](../../tests/analytics/umami.test.mjs)                     | 单元 | 事件字段、搜索标签与输入规范化   |

### catalog

| 脚本                                                                                                       | 类型   | 用途                                               |
| ---------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------- |
| [tests/catalog/availability.test.mjs](../../tests/catalog/availability.test.mjs)                           | 单元   | 实时席位与归档数据隔离                             |
| [tests/catalog/browser-transport.test.mjs](../../tests/catalog/browser-transport.test.mjs)                 | 单元   | 官方直连、发现配置与副本回退                       |
| [tests/catalog/detail-refresh.test.mjs](../../tests/catalog/detail-refresh.test.mjs)                       | 单元   | 详情去重、取消和过期响应隔离                       |
| [tests/catalog/empty-card.browser.mjs](../../tests/catalog/empty-card.browser.mjs)                         | 浏览器 | 搜索卡片无数据时只显示文本                         |
| [tests/catalog/exact-search.test.mjs](../../tests/catalog/exact-search.test.mjs)                           | 单元   | 完整课程代码解析与学科筛选                         |
| [tests/catalog/experience.browser.mjs](../../tests/catalog/experience.browser.mjs)                         | 浏览器 | 完整页面操作、响应式布局与滚动                     |
| [tests/catalog/filters.browser.mjs](../../tests/catalog/filters.browser.mjs)                               | 浏览器 | 课程筛选层级、选中与移动布局                       |
| [tests/catalog/floating-controls.test.mjs](../../tests/catalog/floating-controls.test.mjs)                 | 单元   | 回顶等悬浮控件的视口避让                           |
| [tests/catalog/live-sync.integration.test.mjs](../../tests/catalog/live-sync.integration.test.mjs)         | 集成   | 真实官方全量同步到隔离存储                         |
| [tests/catalog/official-availability.test.mjs](../../tests/catalog/official-availability.test.mjs)         | 单元   | 固定官方空位地址、限流与匿名请求                   |
| [tests/catalog/official-exact.test.mjs](../../tests/catalog/official-exact.test.mjs)                       | 单元   | 精确编号、筛选、跨页和校区边界                     |
| [tests/catalog/permanent-archive.test.mjs](../../tests/catalog/permanent-archive.test.mjs)                 | 单元   | 永久副本不会被旧清理选项删除                       |
| [tests/catalog/presentation.test.mjs](../../tests/catalog/presentation.test.mjs)                           | 单元   | 学生层级与线上授课显示证据                         |
| [tests/catalog/ranked-search.test.mjs](../../tests/catalog/ranked-search.test.mjs)                         | 单元   | 字段相关性、排序与分页边界                         |
| [tests/catalog/related-search.test.mjs](../../tests/catalog/related-search.test.mjs)                       | 单元   | 近似学科与官方请求次数边界                         |
| [tests/catalog/request-pool.test.mjs](../../tests/catalog/request-pool.test.mjs)                           | 单元   | 请求并发、去重、优先级与取消                       |
| [tests/catalog/search-debug.browser.mjs](../../tests/catalog/search-debug.browser.mjs)                     | 浏览器 | 调试模拟与真实搜索隔离                             |
| [tests/catalog/search-query.test.mjs](../../tests/catalog/search-query.test.mjs)                           | 单元   | 学科名、简称、歧义和筛选冲突                       |
| [tests/catalog/search.browser.mjs](../../tests/catalog/search.browser.mjs)                                 | 浏览器 | 检索页面的匹配、分页与来源                         |
| [tests/catalog/section-availability.test.mjs](../../tests/catalog/section-availability.test.mjs)           | 单元   | 班次实时空位与课程身份                             |
| [tests/catalog/active-filters.test.mjs](../../tests/catalog/active-filters.test.mjs)                       | 单元   | 默认校区、取消校区限制与实际筛选计数；无服务或写入 |
| [tests/catalog/section-filters.test.mjs](../../tests/catalog/section-filters.test.mjs)                     | 单元   | 多个筛选必须匹配同一班次                           |
| [tests/catalog/smart-search.test.mjs](../../tests/catalog/smart-search.test.mjs)                           | 单元   | 检索规划、回退与原输入保留                         |
| [tests/catalog/snapshots.integration.test.mjs](../../tests/catalog/snapshots.integration.test.mjs)         | 集成   | 不可变版本、发布与失败恢复                         |
| [tests/catalog/sync-cli.integration.test.mjs](../../tests/catalog/sync-cli.integration.test.mjs)           | 集成   | 真实命令的断点恢复和损坏数据拒绝                   |
| [tests/catalog/sync-safety.test.mjs](../../tests/catalog/sync-safety.test.mjs)                             | 单元   | 同步分页、计数和安全发布                           |
| [tests/catalog/term-archives.integration.test.mjs](../../tests/catalog/term-archives.integration.test.mjs) | 集成   | 学期消失、删改和历史恢复                           |
| [tests/catalog/transactions.test.mjs](../../tests/catalog/transactions.test.mjs)                           | 单元   | 事务提交、回滚与版本边界                           |
| [tests/catalog/watch-selection.test.mjs](../../tests/catalog/watch-selection.test.mjs)                     | 单元   | 班次监控选择与本机偏好                             |
| [tests/catalog/workflow.test.mjs](../../tests/catalog/workflow.test.mjs)                                   | 单元   | 计划任务和同步运行约束                             |

| [tests/catalog/changes.test.mjs](../../tests/catalog/changes.test.mjs) | 单元 | 变化筛选和固定游标校验 |
| [tests/catalog/changes.integration.test.mjs](../../tests/catalog/changes.integration.test.mjs) | 集成 | 完整快照变化、基线、噪声和只追加保护 |
| [tests/catalog/changes.browser.mjs](../../tests/catalog/changes.browser.mjs) | 浏览器 | 响应式更新列表、筛选、跳转及可选真实 API 分页 |

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

| 脚本                                                                                             | 类型     | 用途                                                                                                                                           |
| ------------------------------------------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/syllabus/assets.test.mjs](../../tests/syllabus/assets.test.mjs)                           | 单元     | 字体／图片白名单、文件签名和字节上限                                                                                                           |
| [tests/syllabus/check-pdf.py](../../tests/syllabus/check-pdf.py)                                 | PDF 检查 | 生成 PDF 的页面、文本、链接与布局检查                                                                                                          |
| [tests/syllabus/choices.test.mjs](../../tests/syllabus/choices.test.mjs)                         | 单元     | 大纲默认顺序、教师与评分筛选                                                                                                                   |
| [tests/syllabus/experience.browser.mjs](../../tests/syllabus/experience.browser.mjs)             | 浏览器   | 完整页面操作、响应式布局与滚动                                                                                                                 |
| [tests/syllabus/fonts.browser.mjs](../../tests/syllabus/fonts.browser.mjs)                       | 浏览器   | 真实官方 CDN 字体的跨域和 CSP                                                                                                                  |
| [tests/syllabus/insights.test.mjs](../../tests/syllabus/insights.test.mjs)                       | 单元     | 周次、日期、表格与课程安排提取                                                                                                                 |
| [tests/syllabus/normalize.test.mjs](../../tests/syllabus/normalize.test.mjs)                     | 单元     | 官方大纲结构、分页和精确身份                                                                                                                   |
| [tests/syllabus/official-render.test.mjs](../../tests/syllabus/official-render.test.mjs)         | 单元     | 官方 DOM、样式清理与隔离 CSP                                                                                                                   |
| [tests/syllabus/pdf-content.test.mjs](../../tests/syllabus/pdf-content.test.mjs)                 | 单元     | PDF 文字、标题、链接及下划线范围                                                                                                               |
| [tests/syllabus/pdf-typography.test.mjs](../../tests/syllabus/pdf-typography.test.mjs)           | 单元     | 嵌入字体高度与 CSS 行距                                                                                                                        |
| [tests/syllabus/save.test.mjs](../../tests/syllabus/save.test.mjs)                               | 单元     | 原生保存取消、写入和失败分支                                                                                                                   |
| [tests/syllabus/saved.test.mjs](../../tests/syllabus/saved.test.mjs)                             | 单元     | 收藏更新基线、通知与显式确认                                                                                                                   |
| [tests/syllabus/scroll-chain.test.mjs](../../tests/syllabus/scroll-chain.test.mjs)               | 单元     | 容器边界和外层滚动距离计算                                                                                                                     |
| [tests/syllabus/scroll-intent.test.mjs](../../tests/syllabus/scroll-intent.test.mjs)             | 单元     | 连续手势归属、速度与边界交接                                                                                                                   |
| [tests/syllabus/selection.test.mjs](../../tests/syllabus/selection.test.mjs)                     | 单元     | 首份可读大纲和异步选择顺序                                                                                                                     |
| [tests/syllabus/source-layout.browser.mjs](../../tests/syllabus/source-layout.browser.mjs)       | 浏览器   | 真实官方日期课表及窄屏阅读                                                                                                                     |
| [tests/syllabus/history.integration.test.mjs](../../tests/syllabus/history.integration.test.mjs) | 集成     | 科目／校区／教师精确匹配、最近参考、别名、未发布及未来班次排除；`SYLLABUS_DATABASE_TEST=1`，读取环境数据库并建立／删除随机临时模式，不请求上游 |
| [tests/syllabus/storage.integration.test.mjs](../../tests/syllabus/storage.integration.test.mjs) | 集成     | 索引版本、归档、断点和数据库回退                                                                                                               |
| [tests/syllabus/teacher-data.test.mjs](../../tests/syllabus/teacher-data.test.mjs)               | 单元     | 教师精确评分、来源和颜色                                                                                                                       |
| [tests/syllabus/time.test.mjs](../../tests/syllabus/time.test.mjs)                               | 单元     | 浏览器时区中的官方更新时间                                                                                                                     |
| [tests/syllabus/transport.test.mjs](../../tests/syllabus/transport.test.mjs)                     | 单元     | 官方大纲直连、兼容和缓存更新                                                                                                                   |

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

## 账号、收藏和回放测试

`USER_DATA_INTEGRATION=1` 启用认证、分享和同步的数据库测试；创建随机临时表或 schema 并在结束时删除，不发送真实邮件。可用 `USER_DATA_TEST_DATABASE_URL` 指向专用测试数据库；默认读取环境文件中的数据库。分享浏览器测试需 `ALLOW_SERVER_WRITES=1`，会创建并最终撤销测试访客分享，留下审计行；非本机目标另需 `ALLOW_REMOTE_USER_DATA_TESTS=1`。同步和回放浏览器测试拦截认证、同步或统计请求，不写服务器收藏。浏览器测试使用 `USER_DATA_TEST_BASE_URL`；分享、同步截图使用 `USER_DATA_SCREENSHOT_DIR`。

| 脚本                                                                                                           | 类型        | 用途                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [tests/analytics/privacy.test.mjs](../../tests/analytics/privacy.test.mjs)                                     | Unit        | 回放默认值、所有页面可用、序列化过滤与分享凭据处理                                                                                                                                                                          |
| [tests/analytics/replay.browser.mjs](../../tests/analytics/replay.browser.mjs)                                 | Browser     | 模拟统计服务，检查逐页加载、沿用远端参数和已保存的关闭设置                                                                                                                                                                  |
| [tests/user-data/history.test.mjs](../../tests/user-data/history.test.mjs)                                     | Unit        | 本机历史去重、保留期限、条数上限和安全导航                                                                                                                                                                                  |
| [tests/user-data/workspace.test.mjs](../../tests/user-data/workspace.test.mjs)                                 | Unit        | 本机快照写入、逐字段改动、修订确认和损坏数据处理                                                                                                                                                                            |
| [tests/user-data/local.test.mjs](../../tests/user-data/local.test.mjs)                                         | Unit        | 导入、移除、撤销保留完整快照和中途改动                                                                                                                                                                                      |
| [tests/user-data/exchange.test.mjs](../../tests/user-data/exchange.test.mjs)                                   | Unit        | 四类交换格式验证、上限、公开信息筛减和导入身份                                                                                                                                                                              |
| [tests/user-data/auth.test.mjs](../../tests/user-data/auth.test.mjs)                                           | Unit        | 固定来源验证、Tailscale 网段边界与同源校验、流式请求上限、开发环境命名空间隔离                                                                                                                                              |
| [tests/user-data/auth-errors.test.mjs](../../tests/user-data/auth-errors.test.mjs)                             | 单元        | 区分密码、验证码、来源、节流和通行密钥错误；不访问服务或写入数据                                                                                                                                                            |
| [tests/user-data/auth-boundary.integration.test.mjs](../../tests/user-data/auth-boundary.integration.test.mjs) | 集成        | `USER_DATA_INTEGRATION=1`；PostgreSQL 临时模式；真实认证路由防护、条款确认、八位密码、模式内外键、学校验证码限次和一次性使用、回环及 Tailscale 登录、回调、会话和退出，以及真实签名通行密钥的邮箱匹配；模拟邮件，结束后清理 |
| [tests/user-data/auth.integration.test.mjs](../../tests/user-data/auth.integration.test.mjs)                   | Integration | 真实验证码、密码、密钥、会话和恢复协议；注入邮件投递，使用临时认证表                                                                                                                                                        |
| [tests/user-data/sharing.integration.test.mjs](../../tests/user-data/sharing.integration.test.mjs)             | Integration | 真实 SQL 验证凭据、过期、短码、归属、计数、并发上限和重试                                                                                                                                                                   |
| [tests/user-data/sharing.browser.mjs](../../tests/user-data/sharing.browser.mjs)                               | Browser     | 创建并撤销测试分享；部分转存、原地详情、重试和手机管理                                                                                                                                                                      |
| [tests/user-data/sync-model.test.mjs](../../tests/user-data/sync-model.test.mjs)                               | Unit        | 请求期间改动、删除冲突、游标过期和账号存储键                                                                                                                                                                                |
| [tests/user-data/sync.integration.test.mjs](../../tests/user-data/sync.integration.test.mjs)                   | Integration | 真实 SQL 验证版本、重试、并发冲突、删除、账号隔离和过期合并                                                                                                                                                                 |
| [tests/user-data/sync.browser.mjs](../../tests/user-data/sync.browser.mjs)                                     | Browser     | 模拟认证与同步；双设备、响应丢失与刷新、冲突、暂停恢复和游客隔离                                                                                                                                                            |

```sh
USER_DATA_INTEGRATION=1 node --test tests/user-data/*.integration.test.mjs
node tests/analytics/replay.browser.mjs
node tests/user-data/sync.browser.mjs
ALLOW_SERVER_WRITES=1 node tests/user-data/sharing.browser.mjs
```

临时转存测试使用与分享测试相同的数据库和浏览器开关；浏览器测试创建并最终撤销测试转存，保留审计行。

| 脚本                                                                                                   | 类型        | 用途                                                                        |
| ------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------------------------------- |
| [tests/user-data/transfers.integration.test.mjs](../../tests/user-data/transfers.integration.test.mjs) | Integration | 真实 SQL 的配对确认、权限、并发租约、过期、幂等完成和只读访问               |
| [tests/user-data/transfers.browser.mjs](../../tests/user-data/transfers.browser.mjs)                   | Browser     | 真实接口的双浏览器配对、部分导入、刷新恢复、确认响应丢失及 320/390 像素布局 |

页面分享浏览器测试使用 `ALLOW_SERVER_WRITES=1`，创建测试公开链接并在结束时通过所有者接口删除；课程来源请求和外部统计被拦截。数据库测试使用 `USER_DATA_INTEGRATION=1` 和临时 schema，开关及目标地址与其他分享测试一致。

| 脚本                                                                                                     | 类型        | 用途                                                                   |
| -------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| [tests/user-data/page-links.test.mjs](../../tests/user-data/page-links.test.mjs)                         | Unit        | 公开 URL 白名单、凭据剔除及课程和详情身份                              |
| [tests/user-data/page-links.integration.test.mjs](../../tests/user-data/page-links.integration.test.mjs) | Integration | 真实 SQL 的规范链接复用、公开快照和独立预览/打开计数                   |
| [tests/user-data/page-links.browser.mjs](../../tests/user-data/page-links.browser.mjs)                   | Browser     | 真实链接创建与清理、爬虫预览、缺失结果时的课程抽屉、文档锚点和取消分享 |

站内统计的数据库测试使用 `USER_DATA_INTEGRATION=1`；浏览器测试拦截统计与其他数据请求，不写真实统计记录。浏览器目标仍使用 `USER_DATA_TEST_BASE_URL`，设备和会话标识仅在独立测试浏览器环境生成。

| 脚本                                                                                                   | 类型        | 用途                                                                 |
| ------------------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------- |
| [tests/user-data/telemetry.test.mjs](../../tests/user-data/telemetry.test.mjs)                         | Unit        | 事件字段筛减、查询归一化、教师稳定标识和可信网络请求头               |
| [tests/user-data/telemetry.integration.test.mjs](../../tests/user-data/telemetry.integration.test.mjs) | Integration | 批量 SQL 幂等确认、每日统计维度、IP 来源；临时 schema                |
| [tests/user-data/telemetry.browser.mjs](../../tests/user-data/telemetry.browser.mjs)                   | Browser     | 模拟收集接口；持久重试、严格模式、跨标签收藏、实际打开课程和关闭统计 |

清理和统计数据库测试使用 `USER_DATA_INTEGRATION=1`，仅操作随机临时 schema。热门收藏浏览器测试模拟接口，不写真实排名或访问统计；地址与截图变量沿用 `USER_DATA_TEST_BASE_URL`、`USER_DATA_SCREENSHOT_DIR`。

| 脚本                                                                                                       | 类型        | 用途                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------- |
| [tests/user-data/maintenance.integration.test.mjs](../../tests/user-data/maintenance.integration.test.mjs) | Integration | 带归属检查的保留期限、预览、永久来源保留、有效收藏和过期游标合并       |
| [tests/user-data/statistics.integration.test.mjs](../../tests/user-data/statistics.integration.test.mjs)   | Integration | 账号有效收藏计数、删除、排除不明确身份、公开摘要和环境隔离聚合         |
| [tests/user-data/popular.browser.mjs](../../tests/user-data/popular.browser.mjs)                           | Browser     | 模拟中英文 320/390/1440 像素列表、首屏渲染错误、导航、原地详情和空状态 |

诊断数据库测试使用 `USER_DATA_INTEGRATION=1`，创建随机临时 schema 并在结束后移除。诊断浏览器测试仅在主动开启后读取本机能力，统计请求和报告提交 API 均被拦截，不会上传报告。可配置 `USER_DATA_TEST_BASE_URL`、`USER_DATA_SCREENSHOT_DIR` 及通常的 Playwright 模块／浏览器路径。统计检查使用合成响应，并覆盖管理端未解锁状态。

| 脚本                                                                                                   | 类型   | 用途                                                                     |
| ------------------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------ |
| [tests/diagnostics/protocol.test.mjs](../../tests/diagnostics/protocol.test.mjs)                       | 单元   | 完整清单、授权分类、报告限制、凭据字段拒绝、可信请求头与受限 JPEG 元数据 |
| [tests/diagnostics/reports.integration.test.mjs](../../tests/diagnostics/reports.integration.test.mjs) | 集成   | 绑定会话的幂等提交、独立观察值、七天访问期及精确游标分页                 |
| [tests/diagnostics/diagnostics.browser.mjs](../../tests/diagnostics/diagnostics.browser.mjs)           | 浏览器 | 本机检测、指纹主动开启、权限隔离、预览重试及 320/390/1440 像素布局       |
| [tests/diagnostics/statistics.browser.mjs](../../tests/diagnostics/statistics.browser.mjs)             | 浏览器 | 权限加载、长请求字段、报告预览及 320/390/768/1440 像素布局               |

容量浏览器检查在独立配置中放入合成收藏，模拟数据／统计 API，并检查新增项目之后的撤回失败，不写入服务器数据。与其他浏览器检查相同，可配置 `USER_DATA_TEST_BASE_URL` 和 `USER_DATA_SCREENSHOT_DIR`。

| 脚本                                                                               | 类型   | 用途                                                                         |
| ---------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------- |
| [tests/user-data/capacity.browser.mjs](../../tests/user-data/capacity.browser.mjs) | 浏览器 | 收藏已满提示、撤回失败不覆盖数据、保留中途新增项目、拒绝空导出及手机提示布局 |

真实回放检查不包含在 `pnpm test` 中，需显式设置 `ALLOW_UMAMI_WRITES=1`。它使用真实 Umami 脚本／配置，创建合成远端事件和录制；应用 API 均被模拟。`REPLAY_REQUIRE_ROUND_TRIP=1` 要求用仅服务端的 `UMAMI_API_KEY` 认证读取录制，`REPLAY_TEST_WIDTH=390` 用于手机检查。生产构建和浏览器设置见[回放运维](analytics/umami.md)。

| 脚本                                                                                     | 类型           | 用途                                                               |
| ---------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| [tests/analytics/replay-live.browser.mjs](../../tests/analytics/replay-live.browser.mjs) | 真实浏览器集成 | 分块接收、同一访问初始化、认证读回、完整快照、菜单、暂停浮层和滚动 |

收藏并发检查在同一个独立浏览器配置中打开两个标签页，共享 localStorage／IndexedDB，模拟全部 API。它观察真实事务回调，验证同时删除／撤回操作保留两个项目，不写入服务器数据。

| 脚本                                                                                               | 类型   | 用途                                                  |
| -------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------- |
| [tests/user-data/concurrent-saved.browser.mjs](../../tests/user-data/concurrent-saved.browser.mjs) | 浏览器 | 32 次跨标签提交、共享事务覆盖、保留独立修改及手机布局 |

管理区隔离检查使用合成账号、本地快照和暂停的云端快照，模拟认证及全部 API。另一个标签退出登录后，原页面必须在不重载的情况下清除上个账号的管理行、选择状态和名称草稿。

| 脚本                                                                                                 | 类型   | 用途                             |
| ---------------------------------------------------------------------------------------------------- | ------ | -------------------------------- |
| [tests/user-data/scoped-management.browser.mjs](../../tests/user-data/scoped-management.browser.mjs) | 浏览器 | 管理区工作区隔离及跨标签退出登录 |

分组与备份浏览器检查沿用上述 Node／Playwright 环境，模拟全部 API，仅写入隔离浏览器存储和本地下载文件。迁移集成检查需 `USER_DATA_INTEGRATION=1`，会创建随机前缀表、调用真实 CLI，最后移除临时表。备份单元测试不连接 PostgreSQL。

| 脚本                                                                                                             | 类型       | 用途                                                                                       |
| ---------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| [tests/user-data/collections.test.mjs](../../tests/user-data/collections.test.mjs)                               | 单元       | 私人分组校验、保留分组结构、批次体积限制与重命名冲突                                       |
| [tests/user-data/compact-tabs.browser.mjs](../../tests/user-data/compact-tabs.browser.mjs)                       | 浏览器     | 1440／768／390／320 像素下简略列表分类标签位于结果上方；使用本地合成数据并阻止外部请求     |
| [tests/user-data/collections.browser.mjs](../../tests/user-data/collections.browser.mjs)                         | 浏览器     | 1440／768／390／320 像素下的新建、整理、改名、删除撤销、分组导出和私人恢复                 |
| [tests/user-data/rmp-favorites.test.mjs](../../tests/user-data/rmp-favorites.test.mjs)                           | 单元       | RMP 来源身份、评分保留及公开交换格式校验                                                   |
| [tests/user-data/rmp-favorites.browser.mjs](../../tests/user-data/rmp-favorites.browser.mjs)                     | 浏览器     | 教师库、档案、收藏页操作，以及同名已确认／待确认档案与撤回                                 |
| [tests/user-data/backup.test.mjs](../../tests/user-data/backup.test.mjs)                                         | 单元       | 认证表精确白名单及安全的备份连接凭据传递                                                   |
| [tests/user-data/auth-migration.integration.test.mjs](../../tests/user-data/auth-migration.integration.test.mjs) | 集成       | 拒绝接管当前搜索路径 schema 中无归属标记的认证表                                           |
| [tests/user-data/history.browser.mjs](../../tests/user-data/history.browser.mjs)                                 | 浏览器     | API 全部模拟；英文 1440／中文 320 像素下的 JSON 清理导出、站内清空／取消弹窗及旧标签页删除 |
| [tests/user-data/email-login.live.browser.mjs](../../tests/user-data/email-login.live.browser.mjs)               | 真实浏览器 | 两封实际投递的验证码、拒绝重复使用、独立设备登录同一账号与分别退出                         |

通过 `node tests/user-data/history.browser.mjs` 运行记录界面检查。脚本使用隔离浏览器存储和本地下载，不发送真实邮件或外部统计。

真实邮件检查需要已配置的 SMTP 和交互式终端。设置 `ALLOW_SMTP_TEST_EMAILS=1`，将 `AUTH_TEST_EMAIL` 设为自己控制的邮箱，再运行 `node tests/user-data/email-login.live.browser.mjs`。按提示依次输入收到的六位验证码，终端不回显。脚本实际发送两封邮件，可能在目标服务的认证空间中创建账号，并创建、退出两个会话，不上传收藏。默认使用开发服务器；远程目标额外要求 `ALLOW_REMOTE_USER_DATA_TESTS=1`。浏览器模块、可执行文件及 `USER_DATA_TEST_BASE_URL` 与其他用户数据检查一致。不要把验证码写入脚本、日志或 CI 变量。

```sh
node --test tests/user-data/collections.test.mjs tests/user-data/rmp-favorites.test.mjs tests/user-data/backup.test.mjs
node tests/user-data/collections.browser.mjs
node tests/user-data/compact-tabs.browser.mjs
node tests/user-data/rmp-favorites.browser.mjs
USER_DATA_INTEGRATION=1 node --test tests/user-data/auth-migration.integration.test.mjs
```

## 浏览器兼容与同步预算回归

以下单元测试包含在默认 `pnpm test` 中，不请求外部来源。大纲集成测试需要 `SYLLABUS_DATABASE_TEST=1` 和 `DATABASE_URL`，会创建、写入并移除随机临时 schema，官方请求使用夹具，不改写业务归档。课程历史集成测试另外比较分块结果与原 SQL，并验证中断回滚。`telemetry.browser.mjs` 还覆盖禁用 randomUUID 和完全缺少 crypto 时页面仍可打开；采集接口均被模拟。RMP Python 采集器测试覆盖时间／请求预算、长冷却暂停及 pipeline 刷新后再校验提交。

| 脚本                                                                                                         | 类型 | 目的                                                                        |
| ------------------------------------------------------------------------------------------------------------ | ---- | --------------------------------------------------------------------------- |
| [tests/user-data/uuid.test.mjs](../../tests/user-data/uuid.test.mjs)                                         | 单元 | 缺少 randomUUID 时的安全 UUID 回退、原生方法绑定及无安全随机源时拒绝生成    |
| [tests/catalog/change-budgets.test.mjs](../../tests/catalog/change-budgets.test.mjs)                         | 单元 | 历史批次与运行时间上限，以及预算耗尽时不写完成标记                          |
| [tests/syllabus/refresh-budget.test.mjs](../../tests/syllabus/refresh-budget.test.mjs)                       | 单元 | 请求间隔和 Retry-After 遵守运行预算，不额外请求                             |
| [tests/syllabus/refresh-cache.test.mjs](../../tests/syllabus/refresh-cache.test.mjs)                         | 单元 | 当前／旧学期及缺失文档缓存、结束前一周和学期结束后检查                      |
| [tests/syllabus/refresh-cache.integration.test.mjs](../../tests/syllabus/refresh-cache.integration.test.mjs) | 集成 | 真实 SQL 验证缓存复用、元数据变化、暂停后新索引、迁移初始化、失败与归档保留 |

## 个人空间与账号验证

以下单元测试随 `pnpm test` 执行，不访问外部服务。账号集成测试需要 PostgreSQL 和 `USER_DATA_INTEGRATION=1`，只创建、删除随机测试模式，使用内存邮件投递替身，不发送真实邮件；覆盖注册、邮箱验证、密码登录、验证码登录及已消费验证码的拒绝。其他个人数据集成测试也使用随机一次性命名空间。

| 脚本                                                                                                             | 类型 | 用途                                                         |
| ---------------------------------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------ |
| [tests/user-data/storage-status.test.mjs](../../tests/user-data/storage-status.test.mjs)                         | 单元 | 云端确认、尚未入队的本地修改和待同步删除不会误报已保存       |
| [tests/user-data/domains.test.mjs](../../tests/user-data/domains.test.mjs)                                       | 单元 | 账号／分析／诊断命名空间隔离与安全的响应式验证码邮件         |
| [tests/user-data/recommendations.test.mjs](../../tests/user-data/recommendations.test.mjs)                       | 单元 | 按评价证据推荐、无评价课程参与、跨视图选择保留及权限数据拒绝 |
| [tests/user-data/account-domain.integration.test.mjs](../../tests/user-data/account-domain.integration.test.mjs) | 集成 | 显式一次性模式内的完整邮箱验证账号流程，模拟邮件             |

使用 `USER_DATA_INTEGRATION=1 node --test tests/user-data/*.integration.test.mjs tests/diagnostics/reports.integration.test.mjs` 执行相关数据库测试。只写入一次性测试模式，不调用生产应用接口或真实 SMTP。

## 预构建搜索回归测试

`tests/search/prepared-corpus.test.mjs` 使用合成公开课程样本和模拟数据库响应，
检查引擎等价性、压缩索引完整性、版本匹配、请求侧无 DDL、预构建复用与发布顺序。
它不联网，也不写数据库。`tests/catalog/sync-cli.integration.test.mjs` 在明确开启
`CATALOG_DATABASE_TEST=1` 时包含迁移 6 和暂存索引构建，仅写入隔离的临时目录 schema。
跳过集成测试不代表生产 PostgreSQL 性能通过验证。

```sh
node --test tests/search/prepared-corpus.test.mjs
```

`tests/translation/translation-release.test.mjs` 使用内存提供商与状态存储模拟，
覆盖已确认完成、完成状态被拒绝或写入失败、超时后结束及清理竞态。
六个案例都不调用外部服务，也不写数据库。

```sh
node --test tests/translation/translation-release.test.mjs
```

`tests/search/prepared-corpus.integration.test.mjs` 可通过 `PGLITE_MODULE`
加载已经安装的 PGlite 模块，仅创建内存表，验证迁移 6、压缩 bytea 恢复、
损坏修复与保护已发布版本的保留策略。它不使用 `DATABASE_URL`、凭据、
网络数据库或外部服务。原生 PostgreSQL 连接与多会话并发行为仍需单独验证。

```sh
PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node --test tests/search/prepared-corpus.integration.test.mjs
```

## 账号就绪状态回归

运行 `node --test tests/user-data/account-status.test.mjs`（也包含在 `pnpm test` 中）。内存测试覆盖扩展表缺失、就绪请求等待或失败、完整配置以及游客入口的安全关闭行为。不连接数据库、不修改账号，也不调用外部服务。有效会话在扩展功能不可用时仍显示账号工作区；学校邮箱设置须等相关表就绪后才能使用。这是界面降级处理，不能替代用户数据迁移。

## 分组图标选择器

`node --test tests/user-data/collection-icons.test.mjs` 检查全部内置图标标识与收藏分组结构的兼容性、中英文离线搜索和类别、Lucide SVG 必需的描边属性，以及搜索框回车和选中提示。需要 Node.js 24+ 及已安装的依赖，不写入数据、不调用外部服务。这些断言不能替代浏览器验收。

选择器内置 99 个本地图标，分为八类。搜索不会向图标服务发送关键词，现有图标标识保持有效。中性图标卡使用统一的前景与背景颜色变量；选中时增加强调色边框和勾选标记，不仅依赖颜色区分。

浏览器回归：新建分组，分别用中英文搜索、切换类别、检查无结果提示，并确认搜索框回车不会保存。选择图标，保存合成测试分组，刷新后重新打开，确认图标保留。仅改变筛选条件不应触发未保存警告，改变图标则应触发。检查 320、390、768、1440px 下的描边和焦点轮廓。使用不含生产凭据的独立本地站点；保存分组会写入该站点的浏览器存储。

## 学期规划

- `tests/planning/model.test.mjs`: 白名单、本地序列化、存储失败和课程链接. `node --test tests/planning/model.test.mjs`. 不连接服务、不写外部数据。
- `tests/planning/parser.test.mjs`: 合成版式、未知学分、占位项、冲突版本及打印顺序. `node --test tests/planning/parser.test.mjs`. 不连接服务、不写外部数据。
- `tests/planning/curriculum.test.mjs`: 官方候选、独立域和导入验证. `node --test tests/planning/curriculum.test.mjs`. 不连接服务、不写外部数据。
- `tests/planning/test_sync.py`: 公开 URL 限制和未知布局。 `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. 离线，无数据库或网络写入。
- `tests/planning/workspace.browser.mjs`: 本地导入、纠错、保存/导出、双语及响应式隐私流程。 `node tests/planning/workspace.browser.mjs`. 需本地运行应用、Playwright 和 Chromium；可设 `BASE_URL`、`PLAYWRIGHT_MODULE`、`PLAYWRIGHT_CHROMIUM_EXECUTABLE`。仅向隔离浏览器存储写入合成数据，截图保存在临时目录；不访问官方来源或生产数据库。
- `tests/planning/pdf.integration.test.mjs`: 使用内存生成的 PDF 验证 PDF.js 提取到白名单规划的完整链路；`node --test tests/planning/pdf.integration.test.mjs`. 无需浏览器、数据库或网络。
- `tests/planning/synthetic-pdf.mjs`: 上述浏览器和 PDF 集成测试共享的合成 PDF 生成器，不单独执行，不写私人数据。
- `tests/planning/import-guard.test.mjs`: 导入较晚完成与编辑、载入、删除、新导入之间的竞争. `node --test tests/planning/import-guard.test.mjs`. 只用合成数据，不需网络服务、生产配置或凭据。
- `tests/planning/snapshots.test.mjs`: 多来源标识、项目独立版本、要求层级及分配去重. `node --test tests/planning/snapshots.test.mjs`. 只用合成数据，不需网络服务、生产配置或凭据。
- `tests/planning/database.integration.test.mjs`: 在隔离内存 PGlite PostgreSQL 中执行真实规划 SQL，测试迁移、外键、审核约束和回滚. `node --test tests/planning/database.integration.test.mjs`. 只用合成数据，不需网络服务、生产配置或凭据。
- `tests/planning/private-regression.mjs`: 明确选择运行的本地私人 PDF 回归。设置 `PLANNING_PRIVATE_PDF_DIR` 指向本地附件目录，然后运行 `node tests/planning/private-regression.mjs`。默认仅读取 PDF；显式设置 `PLANNING_PRIVATE_HAR_COMPARE=1` 可启用仅响应正文的离线 HAR 对照。不写原文，仅输出类型级计数、失败数量和一致性汇总。不得在公共 CI 提供附件或上传输出以外的数据。

- `tests/planning/private-har.test.mjs`：合成 XSSI/base64 响应解码、学术字段最小化、学分与年份一致性汇总，以及重复课程歧义排除测试。不使用真实附件 fixture。

- `tests/planning/audit-evidence.test.mjs`: 区分 audit 选项与课程记录，验证明确学分、版式提示和未核对层级。 `node --test tests/planning/audit-evidence.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/batch-import.test.mjs`: 多文件追加/替换原子性、受限 JSON 恢复及取消。 `node --test tests/planning/batch-import.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/schedule.test.mjs`: 独立排课覆盖、锁定学分组和去重学期汇总。 `node --test tests/planning/schedule.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/template.test.mjs`: 仅要求规则的种子白名单、明确审核、引用重映射和循环拒绝。 `node --test tests/planning/template.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/archive.integration.test.mjs`: 真实 PGlite 原文件归档、哈希验证、不可变解析版本、Unicode 兼容、版本冲突拒绝、回滚和恢复。 `node --test tests/planning/archive.integration.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/recommendation.test.mjs`: 负担/前缀上限、已完成排除、评分收缩/请求白名单、待审核样表、保留来源的建议应用、接受推荐时的备选选择和互斥课程组合。 `node --test tests/planning/recommendation.test.mjs`. 仅合成/公开 fixture；无外部服务、网络或持久化写入（PGlite 位于内存）。

- `tests/planning/test_inventory.py`: 官方学院索引、标题/版本元数据和发现边界。 `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. 离线合成 fixture；无服务或外部写入。

- `tests/planning/test_public_layouts.py`: 官方前缀别名、HTML 年级双列、可选暑期、音乐/工程/护理/建筑/公共卫生 PDF、换行学分、替代课和页脚排除。 `python3 -m unittest discover -s tests/planning -p 'test_*.py'`. 离线合成 fixture；无服务或外部写入。

- `tests/planning/directory.test.mjs`: 学院/专业覆盖、有界分页、明确要求学期分面及公开元数据最小化。仅合成/公开输入，无外部网络、数据库或写入。 `node --test tests/planning/directory.test.mjs`.

- `tests/planning/import-profile.test.mjs` 验证最小报告组合、明确的 Official/Planned 视图及专业标题。运行 `node --test tests/planning/import-profile.test.mjs`，仅合成输入，无网络或写入。

- `tests/planning/course-catalog.test.mjs` 验证公开标识白名单、重复查询合并、浮动学分和先修前缀继承。运行 `node --test tests/planning/course-catalog.test.mjs`，模拟传输，无网络或写入。

- `tests/planning/workspace.test.mjs` 验证课程位置复用、跨来源修读保护和学期默认值。运行 `node --test tests/planning/workspace.test.mjs`，仅合成输入，无网络或写入。

- `tests/test_planning_samples.py` 验证已检查的 CSE 表格与 Earth Sciences 选择组。运行 `python3 -m unittest discover -s tests -p test_planning_samples.py`，离线执行，无服务或写入。

- `tests/planning/automatic-import.test.mjs` 验证跨报告修读状态优先级、完整学业标题、自动保存及元数据隐私。运行 `node --test tests/planning/automatic-import.test.mjs`。仅合成数据，无网络或持久化写入。

- `tests/planning/requirement-search.test.mjs` 验证准确 GE 属性筛选和受限课程族回退。运行 `node --test tests/planning/requirement-search.test.mjs`。离线合成数据，无网络或写入。

- `tests/planning/cloud.test.mjs` 在内存 PGlite 中执行真实迁移，验证账户隔离、版本冲突、幂等重试、删除版本、通用模板脱敏、去重及客户端与服务端重复模板转换。运行 `node --test tests/planning/cloud.test.mjs`。仅合成数据，无网络、外部服务或持久写入。

- `tests/planning/reconcile.test.mjs` 验证跨设备规划并发编辑、删除、请求期间修改及首次同步标识重映射，同时覆盖重复推荐生成的同学期容器与超过 100 门课程的合并。运行 `node --test tests/planning/reconcile.test.mjs`。仅使用合成输入与模拟请求，无外部服务或持久写入。

- `tests/planning/groups.test.mjs` 课程与学分配额、备选组、已选备选课程跨学期移动或退回待安排区、重复审计视图和重复导入。 `node --test tests/planning/groups.test.mjs`. 仅使用合成输入与模拟请求，无外部服务或持久写入。

- `tests/planning/simulation.test.mjs` 学分与待安排区域的课程缓存、固定班次、避开时段、分段学期重叠、未知日期及已满班次提示。 `node --test tests/planning/simulation.test.mjs`. 仅使用合成输入与模拟请求，无外部服务或持久写入。

- `tests/planning/timetable.test.mjs` 逐次授课区分线上与线下，覆盖混合授课班次、未知地点、时间待定课程及周末时段。 `node --test tests/planning/timetable.test.mjs`. 仅使用合成输入，无外部服务或持久写入。

- `tests/planning/requirement-catalog.test.mjs` 学业类别课程筛选、分页和严格属性匹配。 `node --test tests/planning/requirement-catalog.test.mjs`. 仅使用合成输入与模拟请求，无外部服务或持久写入。

- `tests/planning/course-details.test.mjs` 共用课程详情面板、翻译、防止点击外侧误关及手机下拉关闭手柄。规划弹窗跨响应式断点保留子组件状态。 `node --test tests/planning/course-details.test.mjs`. 仅使用合成输入与模拟请求，无外部服务或持久写入。

- `tests/planning/backup.test.mjs` 验证跨环境备份恢复、稳定 ID、学期校区、班次选择、模拟偏好、旧版本升级、隐私字段白名单和取消操作。运行 `node --test tests/planning/backup.test.mjs`。只用内存样例，无外部服务和持久化写入。

`tests/catalog/detail-refresh.test.mjs` 覆盖收藏卡片的自动补全入口。`tests/catalog/change-budgets.test.mjs` 同时验证查询超时后的回滚与缩小批次重试。规划数据库集成测试通过内存 PGlite 和仓库公开样例验证不可变目录版本、重复发布、完整模板往返和事务回滚。这些测试均通过 `pnpm test` 运行，无需网络服务，不写外部数据库。

- `tests/calendar/ical.test.mjs` 验证有限 ICS 重复事件、排除日期、稳定标识、全天日历、UTF-8 折行、假期停课、夏令时换算及官方来源分区与稳定标识、东部时区的今天和跨月边界、全天事件排他结束及失效来源替换容量。运行 `node --test tests/calendar/ical.test.mjs`。仅合成样例，无外部服务或持久写入。
- `tests/planning/eligibility.test.mjs` 验证同学期的计划先修课不能解锁后续课程，以及年级限制维持待核对状态。运行 `node --test tests/planning/eligibility.test.mjs`。离线合成输入，无写入。

- `tests/calendar/security.test.mjs` 验证保留地址、无效协议、跨午夜事件拆分和过量旧重复规则。运行 `node --test tests/calendar/security.test.mjs`。离线合成输入，无网络或持久写入。
- `tests/calendar/sharing.test.mjs` 验证稳定订阅、实时修改、来源地址隐私、撤销、刷新租约、失败保留、实时官方来源引用与叠加去重、永久收藏链接及手动更新数字码。运行 `node --test tests/calendar/sharing.test.mjs`。内存 PGlite 迁移和模拟来源，无网络或外部数据库写入。
- `tests/development/accounts.test.mjs` 验证加密、自动拉取、三方冲突、过期预览、手动生产合并、多轮合并保留生产端独有修改、撤销和原子回滚。运行 `node --test tests/development/accounts.test.mjs`。内存 PGlite 与模拟生产传输，不访问或写入真实生产账号。
- `tests/user-data/share-selection.test.mjs` 验证按分类选择的初始状态、部分成员关系、重叠分类隐私、去重计数及还原选择后的草稿指纹。运行 `node --test tests/user-data/share-selection.test.mjs`。仅内存合成收藏，不使用服务或网络，不做持久写入。

## 同步、版本与完整性回归

`node --test tests/planning/sync-selection.test.mjs tests/syllabus/diff.test.mjs tests/calendar/security.test.mjs tests/calendar/ical.test.mjs tests/planning/requirement-catalog.test.mjs` 检查暂停恢复同步基线、学期分块、订阅刷新时间合并、并发字段修改、准确且有内存上限的大纲差异、Node DNS 回调约定、Canvas 作业／类别往返及官方要求属性。这些测试使用内存中的受控输入，不写应用数据，也不请求外部服务。`node scripts/user-data/audit.mjs` 是需配置数据库并主动运行的只读审计；参数、输出和失败行为见[用户数据](user-data.md#完整性审计只读)。不要将私密 SQL 导出作为测试语句执行。
