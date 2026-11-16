// Opt-in, response-only HAR comparison. Never expose archive values or requests.
export function academicResponses(archive) {
  const responses = [];
  for (const entry of archive?.log?.entries ?? []) {
    const content = entry?.response?.content;
    if (typeof content?.text !== "string") continue;
    try {
      const text =
        content.encoding === "base64"
          ? Buffer.from(content.text, "base64").toString("utf8")
          : content.text;
      responses.push(JSON.parse(text.replace(/^\)\]\}',?\s*/, "")));
    } catch {
      /* Non-JSON responses are not academic evidence. */
    }
  }
  return responses;
}
/** Real BDP audit observations, distinct from status="planned" registration records. */
export function academicRoster(responses) {
  const records = new Map();
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (value.course_plan_info && typeof value.course_plan_info === "object") {
      for (const course of Object.values(value.course_plan_info).flat()) {
        const key = code(course?.code);
        if (!key) continue;
        const status =
          course.progress_status === "taken"
            ? "completed"
            : course.progress_status === "in_progress"
              ? "in-progress"
              : course.progress_status === "planned"
                ? "planned"
                : null;
        if (!status) continue;
        const record = records.get(key) ?? {
          code: key,
          statuses: new Set(),
          credits: new Set(),
          terms: new Set(),
        };
        record.statuses.add(status);
        if (typeof course.units === "number") record.credits.add(course.units);
        if (
          [1, 2, 3].includes(course.semester) &&
          Number.isInteger(course.year)
        )
          record.terms.add(
            ["", "Spring", "Summer", "Autumn"][course.semester] + course.year,
          );
        records.set(key, record);
      }
    }
    for (const child of Object.values(value))
      if (child && typeof child === "object") visit(child);
  }
  responses.forEach(visit);
  return [...records.values()];
}

export function compareAcademicRoster(rows, roster) {
  const result = {
    comparable: 0,
    matchingStatus: 0,
    matchingCredits: 0,
    missing: 0,
    ambiguous: 0,
  };
  for (const expected of roster) {
    if (expected.statuses.size !== 1) {
      result.ambiguous++;
      continue;
    }
    const actual = rows.find(
      (row) =>
        code(`${row.course.subject}${row.course.number}`) === expected.code,
    );
    if (!actual) {
      result.missing++;
      continue;
    }
    result.comparable++;
    result.matchingStatus += Number(
      expected.statuses.has(actual.course.status),
    );
    result.matchingCredits += Number(
      expected.credits.size === 1 &&
        expected.credits.has(actual.course.credits),
    );
  }
  return result;
}
const code = (value) =>
  typeof value === "string"
    ? (value
        .toUpperCase()
        .replace(/\s+/g, "")
        .match(/^[A-Z&]{2,12}\d{4}(?:\.\d{1,2})?[A-Z]?$/)?.[0] ?? null)
    : null;
export function academicEvidence(responses) {
  const semesters = [];
  let requirementSnapshots = 0;
  let auditSnapshots = 0;
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (!Array.isArray(value)) {
      if (value.req_trees && typeof value.req_trees === "object")
        requirementSnapshots++;
      if (value.audit_reqs && typeof value.audit_reqs === "object")
        auditSnapshots++;
      if (Array.isArray(value.semesters)) {
        for (const semester of value.semesters) {
          if (!Array.isArray(semester?.courses)) continue;
          semesters.push({
            // Only academic comparison fields survive; all other fields are discarded.
            year: Number.isInteger(semester.physical_year)
              ? semester.physical_year
              : null,
            courses: semester.courses
              .map((course) => ({
                code: code(course.code),
                credits: typeof course.units === "number" ? course.units : null,
                planned: course.is_planned === true,
                registrationKnown: [
                  "registered",
                  "unregistered",
                  "enrolled",
                ].includes(
                  typeof course.registration_status === "string"
                    ? course.registration_status.toLowerCase()
                    : "",
                ),
              }))
              .filter((course) => course.code),
            placeholders: Array.isArray(semester.placeholders)
              ? semester.placeholders.length
              : 0,
          });
        }
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  for (const response of responses) visit(response);
  return { semesters, requirementSnapshots, auditSnapshots };
}
export function compareAcademicEvidence(plan, evidence) {
  const result = {
    harSemesterGroups: evidence.semesters.length,
    harCourseObservations: evidence.semesters.reduce(
      (n, s) => n + s.courses.length,
      0,
    ),
    harPlaceholderObservations: evidence.semesters.reduce(
      (n, s) => n + (s.placeholders ?? 0),
      0,
    ),
    comparableCourseObservations: 0,
    matchingCredits: 0,
    conflictingCredits: 0,
    ambiguousOrMissingCourseObservations: 0,
    matchingCalendarYears: 0,
    unknownCalendarYears: 0,
    harUnknownRegistrationObservations: 0,
    harExplicitPlannedObservations: 0,
    matchingExplicitPlannedObservations: 0,
    comparableSemesterGroups: 0,
    consistentSemesterGroups: 0,
    requirementSnapshots: evidence.requirementSnapshots,
    auditSnapshots: evidence.auditSnapshots,
  };
  const courses = plan.semesters.flatMap((semester) =>
    semester.courses.map((course) => ({
      code: code(`${course.subject ?? ""}${course.number ?? ""}`),
      credits: course.credits,
      status: course.status,
      term: semester.term,
      year: semester.term?.match(/20\d{2}/)?.[0],
    })),
  );
  for (const semester of evidence.semesters) {
    const matchedTerms = semester.courses
      .map((course) => courses.filter((c) => c.code === course.code))
      .filter((matches) => matches.length === 1 && matches[0].term)
      .map((matches) => matches[0].term);
    if (
      matchedTerms.length === semester.courses.length &&
      matchedTerms.length > 0
    ) {
      result.comparableSemesterGroups++;
      if (new Set(matchedTerms).size === 1) result.consistentSemesterGroups++;
    }
  }
  for (const semester of evidence.semesters)
    for (const course of semester.courses) {
      result.harUnknownRegistrationObservations += Number(
        !course.registrationKnown,
      );
      result.harExplicitPlannedObservations += Number(course.planned === true);
      const candidates = courses.filter((c) => c.code === course.code);
      if (
        candidates.length !== 1 ||
        candidates[0].credits === null ||
        course.credits === null
      ) {
        result.ambiguousOrMissingCourseObservations++;
        continue;
      }
      result.comparableCourseObservations++;
      result.matchingExplicitPlannedObservations += Number(
        course.planned === true && candidates[0].status === "planned",
      );
      result[
        candidates[0].credits === course.credits
          ? "matchingCredits"
          : "conflictingCredits"
      ]++;
      if (candidates[0].year && semester.year === Number(candidates[0].year))
        result.matchingCalendarYears++;
      else result.unknownCalendarYears++;
    }
  return result;
}
