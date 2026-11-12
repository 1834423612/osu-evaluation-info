import { instructionModes } from "./instruction-modes/zh";
import { components } from "./components/zh";
import { sei } from "./sei/zh";
import { ssle } from "./ssle/zh";
import { scoring } from "./scoring/zh";
export const reference = {
  title: "读懂 OSU 课程与评分",
  intro:
    "先弄清标签含义，再选择适合自己的课。在这里查看官方定义、问卷题意，以及本网站的评分说明。",
  eyebrow: "WAHO! / 课程参考",
  contents: "浏览说明",
  sources: "参考来源",
  checked: "来源核对于 2026 年 11 月 12 日",
  close: "关闭说明",
  fullPage: "在完整说明页查看",
  formula: "展开计算公式",
  equation:
    "评分等于回答数量、报告均分与时间因子的乘积之和，除以回答数量与时间因子的乘积之和；时间因子为二的负年数除以二次方。",
  variables:
    "n 为回答数量，m 为报告均分，a 为距今的年数。两年前的回答权重为当前的一半；学期时间使用学期中点的近似值。",
  topics: [instructionModes, components, sei, ssle, scoring],
};
