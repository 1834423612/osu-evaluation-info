# Umami 统计与只读检索审计

[English](../../analytics/umami.md) · 简体中文

前端只上报已定义的课程、筛选、收藏、翻译和结果事件。未配置公开 tracker 地址时不加载统计；开发工具可临时关闭统计并恢复用户原设置。事件参数只保留必要维度，不发送教师邮箱、原文、异常堆栈或访客标识。

检索提交和结果加载是不同事件，不能混用分母。结果区分成功、已确认无结果、不完整窗口、筛选冲突和请求失败；没有结果事件不表示零失败。分页、浏览模式和模拟响应不作为新的真实搜索提交。

服务端审计使用 `.env.local` 的 `UMAMI_API_KEY`，不能加 `NEXT_PUBLIC_`。API 地址默认采用 tracker origin，可由 `UMAMI_API_BASE_URL` 指定。脚本仅发认证 GET，完整遍历事件和属性分页；拒绝截断结果。报告按生产域名隔离，只输出汇总与搜索词，不包含会话 ID、地理位置、来源页或密钥。生成报告不得提交公开仓库。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```dotenv
NEXT_PUBLIC_UMAMI_WEBSITE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
NEXT_PUBLIC_UMAMI_TRACKER_URL=https://example.com/umami_main.js
NEXT_PUBLIC_UMAMI_RECORDER_URL=https://example.com/recorder.js
```

```sh
node --env-file=.env.local scripts/analytics/analyze-search.mjs /tmp/osu-search-audit.json
```

## 搜索结果事件字段

| 属性                               | 含义                                                                  |
| ---------------------------------- | --------------------------------------------------------------------- |
| `status`                           | `matches`、`no_matches`、`continuation`、`filter_conflict` 或 `error` |
| `result_count` / `total_courses`   | 当前页课程数／已知匹配总数；未知总数为 `-1`                           |
| `complete` / `has_more`            | 候选扫描是否完整／是否还有下一页                                      |
| `search_term` / `search_type`      | 与提交事件使用相同的规范化输入标签                                    |
| `match_kind`                       | 识别到的课程代码、编号、学科或关键词                                  |
| `search_engine` / `fuzzy_results`  | 引擎版本与本页明确标注的近似结果数                                    |
| `index_fallback`                   | `none`、`unavailable` 或 `filter`，区分索引查询与有限实时回退         |
| `term` / `campus` / `filter_count` | 所选学期、校区和筛选数量，不复制任意筛选值                            |
| `duration_ms`                      | 结果加载耗时，取整并限制在两分钟内                                    |
