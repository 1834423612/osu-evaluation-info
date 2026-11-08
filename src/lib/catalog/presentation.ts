import { text, type Locale } from "../i18n.ts";
import type { CatalogCourse, CatalogMeeting } from "./types";

/** Some OSU offerings publish multiple student levels in one field. */
export function courseAcademicCareers(
  course: Pick<CatalogCourse, "academicCareer" | "academicCareers">,
) {
  return [
    ...new Set(
      [...(course.academicCareers ?? []), course.academicCareer]
        .flatMap((value) =>
          typeof value === "string" ? value.split(/\s*[/,;|]\s*/) : [],
        )
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function courseAcademicCareerLabel(
  course: Pick<CatalogCourse, "academicCareer" | "academicCareers">,
  locale: Locale,
) {
  const labels: Record<string, [string, string]> = {
    undergraduate: ["Undergraduate", "本科生"],
    ugrd: ["Undergraduate", "本科生"],
    graduate: ["Graduate", "研究生"],
    grad: ["Graduate", "研究生"],
    professional: ["Professional", "专业学位学生"],
    "non-degree": ["Non-degree", "非学位学生"],
    nondegree: ["Non-degree", "非学位学生"],
  };
  return [
    ...new Set(
      courseAcademicCareers(course).map((career) => {
        const label = labels[career.toLowerCase()];
        return label ? text(locale, ...label) : career;
      }),
    ),
  ].join(" / ");
}

/** Missing weekdays alone do not establish that a class is online. */
export function isOnlineMeeting(
  meeting?: Pick<CatalogMeeting, "location">,
  instructionMode = "",
) {
  return (
    /\b(?:online|virtual)\b/i.test(meeting?.location ?? "") ||
    /^(?:distance learning|online|fully online|DL)$/i.test(
      instructionMode.trim(),
    )
  );
}
