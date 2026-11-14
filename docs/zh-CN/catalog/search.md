# 课程搜索引擎

[English](../../catalog/search.md) · 简体中文

检索词汇来自完整已发布课程目录，不维护少数学科的手写简称表。字段加权 BM25 召回结合规范化、学科名／缩写、编辑距离、拆词合词、课程号相邻换位和说明片段；歧义保留为候选，不能把搜索相似度用于教师身份确认。

完整代码使用轻量 `/api/catalog/subjects` 词表，唯一且足够明确时，浏览器在包含词表解析的两秒预算内尝试一页官方查询。冷浏览器可能另需官方学期元数据。空、慢、失败或歧义回到本地容错索引；不对其他课程号逐个向官方扩散请求。官方部分页保留不完整标记，打开课程再补全详情。

筛选条件必须同时匹配同一个班次；分页游标固定查询、筛选和已发布版本。搜索建议保留原输入，不偷偷修改用于评分的课程身份。普通浏览与精确查询、实时空位有不同的数据路径。

服务端相同查询合并一次排名与页面补全，缓存最多 96 页、序列化数据 12 MiB、120 秒；最多 128 个不同待处理键。词表另限 8 项／512 KiB，浏览器保留最多 8 学期词表五分钟。超额返回 429 与 Retry-After，不自动转向官方放大负载。数据库读取使用现有连接池和只读事务。

全量只读评估按学科覆盖代码、标题、描述、简称和多种拼写扰动，输出召回率、排名和耗时；不是少量人工样本，也不是生产成功率保证。2026-11-13 本机 200 个相同热查询的 p95 为 416 ms；首次冷描述检索仍需约 8.6 秒。该结果不等于 200 个不同线上查询的性能承诺。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-spring.json
SEARCH_EVAL_TERM=1268 node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-autumn.json
SEARCH_EVAL_TERM=1264 node --expose-gc --env-file=.env.local scripts/search/evaluate.mjs /tmp/search-summer.json
```

```sh
node scripts/catalog/benchmark-search.mjs
```
