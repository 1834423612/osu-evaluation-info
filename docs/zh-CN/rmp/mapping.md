# RMP 与 OSU 教师映射

[English](../../rmp/mapping.md) · 简体中文

RMP 教授和 OSU 教师各自保留来源 ID，通过 `professor_identity_map` 显式关联到 `name_dot_number`。原始评论始终按 RMP review ID 保存，后续采集重复执行不制造新评论身份。

自动接受要求规范化精确姓名、校区、学术身份、重叠课程，以及唯一得到充分支持的官方账号。只有姓名或高候选分数不足以确认。dry-run 和候选导出只读，人工 `--accept`／`--reject` 必须有来源证据。

默认读取所有完整目录学期和有效官方评价历史；未完成目录分区不参与。读取使用同一只读重复快照，写入有事务和冲突保护。正数 term-window 可限制调查范围，不能改变默认的历史覆盖语义。

再次采集后可重新运行，显式人工决定保留；账号、校区或任课证据未知时保持对应状态，不伪造邮箱和官方教学记录。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
python3 scripts/rmp/sync_rmp_mappings.py --dry-run \
  --export-candidates /tmp/osu-rmp-mapping-candidates.jsonl
```

```sh
python3 scripts/rmp/sync_rmp_mappings.py --accept 123456:smith.42 --reason "Verified from department faculty page"
python3 scripts/rmp/sync_rmp_mappings.py --reject 123456:jones.8 --reason "Different person; same name"
```
