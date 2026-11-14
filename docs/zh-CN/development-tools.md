# 开发工具与本地数据

[English](../development-tools.md) · 简体中文

开发模式默认显示 DEV。正式环境通过快捷键 Ctrl+Alt+D 或品牌连续点击入口打开，并由服务端 `DEV_DEBUG_KEY` 验证权限。展开导航、课程模态和全屏阅读时，工具入口仍处于可操作层级；不要把调试密钥写入公开变量。

工具按网络、服务模拟、翻译、教学大纲与滚动、存储诊断分区。可模拟延迟、离线、无结果与服务失败，查看请求和布局边界，检查大纲收藏更新与导出状态。模拟结果与真实搜索统计分开，调试结束可恢复配置。

浏览器偏好使用版本化存储规则自动升级，保留可识别收藏，丢弃无效结构。调试会话、生产偏好和测试资料应隔离；清空前按工具实际说明选择范围。

`pnpm build` 使用 webpack；开发保留原有启动方式。大纲结构只读审计每批 100 个保留版本，报告周次、日期、表格和回退，不抓取、关联或删除数据。常规文案只显示状态、事实和操作，详细计算放在方法页或说明抽屉。

## 命令与格式示例

以下示例与英文版使用相同命令、字段和参数；运行前按上文核对环境与影响范围。

```dotenv
DEV_DEBUG_KEY=your-private-maintenance-key
```

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

```sh
node --env-file=.env.local scripts/syllabus/audit-schedules.mjs .cache/syllabus-schedule-audit.json
```
