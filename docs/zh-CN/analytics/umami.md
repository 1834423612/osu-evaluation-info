# Umami 统计与只读检索审计

[English](../../analytics/umami.md) · 简体中文

## 3.5 统计与回放

统计脚本启用 `data-errors="true"`、性能统计和去除 URL 片段。`data-release` 使用网站构建版本，`data-environment` 标注网站部署环境；二者都不是 Umami 服务版本。资源 URL 添加 `NEXT_PUBLIC_UMAMI_ASSET_VERSION`（默认 `3.5.0`）以避免旧 CDN 文件；代理缓存键必须包含该参数。React 错误边界也通过 `captureException` 上报。

配置录制脚本后，所有页面默认启用回放，包括账号、收藏、历史和分享页。前端不覆盖远端的采样、时长、输入屏蔽等录制参数，也不因进入这些页面而停录或刷新。浏览器 DNT、GPC、Dev Tools 跳过统计以及用户明确保存的关闭设置仍生效；缺省和旧配置中的缺省回放值均为开启。持久关闭设置在挂载脚本前读取，避免首次加载短暂录制。

分享访问凭据在统计启动前从 URL 片段提取；普通事件不复制原始表单内容。请在 Umami 远端配置并验证输入屏蔽规则。回放测试模拟统计资源，不会把测试内容发送给真实统计服务。

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
