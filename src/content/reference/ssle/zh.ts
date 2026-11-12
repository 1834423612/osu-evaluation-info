import type { ReferenceTopic } from "../types";
export const ssle: ReferenceTopic = {
  id: "ssle",
  category: "教学评价",
  title: "SSLE · 学生学习体验调查",
  summary:
    "Survey of Student Learning Experience 关注学习环境与体验。以下为题意概述，并非官方逐字翻译。网站采用导入报告提供的全部题目均分，与 SEI 分开呈现。",
  sections: [
    {
      title: "7 道核心题，按原题序排列",
      ordered: true,
      entries: [
        { title: "需要时能否获得教师的答疑与帮助" },
        { title: "教师的反馈是否有助于学习进步" },
        { title: "教学方法是否促进学习" },
        { title: "课程设计与教学是否帮助主动参与学习" },
        { title: "教师是否投入教学" },
        { title: "在课程中是否感到被欢迎" },
        { title: "学习环境是否尊重不同背景与经历" },
      ],
    },
    {
      title: "核心题的 5 分量表",
      scale: [
        { value: 1, label: "非常不同意" },
        { value: 2, label: "不同意" },
        { value: 3, label: "中立" },
        { value: 4, label: "同意" },
        { value: 5, label: "非常同意" },
      ],
    },
    {
      title: "2 道开放式文字反馈",
      entries: [
        { title: "哪些课程安排有效促进了学习？" },
        { title: "如何为未来学生改进课程？" },
      ],
    },
    {
      title: "另有 3 道州规定附加题",
      ordered: true,
      entries: [
        { title: "是否鼓励讨论不同意见与观点", detail: "是／否／不适用" },
        { title: "课堂是否避免政治、种族、性别和宗教偏见", detail: "是／否" },
        {
          title: "教学方法的有效程度",
          detail: "1–10 分：从完全无效到非常有效",
        },
      ],
      body: [
        "附加题的回答格式不同于 7 道核心题。网站不会将这些附加回答自行折算或混合成新的 5 分评分。",
      ],
    },
  ],
  sources: [
    {
      title: "OSU 注册办公室 · SSLE 题目、量表与附加题",
      url: "https://registrar.osu.edu/faculty-support/survey-of-student-learning-experience-ssle/general-ssle-information/",
    },
  ],
};
