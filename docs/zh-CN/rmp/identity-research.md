# 教师身份来源核验

[English](../../rmp/identity-research.md) · 简体中文

研究流程对未关联 RMP 档案执行官方人员查询，组合独立网页检索、院系联系区块和历史 PDF 证据，再保存候选、来源、状态和判定。无结果、请求失败、结构不可解析和截断是不同状态。

精确官方账号、完整姓名、校区、本人课程及院系提供分层证据。同名或搜索摘要不能自动证明身份；相同强度的多个账号保留歧义。当前职务需要当前官方证据，旧 PDF 职务保存为历史，不伪装现职。

扫描可按断点和预算重复执行；网页与 PDF 读取有地址、页数、大小与时间边界，不执行文档代码。应用步骤保留人工决定，不合并或改写源评论。

数据库重放只使用已保存的来源证据重新计算账号、原因和分类，可比较摘要指纹以确认可重复性。真实数据库测试使用临时 schema 并在结束时回滚／清理。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
pnpm rmp:research:scan
pnpm rmp:research:scan --legacy
pnpm rmp:research:review \
  --journal data/local/rmp/identity-directory-scan.jsonl \
  --journal data/local/rmp/identity-legacy-scan.jsonl \
  --install-schema --apply
pnpm rmp:mappings --require-schema
```

```sh
pnpm rmp:research:review \
  --journal data/local/rmp/identity-directory-scan.jsonl \
  --journal data/local/rmp/identity-legacy-scan.jsonl \
  --journal data/local/rmp/identity-account-scan.jsonl \
  --web-journal data/local/rmp/identity-web-profile-scan.jsonl \
  --web-index data/local/rmp/web-search-index \
  --pdf-journal data/local/rmp/identity-pdf-profile-scan.jsonl \
  --apply
```

```sh
pnpm rmp:research:review --from-database --report /tmp/rmp-replay.json
```
