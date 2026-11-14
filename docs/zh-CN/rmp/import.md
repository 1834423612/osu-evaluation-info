# RMP 采集与维护

[English](../../rmp/import.md) · 简体中文

采集器通过受限节奏的 GraphQL 请求保存原始教授、评论和校区关系。遵守已有采集授权与请求预算，不因用户打开页面就全量抓取。每批教师、分页、重试与间隔都有上限；429 尊重 Retry-After。

教授和评论使用稳定源 ID，保留完整原始 JSON、时间、独立分数、评论详情和运行游标。数据与断点一起提交，失败可续跑。显式迁移先于采集和映射，正常计划任务不能夹带 DDL。

采集、身份关联、课程关联按顺序运行；自动规则可重复，已确认人工决定保留。官方源删除／缺失采用软状态，无法匹配不删除 RMP 原数据。

教师库读取服务器副本并标注同步时间；官方评价和 RMP 不混分。维护命令及可选旧资料导入如下，执行时使用受控环境中的数据库凭据。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
pnpm rmp:collect --confirm-authorization
```

```sh
pnpm rmp:collect --confirm-authorization --max-requests 1
pnpm rmp:collect --confirm-authorization
```

```sh
pnpm rmp:collect --confirm-authorization --new-run --full-refresh
```

```sh
pnpm rmp:mappings --dry-run
pnpm rmp:mappings
```

```sh
pnpm rmp:mappings --accept RMP_ID:lastname.123 --reason 'Verified public course and department evidence'
pnpm rmp:mappings --reject RMP_ID:lastname.123 --reason 'Different instructor'
```

```sh
pnpm rmp:collect --confirm-authorization && pnpm rmp:mappings
pnpm rmp:mappings --coverage-only
# Optional while retaining the legacy source archive:
pnpm rmp:supplement
```

```sql
SELECT id, status, started_at, completed_at, validation_status,
       expected_reviews, observed_reviews, deletion_check_status, last_error
FROM osu_rmp.collection_run
ORDER BY id DESC
LIMIT 5;

SELECT s.campus_code, s.name, s.search_result_count,
       count(DISTINCT ps.professor_id) AS professors
FROM osu_rmp.school s
LEFT JOIN osu_rmp.professor_school ps ON ps.school_id = s.legacy_id
GROUP BY s.legacy_id
ORDER BY s.campus_code;

SELECT count(*) FILTER (WHERE active) AS active_reviews,
       count(*) FILTER (WHERE NOT active) AS inactive_reviews
FROM osu_rmp.review;

SELECT state, count(*) FROM osu_rmp.professor_identity_map GROUP BY state;
SELECT kind, count(*) FROM osu_rmp.legacy_supplement GROUP BY kind;
```

```sh
python3 -m unittest discover -s tests -p 'test_rmp_*.py'
```
