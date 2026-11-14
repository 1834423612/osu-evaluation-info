# 课程同步运维

[English](../../catalog/operations.md) · 简体中文

首次部署或升级时显式运行 `pnpm catalog:migrate`；计划任务不执行 DDL。同步使用独立 `osu_catalog` schema，按学期、校区和学科分区发现、分页、重试、核对计数，并将断点与数据一起提交。未完成任务默认续跑，`--new-run` 明确开始新一轮。

只有完整分区和父子身份校验通过后才能原子发布不可变版本。advisory lock 避免重叠；事务和连接有边界，不在外部请求期间持有长事务。失败扫描不能替换可用副本。

课程和班次版本永久保留，旧清理选项不删除已发布数据。每学期选择最近完整主版本；当前删改反映在新目录，旧收藏可恢复其最近完整历史副本。官方学期消失只改变来源状态，不清空本地归档。迁移第 4 版增加学期主版本与完整官方学期观察。

GitHub 课程任务按纽约时间每四小时调度。实际执行可能延迟，页面以同步时间为准。空位仍由浏览器实时查询，目录同步不能提供实时席位保证。更多恢复规则见同目录 `lifecycle.md`。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
pnpm catalog:migrate
pnpm catalog:sync
```

```sh
CATALOG_DATABASE_TEST=1 node --test tests/catalog/snapshots.integration.test.mjs
```

```sh
CATALOG_DATABASE_TEST=1 node --test tests/catalog/*.test.mjs
```

```sh
CATALOG_LIVE_TEST=1 node --test tests/catalog/live-sync.integration.test.mjs
```
