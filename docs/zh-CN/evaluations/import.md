# SEI／SSLE PostgreSQL 导入

[English](../../evaluations/import.md) · 简体中文

导入保留原始 JSONL 和规范化事实两层：原始记录用于追溯，关系表用于查询。先用 validate-only 校验格式、行数和自然键，再建立 PostgreSQL 数据库、安装驱动、初始化 schema 并导入。命令中的数据库地址与数据路径必须替换为自己的配置，不能提交凭据。

规范化自然键包含课程、学期、校区、班次、教师及量表等维度；重复运行按稳定键更新，不能根据显示姓名简单去重。合授班次可产生多个教师班次记录，不等于重复回答。

SEI 与 SSLE 使用不同量表，分别保存和计算，不能直接混成一个平均分。报告的响应数、邀请人数、班次记录数与不同人数是不同概念。

官方滚动窗口移除的资料保留为历史来源，不能因一次新导入缺失就物理删除。生产导入前检查备份、数据核对、事务回滚和只读查询权限。下方 SQL 包括课程、Mansfield 校区、教师历史与姓名变更查询。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```powershell
python scripts/evaluations/import_osu_sei_ssle_postgres.py `
  --file .\data\raw\blue-sei-ssle-su22-su26\osu_sei_ssle_all.jsonl `
  --validate-only `
  --expected-rows 68729
```

```text
rows: 68729
sections: 62484
evaluation_natural_keys: 68729
instructors: 7108
course_keys: 8738
SEI: 50365
SSLE: 18364
```

```powershell
python -m pip install "psycopg[binary]>=3.2"
```

```powershell
docker run --name osu-postgres `
  -e POSTGRES_USER=osu_app `
  -e POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD `
  -e POSTGRES_DB=osu_data `
  -p 127.0.0.1:5432:5432 `
  -v osu_postgres_data:/var/lib/postgresql/data `
  -d postgres:17
```

```powershell
docker ps
```

```powershell
python scripts/evaluations/import_osu_sei_ssle_postgres.py `
  --file .\data\raw\blue-sei-ssle-su22-su26\osu_sei_ssle_all.jsonl `
  --schema .\db\schemas\evaluations.sql `
  --dsn "postgresql://osu_app:CHANGE_THIS_PASSWORD@localhost:5432/osu_data" `
  --init-schema `
  --expected-rows 68729
```

```text
term
subject
course
section
instructor
instructor_name_observation
evaluation
```

```sql
SELECT *
FROM osu_eval.mv_instructor_course_summary
WHERE subject = 'MATH'
  AND catalog = '1151'
ORDER BY instrument, response_weighted_rating DESC NULLS LAST;
```

```sql
SELECT *
FROM osu_eval.v_evaluation_detail
WHERE campus_code = 'MNS'
  AND active_in_any_source
ORDER BY term_sort_key DESC, subject, catalog, class_number;
```

```sql
SELECT
    term,
    subject,
    catalog,
    class_number,
    instrument,
    rating,
    n_responses,
    invited_count,
    response_ratio
FROM osu_eval.v_evaluation_detail
WHERE name_dot_number = 'example.123'
  AND active_in_any_source
ORDER BY term_sort_key;
```

```sql
SELECT
    i.name_dot_number,
    t.label,
    o.first_name,
    o.last_name
FROM osu_eval.instructor_name_observation o
JOIN osu_eval.instructor i ON i.id = o.instructor_id
JOIN osu_eval.term t ON t.id = o.term_id
WHERE i.name_dot_number = 'example.123'
ORDER BY t.sort_key;
```
