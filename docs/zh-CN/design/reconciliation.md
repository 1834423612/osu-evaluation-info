# 数据关联后台的交互参考

[English](../../design/reconciliation.md) · 简体中文

RMP 后台采用“候选 → 查看证据 → 确认决定”的流程。看起来能匹配的课号不等于已证实的授课记录；多个学科出现同号时，保留候选让管理员判断。[OpenRefine 官方手册](https://openrefine.org/docs/manual/reconciling)介绍半自动匹配、人工确认和按数据子集反复核对。本项目参考这个处理流程，不额外依赖外部匹配 SaaS。

密集列表参考 [GitHub Primer DataTable](https://primer.style/product/components/data-table/) 的紧凑单元格、明确列宽、排序和分页；[Filter 设计](https://primer.style/product/internal-components/filter/)区分输入、解析和语法验证。该 Filter 是 GitHub 内部组件，本站使用现有 React 控件实现这些交互原则。

[Element Plus Table](https://element-plus.org/en-US/component/table.html)提供列筛选、展开行、稳定记录标识和溢出详情的参考；[shadcn data-table 指南](https://ui.shadcn.com/docs/components/data-table)展示如何按实际数据组合筛选、列控制和分页。本站沿用已有样式，不需要为此引入 Vue 组件库。

最终布局用紧凑列表展示操作所需字段，状态和证据都有文字说明；点开记录后查看完整信息并填写人工决定理由。组合筛选和有上限的分页便于分批处理。手机优先显示教师、原始课号和状态，其余证据在详情中查看。开发免鉴权入口有明确警示，不会让它看起来像正常的生产管理员会话。
