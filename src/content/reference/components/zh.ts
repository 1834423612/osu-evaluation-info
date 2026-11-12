import type { ReferenceTopic } from "../types";
export const components: ReferenceTopic = {
  id: "components",
  category: "开课形式",
  title: "班次类型",
  summary:
    "班次类型描述具体教学活动。部分课程需同时注册关联的实验或讨论班，不能只凭讲座班次判断已完成选课。",
  sections: [
    {
      title: "常见班次类型",
      entries: [
        {
          code: "LEC",
          title: "Lecture · 讲座",
          detail: "面向全班讲授知识，通常规模较大。",
        },
        {
          code: "REC",
          title: "Recitation · 习题／讨论课",
          detail: "通常配合讲座，以小组形式答疑、练习、讨论或测验。",
        },
        {
          code: "LAB",
          title: "Laboratory · 实验／工作室",
          detail: "开展实践活动，也用于部分艺术工作室与合奏课程。",
        },
        {
          code: "SEM",
          title: "Seminar · 研讨课",
          detail: "通常规模较小，更侧重讨论。",
        },
        {
          code: "CLN",
          title: "Clinical · 临床实践",
          detail: "在临床环境中接受指导并参与实践。",
        },
        {
          code: "FLD",
          title: "Field experience · 校外实践",
          detail: "经批准，在常规教室或校园之外开展学术实践。",
        },
        {
          code: "IND",
          title: "Independent study · 独立学习",
          detail: "教师指导下的个别研究或学习，通常没有固定上课时间。",
        },
        {
          code: "WRK",
          title: "Workshop · 专题工作坊",
          detail: "集中训练某一领域的技巧或技能。",
        },
      ],
    },
  ],
  sources: [
    {
      title: "OSU 注册办公室 · 班次类型",
      url: "https://registrar.osu.edu/policies-information/university-policy/buckeyes-guide-to-academic-policies/",
    },
  ],
};
