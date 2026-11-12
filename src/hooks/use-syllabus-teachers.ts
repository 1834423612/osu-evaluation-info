"use client";
import { useEffect, useState } from "react";
import { readInstructorDirectory } from "@/components/people/people-directory-lookup";
import { compactDirectoryRoles } from "@/lib/people/role-labels";
import { createRequestPool } from "@/lib/catalog/request-pool";
import { debugFetch } from "@/lib/debug/services";
import { rmpPreviews } from "@/lib/rmp/preview-client";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import {
  syllabusTeacherKey,
  teacherOfficialMetrics,
  type SyllabusTeacherData,
  type SyllabusTeacherMap,
} from "@/lib/syllabus/teacher-data";
import type { CatalogCourse, CatalogInstructor } from "@/lib/catalog/types";
import type { CourseEvaluationSummary } from "@/lib/evaluations/types";

const officialPool = createRequestPool<CourseEvaluationSummary | null>({
  concurrency: 2,
  cacheMs: 300_000,
});
const empty: SyllabusTeacherMap = {};
export function useSyllabusTeachers(
  course: CatalogCourse,
  people: CatalogInstructor[],
  enabled = true,
) {
  const key = JSON.stringify(
    enabled
      ? {
          subject: course.subject,
          catalogNumber: course.catalogNumber,
          campus: course.campusCode,
          people: [
            ...new Map(
              people.map((person) => [syllabusTeacherKey(person), person]),
            ).values(),
          ],
          evaluation: course.evaluation,
        }
      : null,
  );
  const [state, setState] = useState<{ key: string; data: SyllabusTeacherMap }>(
    { key: "", data: empty },
  );
  useEffect(() => {
    const input = JSON.parse(key);
    if (!input) return;
    const controller = new AbortController();
    const update = (person: CatalogInstructor, value: SyllabusTeacherData) => {
      if (controller.signal.aborted) return;
      setState((previous) => {
        const data = previous.key === key ? previous.data : {};
        const id = syllabusTeacherKey(person);
        return { key, data: { ...data, [id]: { ...data[id], ...value } } };
      });
    };
    const people = input.people as CatalogInstructor[];
    const official = async () => {
      for (let index = 0; index < people.length; index += 30) {
        if (controller.signal.aborted) return;
        const group = people.slice(index, index + 30);
        let summary = input.evaluation as
          CourseEvaluationSummary | undefined | null;
        if (!summary || summary.status === "unavailable") {
          const params = new URLSearchParams({
            subject: input.subject,
            catalog: input.catalogNumber,
            campus: input.campus.toUpperCase(),
          });
          for (const person of group)
            if (nameDotNumberFromEmail(person.email))
              params.append("email", person.email!);
          summary = await officialPool
            .read(
              String(params),
              async (signal) => {
                try {
                  const response = await debugFetch(
                    "evaluations",
                    `/api/evaluations?${params}`,
                    { signal },
                  );
                  return response.ok
                    ? ((await response.json()) as CourseEvaluationSummary)
                    : null;
                } catch {
                  return null;
                }
              },
              { signal: controller.signal },
            )
            .catch(() => null);
        }
        group.forEach((person) =>
          update(person, teacherOfficialMetrics(summary ?? null, person)),
        );
      }
    };
    void official();
    for (const person of people) {
      const identity = nameDotNumberFromEmail(person.email);
      void (
        identity
          ? rmpPreviews.request({
              subject: input.subject,
              catalogNumber: input.catalogNumber,
              campus: input.campus,
              usernames: [identity],
            })
          : Promise.resolve(null)
      ).then((rmp) => update(person, { rmp }));
    }
    const queue = [...people];
    async function worker() {
      while (queue.length && !controller.signal.aborted) {
        const person = queue.shift()!;
        await readInstructorDirectory({ ...person, subject: input.subject })
          .then((personData) =>
            update(person, {
              roles: personData ? compactDirectoryRoles(personData) : null,
            }),
          )
          .catch(() => update(person, { roles: null }));
      }
    }
    void Promise.all([worker(), worker()]);
    return () => controller.abort();
  }, [key]);
  return state.key === key ? state.data : empty;
}
