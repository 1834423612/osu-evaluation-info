# 课程同步可靠性审计：2026-11-07

[English](../../catalog/sync-reliability.md) · 简体中文

该审计检查数据库计数、分页、断点、事务边界及失败恢复。它描述 2026-11-07 的证据，不代表官方源永远没有遗漏。

同步需要同时校验预期、返回、去重和存储计数，拒绝重复或不前进的分页；班次身份必须在正确学期、课程和校区内。失败事务回滚，数据和断点一起提交，只有完整扫描才可发布。

DDL 与正常同步分开；旧可用版本在新扫描失败时继续服务。外部请求、持久化和发布状态分别记录，不能仅以一个总数推断全部完成。永久保留与旧学期消失规则见当前生命周期说明。

## 工作流观察

| 工作流运行                                                                                                                                                                                                                                                                                                                                                                 | 观察结果                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [41729414889](https://github.com/1834423612/osu-evaluation-info/actions/runs/41729414889), [41760312909](https://github.com/1834423612/osu-evaluation-info/actions/runs/41760312909)                                                                                                                                                                                       | 缺少 `DATABASE_URL`                                                    |
| [41760635083](https://github.com/1834423612/osu-evaluation-info/actions/runs/41760635083), [41995037558](https://github.com/1834423612/osu-evaluation-info/actions/runs/41995037558), [42141556528](https://github.com/1834423612/osu-evaluation-info/actions/runs/42141556528), [42144865252](https://github.com/1834423612/osu-evaluation-info/actions/runs/42144865252) | 未建立 job 即失败，没有执行日志                                        |
| [42221433954](https://github.com/1834423612/osu-evaluation-info/actions/runs/42221433954), [42284068119](https://github.com/1834423612/osu-evaluation-info/actions/runs/42284068119)                                                                                                                                                                                       | 未建立 job 即启动失败；当时运维记录为仅所有者可运行 Actions 的策略限制 |
| [42321119986](https://github.com/1834423612/osu-evaluation-info/actions/runs/42321119986)                                                                                                                                                                                                                                                                                  | 全部页面已读取，版本发布被拒绝                                         |
| [42349949008](https://github.com/1834423612/osu-evaluation-info/actions/runs/42349949008), [42387419700](https://github.com/1834423612/osu-evaluation-info/actions/runs/42387419700), [42413074442](https://github.com/1834423612/osu-evaluation-info/actions/runs/42413074442), [42430277378](https://github.com/1834423612/osu-evaluation-info/actions/runs/42430277378) | 重复恢复同一失败任务：当前覆盖 70,508，保存／读取覆盖 70,499           |
| [42350546425](https://github.com/1834423612/osu-evaluation-info/actions/runs/42350546425), [42415427953](https://github.com/1834423612/osu-evaluation-info/actions/runs/42415427953)                                                                                                                                                                                       | 自动 PR 审查成功                                                       |
