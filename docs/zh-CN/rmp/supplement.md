# 旧 SQLite 补充资料

[English](../../rmp/supplement.md) · 简体中文

旧 SQLite 中独有的教授档案与无法确认源 review ID 的评论作为独立补充保存，不能覆盖 PostgreSQL 主来源或冒充已确认的新评论。保留原文件、来源标签和可复核的指纹。

缺少不可变 ID 时，不把正文／日期指纹相同视为确定同一条评论；日期截断也可能合并不同源记录。无法可靠去重的内容单独展示，不重复计入评论数和评分。

导入先 validate／dry-run 核对，再显式写入；重复运行按补充来源键保持幂等。备份运行中的 SQLite 应使用 backup API，不能只复制主文件而遗漏 WAL。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
python3 scripts/rmp/import_rmp_supplement.py --dry-run
python3 scripts/rmp/import_rmp_supplement.py
```
