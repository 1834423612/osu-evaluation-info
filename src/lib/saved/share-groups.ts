import type { ExchangeItem } from "./exchange.ts";

type CourseItem = Exclude<ExchangeItem, { kind: "instructor" }>;
type InstructorItem = Extract<ExchangeItem, { kind: "instructor" }>;
type Context = {
  parent: string;
  label: string;
  title: string;
  term: string;
  termCode?: string;
  campus: string;
  campusCode?: string;
};
export type SharedCourseGroup = Omit<Context, "parent"> & {
  kind: "course";
  id: string;
  items: CourseItem[];
};
export type SharedContentGroup =
  | SharedCourseGroup
  | {
      kind: "instructors";
      id: "instructors";
      items: InstructorItem[];
    };

function context(item: CourseItem): Context {
  if (item.kind === "section") {
    const p = item.payload;
    return {
      parent: p.courseId,
      label: p.courseLabel,
      title: p.courseTitle,
      term: p.term,
      termCode: p.termCode || p.section.termCode,
      campus: p.campus,
      campusCode: p.campusCode || p.section.campusCode,
    };
  }
  const course = item.kind === "course" ? item.payload : item.payload.course;
  return {
    parent: course.id,
    label: `${course.subject} ${course.catalogNumber}`,
    title: course.title,
    term: course.term,
    termCode: course.termCode,
    campus: course.campus,
    campusCode: course.campusCode,
  };
}

const normalize = (value: string | undefined) =>
  value?.trim().replace(/\s+/g, " ").toUpperCase() || "";
const compare = (a: string, b: string) =>
  a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });
function groupKey(value: Context) {
  const term = normalize(value.termCode || value.term);
  const campus = normalize(value.campusCode || value.campus);
  return JSON.stringify([
    normalize(value.label) || value.parent,
    term,
    campus,
    !term || !campus ? value.parent : "",
  ]);
}

/** Group display only: every item retains its own saved identity and selection. */
export function groupSharedItems(
  items: readonly ExchangeItem[],
  source: readonly ExchangeItem[] = items,
): SharedContentGroup[] {
  const parents = source
    .filter((item) => item.kind === "course" || item.kind === "syllabus")
    .map(context);
  const courses = new Map<string, SharedCourseGroup>();
  const instructors: InstructorItem[] = [];
  for (const item of items) {
    if (item.kind === "instructor") {
      instructors.push(item);
      continue;
    }
    let value = context(item);
    if (!value.termCode || !value.campusCode) {
      const candidates = parents.filter(
        (parent) =>
          parent.parent === value.parent &&
          (!value.termCode ||
            !parent.termCode ||
            value.termCode === parent.termCode) &&
          (value.termCode ||
            !value.term ||
            !parent.term ||
            normalize(value.term) === normalize(parent.term)) &&
          (!value.campusCode ||
            !parent.campusCode ||
            value.campusCode === parent.campusCode) &&
          (value.campusCode ||
            !value.campus ||
            !parent.campus ||
            normalize(value.campus) === normalize(parent.campus)),
      );
      if (new Set(candidates.map(groupKey)).size === 1) {
        const parent = candidates[0];
        value = {
          ...parent,
          ...value,
          termCode: value.termCode || parent.termCode,
          campusCode: value.campusCode || parent.campusCode,
        };
      }
    }
    const key = groupKey(value);
    let group = courses.get(key);
    if (!group) {
      group = {
        kind: "course",
        id: key,
        label: value.label,
        title: value.title,
        term: value.term,
        termCode: value.termCode,
        campus: value.campus,
        campusCode: value.campusCode,
        items: [],
      };
      courses.set(key, group);
    }
    group.items.push(item);
  }
  const order = { course: 0, section: 1, syllabus: 2 };
  const courseGroups = [...courses.values()].sort(
    (a, b) =>
      compare(a.label, b.label) ||
      compare(b.termCode || b.term, a.termCode || a.term) ||
      compare(a.campusCode || a.campus, b.campusCode || b.campus),
  );
  for (const group of courseGroups)
    group.items.sort(
      (a, b) =>
        order[a.kind] - order[b.kind] || compare(a.payload.id, b.payload.id),
    );
  const groups: SharedContentGroup[] = courseGroups;
  if (instructors.length)
    groups.push({
      kind: "instructors",
      id: "instructors",
      items: instructors.sort(
        (a, b) =>
          compare(a.payload.name, b.payload.name) ||
          compare(a.payload.id, b.payload.id),
      ),
    });
  return groups;
}
