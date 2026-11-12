import type { ReferenceTopic } from "../types";
export const ssle: ReferenceTopic = {
  id: "ssle",
  category: "Teaching evaluations",
  title: "SSLE · Learning experience",
  summary:
    "Survey of Student Learning Experience focuses on learning conditions. The following item summaries are paraphrases, not the official questionnaire. This site uses the imported report’s all-item mean, separately from SEI.",
  sections: [
    {
      title: "Seven core items, in order",
      ordered: true,
      entries: [
        { title: "Access to assistance when needed" },
        { title: "Feedback that supports progress" },
        { title: "How teaching approaches support learning" },
        { title: "Active participation in learning" },
        { title: "Teacher enthusiasm for instruction" },
        { title: "A sense of welcome" },
        { title: "Respect for varied backgrounds and experiences" },
      ],
    },
    {
      title: "Core response scale",
      scale: [
        { value: 1, label: "Strongly disagree" },
        { value: 2, label: "Disagree" },
        { value: 3, label: "Neutral" },
        { value: 4, label: "Agree" },
        { value: 5, label: "Strongly agree" },
      ],
    },
    {
      title: "Two written prompts",
      entries: [
        { title: "Which course elements supported learning?" },
        { title: "What could improve the course for later students?" },
      ],
    },
    {
      title: "Three additional state-required questions",
      ordered: true,
      entries: [
        {
          title: "Encouragement of differing viewpoints",
          detail: "Yes / No / Not applicable",
        },
        {
          title:
            "A classroom without political, racial, gender or religious bias",
          detail: "Yes / No",
        },
        {
          title: "Effectiveness of teaching approaches",
          detail: "1–10: lowest to highest effectiveness",
        },
      ],
      body: [
        "These response formats differ from the seven core items. The site does not convert or pool these additional responses into a new five-point score.",
      ],
    },
  ],
  sources: [
    {
      title: "OSU Registrar · SSLE survey, scales and additional questions",
      url: "https://registrar.osu.edu/faculty-support/survey-of-student-learning-experience-ssle/general-ssle-information/",
    },
  ],
};
