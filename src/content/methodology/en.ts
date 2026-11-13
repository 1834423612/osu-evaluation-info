import type { MethodologyCopy } from "./types";
import styles from "./en.module.css";
export const methodology: MethodologyCopy = {
  className: styles.article,
  title: "Behind the data",
  eyebrow: "WAHO! / DATA NOTES",
  intro:
    "Current classes, historical teaching evaluations, and student reviews each answer a different question. Here is how they reach the page—and what the numbers can tell you.",
  navigation: "On this page",
  steps: [
    {
      title: "Read the source",
      detail: "Current OSU class search and published evaluation reports.",
    },
    {
      title: "Match the identity",
      detail: "The same course and campus; an exact OSU email for teachers.",
    },
    {
      title: "Keep the context",
      detail: "Separate instruments, sample sizes, dates, and source labels.",
    },
  ],
  sections: [
    {
      id: "classes",
      title: "Current classes",
      paragraphs: [
        "Search matches titles, subjects, descriptions and close spellings against the complete synced OSU catalog. The sync time is shown, and approximate matches are labelled. A search suggestion never changes the course or teacher identity used for ratings.",
        "Opening a course refreshes official details in your browser; seat checks are separate live requests. Counts distinguish sections from campus-specific course entries. These are retrieval or sync times, not university publication times. Future classes may still lack a teacher or schedule.",
      ],
      link: {
        label: "Ohio State class search",
        href: "https://classes.osu.edu/",
      },
    },
    {
      id: "evaluations",
      title: "Two instruments, two scores",
      paragraphs: [
        "Historical SEI and SSLE reports are imported into the project database. SEI uses the overall instructor rating, item 10. From Autumn 2025, the imported reports use SSLE’s reported all-item mean. The instruments stay separate; the most recently available one becomes the primary score.",
        "Each score includes its observation period, response count, response rate, and term trend. Import time describes database ingestion. Missing evidence remains unknown. Course history is never assigned to a current teacher without an identity match.",
      ],
    },
    {
      id: "weighting",
      title: "Recent evidence carries more weight",
      paragraphs: [
        "Within each instrument, the combined score weights reported means by response count and time, with a two-year half-life. Two-year-old evidence carries half the weight of current evidence. Term chart points use response weighting only.",
        "Coverage describes the amount and spread of evidence, not a statistical confidence interval. Responses are not unique people, and a team-taught section can produce a record for each evaluated teacher.",
      ],
      facts: [
        "A directional signal needs 30 raw and 30 time-weighted responses, 2 records, 2 terms, and an observation within 2 years.",
        "With that coverage: positive ≥4.2; caution ≤3.3; otherwise mixed. High coverage needs 100 raw responses and 3 records; other eligible samples are moderate.",
        "Below those minimums, coverage is limited. Scores do not predict grades, workload, difficulty, or personal fit.",
      ],
    },
    {
      id: "matching",
      title: "Match courses and people carefully",
      paragraphs: [
        "Course history matches subject, catalog number, and campus. An official teacher score requires an exact OSU email within that course. Similar names alone never establish a match. Staff labels come from the official people directory; RMP reviews retain their own source and matching context.",
        "RMP quality, difficulty, and tags are unofficial student reports, separate from SEI and SSLE. Unconfirmed profiles remain accessible in the RMP library and separate course leads; they do not enter verified-instructor summaries.",
      ],
    },
    {
      id: "syllabi",
      title: "Published documents and your choices",
      paragraphs: [
        "Syllabi match the term, course, and class section. The university’s document update time is shown in your browser’s time zone; retrieval time is labelled separately. Saved archives remain available after a term or course is removed. PDF creation runs on your device using the published layout and fonts.",
        "Favorites and preferences stay in this browser. An updated saved syllabus keeps its notification until you explicitly mark it read. This is an independent explorer; confirm registration and degree requirements with Buckeye Link and university advising.",
      ],
    },
  ],
};
