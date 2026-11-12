import type { ReferenceTopic } from "../types";
export const components: ReferenceTopic = {
  id: "components",
  category: "Class formats",
  title: "Class components",
  summary:
    "A component identifies the kind of class activity. Registration may require linked components; check the official offering rather than assuming the lecture is sufficient.",
  sections: [
    {
      title: "Common components",
      entries: [
        {
          code: "LEC",
          title: "Lecture",
          detail: "Group instruction, often in a larger class.",
        },
        {
          code: "REC",
          title: "Recitation",
          detail:
            "Smaller-group practice, discussion, questions, or quizzes accompanying a lecture.",
        },
        {
          code: "LAB",
          title: "Laboratory",
          detail:
            "Practical work; the code also covers some arts studios and ensembles.",
        },
        {
          code: "SEM",
          title: "Seminar",
          detail: "Smaller classes centered on discussion.",
        },
        {
          code: "CLN",
          title: "Clinical",
          detail: "Supervised learning in a clinical setting.",
        },
        {
          code: "FLD",
          title: "Field experience",
          detail:
            "Approved academic work away from the usual classroom or campus.",
        },
        {
          code: "IND",
          title: "Independent study",
          detail:
            "Individualized work under faculty guidance, often without fixed meeting times.",
        },
        {
          code: "WRK",
          title: "Workshop",
          detail:
            "Focused, intensive instruction in specific techniques or skills.",
        },
      ],
    },
  ],
  sources: [
    {
      title: "OSU Registrar · Class components",
      url: "https://registrar.osu.edu/policies-information/university-policy/buckeyes-guide-to-academic-policies/",
    },
  ],
};
