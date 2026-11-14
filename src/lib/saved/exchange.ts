import { z } from "zod";
const str = z.string().max(500),
  id = z
    .string()
    .min(1)
    .max(300)
    .refine((s) => !/[\u0000-\u001f]/.test(s));
const optional = str.optional();
const meeting = z.object({
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startTime: str.nullable(),
  endTime: str.nullable(),
  startDate: str.nullable(),
  endDate: str.nullable(),
  location: str.nullable(),
});
const instructor = z.object({ name: str, email: str.nullable() });
export const sectionSnapshotSchema = z
  .object({
    id,
    classNumber: str,
    section: str,
    component: str,
    instructionMode: str,
    session: str,
    sessionCode: str,
    instructors: z.array(instructor).max(40),
    meetings: z.array(meeting).max(80),
    courseId: optional,
    courseOfferingNumber: optional,
    termCode: optional,
    campusCode: optional,
  })
  .transform((s) => ({
    ...s,
    enrollmentStatus: "",
    enrollmentTotal: null,
    waitlistTotal: null,
  }));
export const courseSnapshotSchema = z.object({
  id,
  courseId: optional,
  courseIds: z.array(str).max(30).optional(),
  subject: str,
  subjectName: str,
  catalogNumber: str,
  title: z.string().max(1000),
  description: z.string().max(16000),
  creditsMin: z.number().min(0).max(100),
  creditsMax: z.number().min(0).max(100),
  campus: str,
  campusCode: str,
  term: str,
  termCode: str,
  academicCareer: str,
  academicCareers: z.array(str).max(10).optional(),
  attributes: z.array(str).max(100),
  sections: z.array(sectionSnapshotSchema).max(300),
  sectionsPartial: z.boolean(),
  archive: z
    .object({
      reason: z.enum(["term-not-listed", "not-in-latest-snapshot"]),
      snapshotAt: str,
    })
    .optional(),
});
const related = z.object({
  id,
  label: str,
  title: z.string().max(1000),
  term: str,
  termCode: optional,
  campusCode: optional,
  officialCourseId: optional,
  courseIds: z.array(str).max(30).optional(),
  creditsMin: z.number().optional(),
  creditsMax: z.number().optional(),
});
const savedSection = z
  .object({
    id,
    courseId: id,
    courseLabel: str,
    courseTitle: z.string().max(1000),
    term: str,
    campus: str,
    termCode: optional,
    campusCode: optional,
    officialCourseId: optional,
    creditsMin: z.number().optional(),
    creditsMax: z.number().optional(),
    section: sectionSnapshotSchema,
  })
  .refine((s) => s.id === s.courseId + ":" + s.section.classNumber);
const savedInstructor = z.object({
  id,
  name: str,
  email: str.nullable(),
  courses: z.array(related).max(100),
});
const entry = z.object({
  code: id,
  entityId: str,
  termId: str,
  termName: str,
  termCode: str.nullable(),
  subject: str,
  catalogNumber: str,
  classNumber: str,
  sectionIdentifier: str,
  title: z.string().max(1000),
  subtitle: z.string().max(1000),
  visibility: str,
  hasUploads: z.boolean(),
});
const revision = z
  .object({ snapshotId: str, modifiedAt: str.nullable() })
  .nullable();
const savedSyllabus = z
  .object({
    id,
    entry,
    course: courseSnapshotSchema,
    section: sectionSnapshotSchema,
    savedAt: z.iso.datetime(),
    checkedAt: z.iso.datetime().nullable(),
    acknowledged: revision,
    latest: revision,
  })
  .refine(
    (s) =>
      s.id === s.entry.code && s.entry.classNumber === s.section.classNumber,
  );
export const exchangeItemSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("course"), payload: courseSnapshotSchema }),
  z.object({ kind: z.literal("section"), payload: savedSection }),
  z.object({ kind: z.literal("instructor"), payload: savedInstructor }),
  z.object({ kind: z.literal("syllabus"), payload: savedSyllabus }),
]);
export type ExchangeItem = z.infer<typeof exchangeItemSchema>;
export type SavedKind = ExchangeItem["kind"];
export const snapshotSchema = z
  .object({
    version: z.literal(1),
    title: z.string().trim().min(1).max(80),
    createdAt: z.iso.datetime(),
    items: z.array(exchangeItemSchema).min(1).max(700),
  })
  .superRefine((snapshot, ctx) => {
    const seen = new Set<string>();
    for (const item of snapshot.items) {
      const key = itemKey(item);
      if (seen.has(key))
        ctx.addIssue({ code: "custom", message: "Duplicate saved identity" });
      seen.add(key);
      if (JSON.stringify(item).length > 32000)
        ctx.addIssue({ code: "custom", message: "Saved item too large" });
    }
  });
