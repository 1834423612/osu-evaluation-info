# 官方课程接口与浏览器传输

[English](../../catalog/api.md) · 简体中文

完整课程代码先在浏览器尝试一页官方结果；标题、介绍和容错匹配查询 `/api/catalog/search` 的已发布目录索引。索引返回来源、同步时间、匹配证据、计数和固定版本的 `s:` 游标。官方课程请求不由网站服务器代理。

`/api/catalog`、`/api/catalog/course`、`/api/catalog/facets`、`/api/catalog/availability` 返回固定的 `OfficialEndpointPlan`。浏览器验证获准的 OSU 地址，匿名直接读取并规范化；官方配置缓存一小时，同时读取合并。关闭一个视图不会取消其他订阅者。配置响应允许短期共享缓存，不包含 Cookie 或密钥。

历史 SEI／SSLE 另行批量补充。官方失败时只使用已校验的完整 PostgreSQL 目录副本，明确标记归档来源；失败与无结果分开。课程代码、offering、学期、校区和班次不能因容错建议而改写。

空位、选课和等待人数只来自单独的实时官方请求，不能复用旧快照值。精确查询保留完整编号、小数和后缀；多页详情在边界内合并，不能把近似编号当成精确结果。参数、响应示例和同步命令如下。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```json
{
  "delivery": "osu-direct",
  "version": 1,
  "resource": "catalog",
  "endpoints": {
    "search": "https://content.osu.edu/v2/classes/search",
    "terms": "https://content.osu.edu/v2/classes/searchableTermsV2",
    "availability": "https://content.osu.edu/v2/classes/availability"
  }
}
```

```sh
node scripts/catalog/sync_osu_catalog.mjs
```

```sh
node scripts/catalog/sync_osu_catalog.mjs --discover-only
node scripts/catalog/sync_osu_catalog.mjs --term 1272
node scripts/catalog/sync_osu_catalog.mjs --max-pages 5
node scripts/catalog/sync_osu_catalog.mjs --new-run
```
