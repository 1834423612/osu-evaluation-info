import type { ReferenceTopic } from "../types";
export const instructionModes: ReferenceTopic = {
  id: "instruction-modes",
  category: "开课形式",
  title: "授课方式",
  summary:
    "授课方式表示线上教学所占比例。同一课程的讲座、实验或讨论班可以采用不同方式，需要逐个班次确认。",
  sections: [
    {
      title: "线上授课比例",
      entries: [
        {
          code: "P",
          title: "In Person · 线下授课",
          badge: "0–24% 线上",
          detail: "以校园课堂为主，也可能包含少量线上教学活动。",
        },
        {
          code: "HY",
          title: "Hybrid Delivery · 混合授课",
          badge: "25–74% 线上",
          detail: "按课程安排结合线下课堂与线上学习。",
        },
        {
          code: "DH",
          title: "Distance Enhanced · 远程增强",
          badge: "75–99% 线上",
          detail:
            "仍有 1–24% 的线下要求，可能需要到校考试或实验；具体安排以大纲为准。",
        },
        {
          code: "DL",
          title: "Distance Learning · 远程学习",
          badge: "100% 线上",
          detail:
            "没有必须到校园参加的活动，包括考试；但线上课堂仍可能有固定时间。",
        },
      ],
    },
    {
      title: "线上不等于随时学习",
      body: [
        "同步课程需在规定时间实时上课；异步课程允许在指定时间窗口内自行安排，但仍有截止日期。仅凭授课方式代码不能判断是否为异步。",
      ],
    },
  ],
  sources: [
    {
      title: "OSU · 学生授课方式指南",
      url: "https://teaching.resources.osu.edu/StudentInstructionalModes",
    },
    {
      title: "OSU 注册办公室 · 学术政策",
      url: "https://registrar.osu.edu/policies-information/university-policy/buckeyes-guide-to-academic-policies/",
    },
  ],
};
