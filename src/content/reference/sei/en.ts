import type { ReferenceTopic } from "../types";
export const sei: ReferenceTopic = {
  id: "sei",
  category: "Teaching evaluations",
  title: "SEI · Instructor evaluation",
  summary:
    "Student Evaluation of Instruction is the earlier university-wide survey. This site uses item 10 for its historical SEI score. Item summaries below are paraphrases; the linked OSU report preserves the original wording.",
  sections: [
    {
      title: "The 10 items, in order",
      ordered: true,
      entries: [
        { title: "Organization of course material" },
        { title: "Intellectual challenge and stimulation" },
        { title: "Teacher enthusiasm for teaching" },
        { title: "Support for independent thought" },
        { title: "Preparation for instruction" },
        { title: "Willingness to assist learners" },
        { title: "Learning gained from the teacher" },
        { title: "A setting that supports learning" },
        { title: "Clarity of subject explanations" },
        {
          title: "Overall assessment of the teacher",
          badge: "Site score: Q10",
        },
      ],
    },
    {
      title: "Response scales",
      body: [
        "Items 1–9 use agreement: 1 strongly disagree, 2 disagree, 3 neutral, 4 agree, 5 strongly agree. Item 10 uses the scale below. Missing and N/A answers are not zeros.",
      ],
      scale: [
        { value: 1, label: "Poor" },
        { value: 2, label: "Fair" },
        { value: 3, label: "Neutral" },
        { value: 4, label: "Good" },
        { value: 5, label: "Excellent" },
      ],
    },
  ],
  sources: [
    {
      title: "OSU Arts & Sciences · SEI report guide and sample questions",
      url: "https://ascintranet.osu.edu/sites/default/files/2023-06/sei_report_access_06-17-2020.pdf",
    },
  ],
};
