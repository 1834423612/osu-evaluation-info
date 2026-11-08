# 翻译节点状态与管理

管理入口是 `osu_translation.v_provider_status` 或 `pnpm translation:status`。
历史失败次数、当前健康状态、请求是否能执行，是三个不同概念，分别查看对应字段和视图。
Google 始终由用户浏览器直接请求；网站服务器只调用 Ollama。

## 数据分工

| 表                       | 用途                                                           | 能否决定路由                                 |
| ------------------------ | -------------------------------------------------------------- | -------------------------------------------- |
| `provider_nodes`         | 节点目录、执行位置、NAS 启停、超时、并发和冷却设置             | 服务端配置可以；浏览器行仅说明固定客户端配置 |
| `provider_state`         | NAS 当前状态、连续失败、下次重试、最后成功、最后失败和状态版本 | 可以，是多个网站进程共享的状态               |
| `provider_attempts`      | 每次实际 NAS 调用、探测标记、结果、错误分类、耗时及并发租约    | 有效租约决定并发；历史结果不直接决定当前状态 |
| `provider_transitions`   | 从哪个状态变到哪个状态、原因、时间、对应调用与操作来源         | 审计记录，只用于追溯                         |
| `browser_provider_state` | 匿名页面会话中各 Google 节点最新的自报状态                     | 只供观测，不能控制 NAS 或其他用户            |
| `usage_daily`            | 新的历史汇总，明确区分服务端、浏览器自报和网站调度来源         | 不能，不是可用性表                           |
| `daily_usage`            | 保留旧版统计；视图标为 `legacy_unknown`，不猜测旧数据来源      | 不能，不再由新程序写入                       |

没有原文、译文、提示词、IP、账号、模型地址或 Access 密钥写入这些表。
配置变化的识别使用不可逆指纹；命令输出不显示指纹或凭据。

## 当前状态

| `health`       | 中文含义                       | 后续行为                                                         |
| -------------- | ------------------------------ | ---------------------------------------------------------------- |
| `unconfigured` | 未配置                         | 完成 URL、模型及必要凭据配置后，下一进程启动或管理命令会同步配置 |
| `disabled`     | 人工停用                       | 仅人工 `enable` 恢复；普通失败永远不会把节点变成人工停用         |
| `unknown`      | 待验证                         | 下一次实际请求只允许一个验证请求                                 |
| `healthy`      | 最近调用正常                   | 按配置的并发上限工作                                             |
| `degraded`     | 慢响应，或健康节点首次普通失败 | 短暂分流；到期后单次探测                                         |
| `cooldown`     | 暂时冷却                       | 必须有 `next_retry_at`；到期后自动允许单次恢复探测               |
| `recovering`   | 正在验证或恢复探测             | 仅一个探测运行；其他请求分流                                     |
| `per_device`   | Google 按浏览器隔离            | 查看浏览器会话统计，没有全局“Google 失败”状态                    |

NAS 正常路径：`unknown → recovering → healthy`。
探测失败：`recovering → cooldown → 到期后的 recovering → healthy`。
慢响应：`healthy → degraded → 到期后的 recovering`。
健康状态超过五分钟未验证时，下次请求重新单次验证。

失败恢复没有终止次数：连续失败增加冷却时间，但冷却最多五分钟。
探测成功立即清零连续失败并清除重试等待。`last_failure_at` 和
`last_failure_kind` 保留为历史，不能据此把已经恢复的节点再次视为失败。
缓存命中不生成模型调用，也不会伪装成健康探测。

## 是否现在可以执行

总览的 `availability` 是当前可执行动作，不能只看 `health`：

| `availability`   | 含义                                                 |
| ---------------- | ---------------------------------------------------- |
| `ready`          | 可以调用                                             |
| `ready_to_probe` | 冷却已经到期，或状态待验证，下一请求可以探测         |
| `waiting_retry`  | 等待 `next_retry_at`                                 |
| `busy`           | 并发名额已满、已有慢请求或已有恢复探测，分流给浏览器 |
| `disabled`       | 人工停用，等待人工启用                               |
| `unconfigured`   | 等待配置                                             |
| `per_device`     | 由各浏览器自己的状态机决定                           |

数据库中的原始 `cooldown` 行可以在等待请求期间保留；总览根据当前时间显示
`ready_to_probe`，不会把“等待新请求探测”误显示成永久不可用。
所有时间以 UTC 存储和输出。

## 管理命令

先执行一次增量初始化；重复执行不会清空已有状态或统计：

```sh
pnpm db:translation:init
pnpm translation:status
pnpm translation:status --json
```

