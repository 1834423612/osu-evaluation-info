import type { SampleCourse, PublicSample } from "./recommendation.ts";
import type { z } from "zod";
import type { curriculumSchema } from "./curriculum.ts";

export function sampleReferenceReader(
  subjects: { code: string; title: string }[],
) {
  const aliases = new Map<string, string>();
  const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ");
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const subject of subjects)
    for (const name of [subject.code, subject.title])
      aliases.set(normalize(name), subject.code);
  for (const [alias, code] of [
    ["bio", "BIOLOGY"],
    ["asc", "ARTSSCI"],
    ["engr", "ENGR"],
    ["gened", "GENED"],
  ])
    if (subjects.some((subject) => subject.code === code))
      aliases.set(alias, code);
  const names = [...aliases.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escape)
    .join("|");
  const pattern = new RegExp(
    "(?<![A-Za-z])(" +
      names +
      ")\\s+(\\d{4}(?:\\.\\d{1,2})?[A-Z]?)(?![A-Za-z0-9.])",
    "gi",
  );
  return (evidence: string) =>
    (/^\s*\[|\bif not\b/i.test(evidence)
      ? []
      : [...evidence.matchAll(pattern)]
    ).map((match) => ({
      subject: aliases.get(normalize(match[1]))!,
      number: match[2].toUpperCase(),
    }));
}

export function publicSamples(
  curricula: z.infer<typeof curriculumSchema>[],
  subjects: { code: string; title: string }[],
): PublicSample[] {
  const references = sampleReferenceReader(subjects);
  return curricula
    .filter((c) => c.documentKind === "sample-plan")
    .map((c) => ({
      id: c.id,
      program: c.program,
      label: c.evidence.some((e) => /^Example [0-9]/.test(e))
        ? c.program + " · " + c.evidence.find((e) => /^Example [0-9]/.test(e))
        : c.program,
      url: c.source.url,
      reviewStatus: c.reviewStatus,
      courses: c.semesters.flatMap((semester, semesterIndex) =>
        semester.entries.flatMap((entry) => {
          const matches = references(entry.evidence);
          return matches.flatMap((m) => {
            const { subject, number } = m;
            if (!/^[A-Z][A-Z& ]{1,11}$/.test(subject)) return [];
            // Alternative bundles and credit ranges do not establish individual credits.
            const credits =
              matches.length === 1 &&
              !/\bor\b|\/|•|\[|\bif\b/i.test(entry.evidence) &&
              entry.credits?.min === entry.credits?.max
                ? (entry.credits?.min ?? null)
                : null;
            return [
              {
                subject,
                number,
                credits,
                semesterIndex,
              } satisfies SampleCourse,
            ];
          });
        }),
      ),
    }));
}
