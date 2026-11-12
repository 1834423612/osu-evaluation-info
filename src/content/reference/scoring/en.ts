import type { ReferenceTopic } from "../types";
export const scoring: ReferenceTopic = {
  id: "scoring",
  category: "Reading the scores",
  title: "Scores, colors and coverage",
  summary:
    "The university supplies reports; the weighting and signal thresholds below are this project’s choices. SEI, SSLE, and RMP are separate sources, never interchangeable measures.",
  sections: [
    {
      title: "How a score is combined",
      body: [
        "Within one instrument, a record’s weight is its response count multiplied by a time factor. That factor halves every two years. The combined score divides the weighted rating total by the sum of those weights. Term chart points do not use time decay.",
        "SEI starts from reported Q10 means; SSLE starts from reported all-item means. RMP quality and difficulty remain unofficial review measures with their own displayed sample and time window.",
      ],
      formula: true,
    },
    {
      title: "Signals need sufficient evidence",
      entries: [
        {
          title: "Minimum coverage",
          detail:
            "30 raw responses, 30 decayed response-weight units, 2 instructor-section records, 2 terms, and an observation within 2 years.",
        },
        {
          title: "Positive / mixed / caution",
          detail:
            "Once coverage is sufficient: score ≥4.2 is positive, ≤3.3 is caution, and the interval between is mixed.",
        },
        {
          title: "High / moderate / limited coverage",
          detail:
            "High adds 100 raw responses and 3 records. Other eligible samples are moderate; below minimums is limited. These are not confidence intervals.",
        },
      ],
    },
    {
      title: "Compact syllabus score colors",
      body: [
        "Small score labels use green at ≥4, amber at ≥3 and below 4, and red below 3. This is a visual scale, separate from the coverage-gated recommendation signal. Missing scores show a dash, never zero. Team-taught filter sorting averages only available teacher scores from the chosen source.",
      ],
    },
  ],
  sources: [{ title: "Project · Data and methods", url: "/methodology" }],
};
