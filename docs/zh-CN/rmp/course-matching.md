# RMP 课程关联

[English](../../rmp/course-matching.md) · 简体中文

保留 RMP 原始课程标注，通过完整官方课程词汇、教师任课证据、校区与编号进行可重复关联。大小写、空格和缩写可用于候选发现，但不能仅删除标点或写死几个别名就确认关系。

课程号、小数及 Honors 后缀保留；不同校区分别判断。多个同等级候选保持歧义，不强行选一个；课程与教师身份是两个独立确认层级。未知身份的原始评论仍保留，并在课程线索或教师库中标注状态。

运行脚本会刷新证据支持的映射与审计，显式人工接受／拒绝决定保留。正常重复采集后可重新执行，不需要人工逐条修补数据库。dry-run 只读，写入前先完成必要的增量 schema 安装。

预览、分页和汇总使用一致的课程约束。未确认档案自己的评分可显示，但不混入课程总分。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```sh
python3 -m venv .cache/rmp-python
. .cache/rmp-python/bin/activate
python -m pip install -r scripts/rmp/requirements.txt
pnpm rmp:mappings --coverage-only
pnpm rmp:mappings --dry-run --audit-report /tmp/rmp-audit.json
pnpm rmp:mappings --audit-report /tmp/rmp-applied.json
```

```sh
python3 -m unittest discover -s tests/rmp -p 'test_*.py'
RMP_INTEGRATION_TESTS=1 node --env-file=.env.local --test tests/rmp/course-matching.integration.test.mjs
```
