# 编辑 OSU 说明内容

[English](../../../src/content/reference/README.md) · 简体中文

`src/content/reference` 每个主题独立建目录，分别维护 `en.ts`／`zh.ts`；根目录语言文件管理页签、顺序和主题注册。页面与上下文抽屉共用 `reference-content.tsx` 与局部样式。

主题 ID 用于页面深链接和 info 按钮，修改标题时不要随意改 ID。段落、词条、题目、评分尺度与可折叠公式可按主题组合。问卷内容是解释性改写，不是官方逐字问卷或认证翻译。

2026-11-12 核对的 SEI 指南属于历史资料；当前 SSLE 说明包含七个核心题、两项文字反馈和三项附加必答题。保留不同量表和题序，来源链接随主题保存。

`scoring/` 描述本站计算政策，不是大学标准。修改时核对 `SCORING_POLICY` 和 `teacherScoreTone`；不能混合当前问卷尺度重新推算历史报告的 SSLE 均值。
