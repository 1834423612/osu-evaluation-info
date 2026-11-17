# Umami 统计与只读检索审计

[English](../../analytics/umami.md) · 简体中文

## 3.5 统计与回放

所有路由均接入共享统计组件，包括 `/planning`。规划视图、学期看板、毕业要求、课程详情与搜索、推荐、四年示例、报告和同步均有稳定的界面区域标识。共享事件处理器覆盖按钮、链接、标签页、自定义选择框、复选框、表单和滚动深度，自定义选项变更、PDF 导入结果及拖拽也发送独立事件。学业工作区仅保留白名单内的静态操作元数据和数量。规划主体及弹窗门户通过 `rr-block` 屏蔽回放内容，规划异常载荷停止发送。导入文本、文件名、个人课程选择和专业细节保持在事件之外。分享与接收地址中的资源标识统一替换为 `[id]`。

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

## 录制启动与回放显示

并发启动事件会等待首次采集返回的访问令牌，最多暂候 100 个载荷、30 秒。录制脚本在令牌可用后加载，避免 SDK 的短暂启动窗口被慢速首次请求耗尽。采样、遮挡和最长时长仍使用远端配置。

暂停或定位回放时，播放器可能把浮层的入场动画冻结在第一帧。仅回放生效的 CSS 会在 `html.rrweb-paused` 存在时，让已打开的抽屉、面板、对话框、选择器和浮窗保持展开布局，不改变网站正常使用或播放过程中的动画。

## 防火墙检查

追踪请求成功不代表录制完整。除小型变化事件外，还需确认**完整快照**请求成功。防火墙可能拒绝较大的 HTML/CSS 快照并返回 403，却接收后续事件。缺少 CORS 响应头时，浏览器可能只显示 `net::ERR_FAILED`，导致后台仅有变化记录而缺少可用的初始页面。

2026 年 11 月 14 日的合成生产构建检查复现了宝塔 WAF 对约 340 KiB 完整快照的拦截。为采集路径配置精确例外后，1440 和 390 像素检查均成功上传全部分块，通过认证 API 读回自己的录制，并核对了现场与重建后的搜索框、学期菜单、详情和滚动偏移。这是上述流程在该日期的验证结果，不代表所有录制都已验证。

优先仅对 `POST /api/record` 设置站点级的正文误报规则例外，不关闭整个防火墙，也不放行全部 API。宝塔 URL 白名单可能跳过大部分 WAF 检查；如果只能使用路径白名单，应另外保留该接口限流，参见[宝塔 WAF 说明](https://www.bt.cn/bbs/thread-73847-1-1.html)。保留 Umami 令牌校验和请求大小限制。缺失快照无法仅从后续变化还原，修复规则后应检查新录制。

## 真实回放回归检查

`tests/analytics/replay.browser.mjs` 使用模拟脚本，验证默认设置、全页面覆盖、六秒采集启动延迟和主动关闭行为。单独的真实检查会有意创建合成 Umami 流量：

```sh
pnpm build
pnpm exec next start --hostname 127.0.0.1 --port 3001
```

在另一个终端使用已配置的公开追踪／网站参数及仅服务端使用的 `UMAMI_API_KEY` 执行：

```sh
ALLOW_UMAMI_WRITES=1 REPLAY_REQUIRE_ROUND_TRIP=1 \
USER_DATA_TEST_BASE_URL=http://127.0.0.1:3001 \
node tests/analytics/replay-live.browser.mjs

ALLOW_UMAMI_WRITES=1 REPLAY_REQUIRE_ROUND_TRIP=1 REPLAY_TEST_WIDTH=390 \
USER_DATA_TEST_BASE_URL=http://127.0.0.1:3001 \
node tests/analytics/replay-live.browser.mjs
```

课程及其他应用数据 API 使用合成数据，本站统计接口不写入真实测试事件。Umami 脚本、录制接口和远端配置则是真实服务。检查要求使用同一访问令牌、录制分块均被接收、API 响应包含完整快照，并比较可见控件数量、位置、尺寸和面板滚动。它使用固定的 rrweb 2.1.7 重建，将合成截图／事件放在 `USER_DATA_SCREENSHOT_DIR`，默认 `.cache/replay-live`。不要发布真实浏览器配置中的录制。这些合成访问按 Umami 保留期清理，活动由 `qa_replay_verification` 标记。

必要时使用通用的 `PLAYWRIGHT_MODULE`、`PLAYWRIGHT_CHROMIUM_EXECUTABLE` 配置。宿主无法读取工作区符号链接时，可用 `REPLAY_RRWEB_DIR` 指定已安装的 rrweb 包目录。API key 仅存在于测试进程和认证请求头，不注入浏览器。