```sh
# 查看最近三十次实际调用和状态变更
pnpm translation:manage attempts ollama
pnpm translation:manage history ollama

# 清除当前等待，允许下次实际请求重新验证；不删除历史
pnpm translation:manage retry ollama

# 立即进行一次真实恢复探测，不启动常驻进程
pnpm translation:manage probe ollama

# 人工停用 / 恢复；停用会阻止新的 NAS 调用，已有缓存译文仍可使用
pnpm translation:manage disable ollama
pnpm translation:manage enable ollama

# 立即更新数据库中的调度设置，不需要重启网站
pnpm translation:manage configure ollama --timeout-ms 6000 --slow-ms 2500 --cooldown-ms 30000 --concurrency 1
```

范围：超时 500–8000 ms，慢响应阈值 250–8000 ms，基础冷却
1000–300000 ms，并发 1–8。建议从并发 1 开始。

环境变量继续管理 URL、模型和 Cloudflare 凭据，修改这些内容后重启全部网站进程。
首次同步时，数据库从原有环境变量取得超时等默认值；之后这四项调度设置以
`provider_nodes` 和 `configure` 命令为准，重启不会覆盖人工调整。
配置变化、启停或人工重试会提升 `generation`、取消旧租约并记录操作，旧版本请求的
迟到结果不能覆盖新状态或进入新译文缓存。仍使用旧凭据配置的进程会被版本检查拒绝，
直到重启，避免旧进程把新配置再次标成失败。

管理命令不提供 Google 的全局失败、重试或禁用开关，因为它们由用户设备执行。
Google 每个页面使用同一套状态转换规则，恢复探测和冷却互相独立。
匿名页面会话只在本次页面生命周期有效，不使用持久用户标识。报告带递增序号，
迟到、重复的报告不能把较新的浏览器状态覆盖回旧失败状态。

## 常用数据库视图

```sql
-- 首选入口：现在处于什么状态，下一步能做什么
SELECT provider, execution, health, reason, availability, active_requests,
       consecutive_failures, next_retry_at, last_success_at, last_failure_kind
FROM osu_translation.v_provider_status ORDER BY priority;

-- 追溯 NAS 何时失败、何时开始恢复、为何变更
SELECT * FROM osu_translation.v_state_history WHERE provider = 'ollama' LIMIT 30;

-- 只看实际模型调用，明确区分成功、失败、超时、租约过期和人工取消
SELECT * FROM osu_translation.v_recent_attempts WHERE provider = 'ollama' LIMIT 30;

-- 统计调用结果；与缓存、繁忙、冷却跳过等决策分开
SELECT * FROM osu_translation.v_daily_attempts ORDER BY day DESC;
SELECT * FROM osu_translation.v_daily_routing ORDER BY day DESC;
```

`v_provider_status` 中的 Google 会话统计只展示近三十分钟的浏览器报告。
这些数据是客户端自报，不是中心服务器对全球 Google 可用性的判断。

## 过期、重启与故障

NAS 的名额由 PostgreSQL 短事务和行锁分配，模型推理期间不持有数据库事务。
多个网站进程共享并发上限和单次恢复探测。实际请求有有限期租约；
工作进程退出或取消信号被忽略时，后续请求会回收过期租约，记录 `expired`，
再尝试恢复，不会永远停在 `recovering`。

配置了数据库但数据库不可用时，NAS 分配会暂时停止，浏览器继续直接尝试 Google。
此时不会启动另一套与数据库矛盾的本地共享状态。未配置数据库的安装使用同一状态机的
内存实现，状态仅在该进程内共享。

没有后台轮询或独立健康检查服务。自动恢复由新的翻译请求触发；`probe` 命令可手动触发。
请求后的维护保留三十天调用详情、九十天状态变更和统计、一天匿名浏览器报告。
`TRANSLATION_USAGE_ENABLED=false` 只关闭历史汇总计数，不关闭必要的当前状态和审计。

错误分类 `auth` 表示认证问题，例如 Cloudflare Access 返回登录跳转或 401/403。
`rate_limit` 表示 429，`network` 表示连接异常，`http` 表示其他上游错误，
`invalid_response` 表示结构或译文校验失败，`timeout` 表示超时，
`lease_expired` 表示进程退出或旧请求没有正常结束。它们都可以进入有限冷却并继续探测；
鉴权配置有误仍需修正配置，自动探测不会绕过鉴权。

环境变量名和请求头名的映射是固定的：

| 本地环境变量                        | 实际 HTTP 请求头          |
| ----------------------------------- | ------------------------- |
| `KJCH_AI_SERVICES_CF_CLIENT_ID`     | `CF-Access-Client-Id`     |
| `KJCH_AI_SERVICES_CF_CLIENT_SECRET` | `CF-Access-Client-Secret` |

Access 已放行而 Tunnel 返回 `Unable to reach the origin service` 的 502 时，
应检查 cloudflared 到 Ollama 的连接，而不是改请求头名称。Tunnel 显示健康只说明
连接器已连到 Cloudflare，不能证明连接器能访问 Ollama。
源站配置为 `http://localhost:11434` 时，每个连接器自己的运行环境都必须能访问该地址；
Docker bridge 中的 localhost 指向容器自身，不能直接代表 NAS 宿主机。