export type SavedSnapshot = z.infer<typeof snapshotSchema>;
export function itemKey(item: ExchangeItem) {
  return item.kind + ":" + item.payload.id;
}
export function itemTitle(item: ExchangeItem) {
  if (item.kind === "course")
    return (
      item.payload.subject +
      " " +
      item.payload.catalogNumber +
      " · " +
      item.payload.title
    );
  if (item.kind === "section")
    return item.payload.courseLabel + " · #" + item.payload.section.classNumber;
  if (item.kind === "instructor") return item.payload.name;
  return (
    item.payload.entry.subject +
    " " +
    item.payload.entry.catalogNumber +
    " · #" +
    item.payload.entry.classNumber
  );
}
export function itemContext(item: ExchangeItem) {
  if (item.kind === "course")
    return item.payload.term + " · " + item.payload.campus;
  if (item.kind === "section")
    return item.payload.term + " · " + item.payload.campus;
  if (item.kind === "syllabus") return item.payload.entry.termName;
  return item.payload.courses.map((x) => x.label).join(" · ");
}
export function itemHref(item: ExchangeItem) {
  let course,
    label,
    term,
    campus,
    section,
    tab = "sections";
  if (item.kind === "course") {
    course = item.payload.id;
    label = item.payload.subject + " " + item.payload.catalogNumber;
    term = item.payload.termCode;
    campus = item.payload.campusCode;
  } else if (item.kind === "section") {
    course = item.payload.courseId;
    label = item.payload.courseLabel;
    term = item.payload.termCode;
    campus = item.payload.campusCode;
    section = item.payload.section.classNumber;
  } else if (item.kind === "syllabus") {
    course = item.payload.course.id;
    label = item.payload.entry.subject + " " + item.payload.entry.catalogNumber;
    term = item.payload.course.termCode;
    campus = item.payload.course.campusCode;
    section = item.payload.section.classNumber;
    tab = "syllabus";
  } else {
    const c = item.payload.courses[0];
    if (!c) return null;
    course = c.id;
    label = c.label;
    term = c.termCode;
    campus = c.campusCode;
  }
  const p = new URLSearchParams({ q: label, course, detailTab: tab });
  if (term) p.set("term", term);
  if (campus) p.set("campus", campus.toLowerCase());
  if (section) p.set("focusSection", section);
  return "/?" + p;
}
export function publicSnapshot(value: SavedSnapshot): SavedSnapshot {
  const copy = snapshotSchema.parse(value);
  for (const item of copy.items) {
    if (item.kind === "instructor") item.payload.email = null;
    if (item.kind === "syllabus")
      for (const section of item.payload.course.sections)
        for (const teacher of section.instructors) teacher.email = null;
    if (item.kind === "course")
      for (const section of item.payload.sections)
        for (const teacher of section.instructors) teacher.email = null;
    if (item.kind === "section")
      for (const teacher of item.payload.section.instructors)
        teacher.email = null;
    if (item.kind === "syllabus") {
      item.payload.acknowledged = null;
      item.payload.latest = null;
      item.payload.checkedAt = null;
      for (const teacher of item.payload.section.instructors)
        teacher.email = null;
    }
  }
  return copy;
}
export function parseSnapshot(text: string) {
  if (new TextEncoder().encode(text).byteLength > 1048576)
    throw new Error("Snapshot exceeds 1 MiB");
  return snapshotSchema.parse(JSON.parse(text));
}

export function itemKindName(kind: SavedKind, locale: "en" | "zh") {
  const labels = {
    course: ["Course", "课程"],
    section: ["Section", "班次"],
    instructor: ["Instructor", "教师"],
    syllabus: ["Syllabus", "大纲"],
  };
  return labels[kind][locale === "zh" ? 1 : 0];
}
