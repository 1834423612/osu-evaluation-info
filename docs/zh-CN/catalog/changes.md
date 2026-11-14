# 课程更新记录

[English](../../catalog/changes.md) · 简体中文

“课程探索 → 课程更新”（`/updates`）显示完整官方开课目录中的新增、恢复、调整和不再收录记录，可按学期、校区、代码／标题、类型及 7／30／90 天筛选。数字表示变化记录，不是不同课程或学生数。仅在该 offering 仍列于学期最新完整快照时开放课程跳转，并保留学期／校区；否则提示历史副本留存，避免旧事件链接到空结果。

## 口径与覆盖

新增开课表示同一学期的课程／offering／校区键在上次完整快照后出现，不代表大学首次设立这门课。曾经出现过的键重新加入时单列为恢复。每个学期首次完整同步只建基线，不生成整学期新增；官方学期列表消失也不生成整学期移除。

时间为完整快照的检测／发布时间，按浏览器时区标注；`effectiveDate` 不当作新增或公告时间。正式提案、审批和撤课另见 [注册办公室官方档案](https://registrar.osu.edu/staff-resources/class-catalog-and-space/circulating-forms-archive/)，页面提供独立入口。

对比代码、标题、规范化介绍、学分、课程层次、评分方式、属性、班次／状态、教师、时间、地点和授课方式。人数、等待名单、容量、内部 parent、抓取与生效时间不生成事件。教师、会议和属性数组的顺序及重复项会规范化；新增班次不会把所有共享班次误标为教师或课表变化。

## 安装与历史回填

```sh
pnpm catalog:migrate
node scripts/catalog/backfill_changes.mjs --max-batches 12
```

第 5 版迁移增加只追加的 `change_batches`、`course_changes`、索引和对比函数，不改写源快照。回填仅使用已有完整发布版本，不请求 OSU；使用课程维护锁，每次提交一个学期批次。默认最多 12 批，显式预算为 1–200。已完成批次自动跳过，中断后可重复运行。

课程目录仍原子发布；变化索引随后在独立、受限事务中建立，失败只延后整理，不使已发布目录失效。课程计划任务在原有维护后补齐最多 12 个待处理批次，不执行 DDL。部署要求第 5 版 schema 的代码前先迁移。

2026-11-13 的首次回填覆盖 12 次完整同步、36 个学期批次，得到 310 条记录：13 条新增、292 条调整、5 条不再收录。这是已有观察区间的历史，不是全校首次设课或实时数量。

## 接口与分页

`GET /api/catalog/changes` 接受 `term`、`campus`、`q`、`kind`、`days`、`cursor`，每页最多 24 条，并返回分类计数、覆盖状态和下一页游标。行与计数在同一只读重复快照事务中读取。相同请求合并，最多缓存 32 页／4 MiB／60 秒、32 个不同待处理键；超额返回 429 与 Retry-After。访问页面只读变化索引，不扫描全部历史或请求官方。

分页固定筛选、首个事件 ID 上界和时间窗口；保留数据库六位小数时间，避免 JavaScript 毫秒截断漏掉同一次同步的其他条目。新写入不会在现有分页中插入重复记录。归档学期、尚无对比和待整理历史各自标注；失败不伪装为无结果。

## 验证

```sh
node --test tests/catalog/changes.test.mjs
CATALOG_DATABASE_TEST=1 node --env-file-if-exists=.env.local --test tests/catalog/changes.integration.test.mjs
node tests/catalog/changes.browser.mjs
```

集成检查使用临时 schema，覆盖基线、校区隔离、调整、新增、恢复、学期消失、易变字段、重复执行、未发布拒绝与追加保护。浏览器检查覆盖中英文 320／390／768／1440px、表单、课程跳转、时区、空与错误状态。`CATALOG_CHANGES_REAL_TEST=1` 额外只读核对真实数据库 API 分页。浏览器变量为 `CHANGES_TEST_BASE_URL`、`CHANGES_TEST_OUTPUT`、`PLAYWRIGHT_MODULE` 和 `PLAYWRIGHT_CHROMIUM_EXECUTABLE`。
