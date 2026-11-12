import type { ReferenceTopic } from "../types";
export const instructionModes: ReferenceTopic = {
  id: "instruction-modes",
  category: "Class formats",
  title: "Instruction modes",
  summary:
    "The mode describes how much instruction happens online. Check every section: a lecture and its lab can have different modes.",
  sections: [
    {
      title: "Online share of instruction",
      entries: [
        {
          code: "P",
          title: "In Person",
          badge: "0–24% online",
          detail: "Mostly on campus, with limited online activity possible.",
        },
        {
          code: "HY",
          title: "Hybrid Delivery",
          badge: "25–74% online",
          detail: "A planned combination of campus and online instruction.",
        },
        {
          code: "DH",
          title: "Distance Enhanced",
          badge: "75–99% online",
          detail:
            "Some campus attendance is required: 1–24% in person, possibly for an exam or lab. Check the syllabus for specifics.",
        },
        {
          code: "DL",
          title: "Distance Learning",
          badge: "100% online",
          detail:
            "No required campus attendance, including exams. Online meetings may still have fixed times.",
        },
      ],
    },
    {
      title: "Online does not always mean self-paced",
      body: [
        "Synchronous sessions meet live at scheduled times. Asynchronous work can be completed within a stated window, with deadlines. The mode code alone does not settle which applies.",
      ],
    },
  ],
  sources: [
    {
      title: "OSU · Student Guide to Instructional Modes",
      url: "https://teaching.resources.osu.edu/StudentInstructionalModes",
    },
    {
      title: "OSU Registrar · Academic policies",
      url: "https://registrar.osu.edu/policies-information/university-policy/buckeyes-guide-to-academic-policies/",
    },
  ],
};
