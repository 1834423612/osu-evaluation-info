# 编辑数据与方法文章

[English](../../../src/content/methodology/README.md) · 简体中文

`src/content/methodology/en.ts` 与 `zh.ts` 分别维护两种语言的全部正文、分区顺序、事实和来源链接，共享渲染器是 `src/components/evaluations/methodology.tsx`。

各语言独立导入 CSS module，可调整排版变量或增加局部规则，不影响另一语言。修改标题时保留 section ID，以免破坏深链接；`facts` 用于紧凑事实列表，`link` 用于来源链接。

课程传输、评分或大纲行为改变时，同步核对英中文案的事实与实现。不要在文章中加入开发过程、用户提示词或重复来源标签。
