import type { ReferenceTopic } from "../types";
export const sei: ReferenceTopic = {
  id: "sei",
  category: "教学评价",
  title: "SEI · 教师教学评价",
  summary:
    "Student Evaluation of Instruction 是较早的校级教学评价量表。本网站的历史 SEI 评分采用第 10 题。以下按原题序概述含义，并非官方逐字翻译；原文见下方 OSU 报告。",
  sections: [
    {
      title: "10 道题分别评价什么",
      ordered: true,
      entries: [
        { title: "课程内容的组织程度" },
        { title: "课程是否激发思考" },
        { title: "教师对教学的投入与兴趣" },
        { title: "是否鼓励独立思考" },
        { title: "教师的课前准备" },
        { title: "教师帮助学生的意愿" },
        { title: "从教师教学中获得的收获" },
        { title: "是否营造有利于学习的氛围" },
        { title: "讲解是否清晰" },
        { title: "对教师的总体评价", badge: "站内评分：Q10" },
      ],
    },
    {
      title: "每个分值的含义",
      body: [
        "第 1–9 题为同意程度：1 非常不同意、2 不同意、3 中立、4 同意、5 非常同意。第 10 题使用下方总体评价等级。缺失与不适用回答不记为零分。",
      ],
      scale: [
        { value: 1, label: "差" },
        { value: 2, label: "一般" },
        { value: 3, label: "中立" },
        { value: 4, label: "好" },
        { value: 5, label: "优秀" },
      ],
    },
  ],
  sources: [
    {
      title: "OSU 文理学院 · SEI 报告指南与问卷示例",
      url: "https://ascintranet.osu.edu/sites/default/files/2023-06/sei_report_access_06-17-2020.pdf",
    },
  ],
};
