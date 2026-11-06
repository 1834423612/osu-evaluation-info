import type {
  DirectoryAppointment,
  DirectoryCandidate,
  DirectoryRole,
} from "./directory";

export type DirectoryInstructor = {
  name: string;
  email?: string | null;
  subject?: string;
};

export type CompactDirectoryRoleCategory =
  | "professor"
  | "lecturer"
  | "teaching-assistant"
  | "assistant"
  | "faculty"
  | "student"
  | "employee";

export type CompactDirectoryRole = {
  category: CompactDirectoryRoleCategory;
  label: { en: string; zh: string };
};

const COMPACT_DIRECTORY_ROLES: Record<
  CompactDirectoryRoleCategory,
  CompactDirectoryRole
> = {
  professor: {
    category: "professor",
    label: { en: "Professor", zh: "教授" },
  },
  lecturer: {
    category: "lecturer",
    label: { en: "Lecturer", zh: "讲师" },
  },
  "teaching-assistant": {
    category: "teaching-assistant",
    label: { en: "TA", zh: "助教" },
  },
  assistant: {
    category: "assistant",
    label: { en: "Assistant", zh: "助理" },
  },
  faculty: {
    category: "faculty",
    label: { en: "Instructor", zh: "教师" },
  },
  student: {
    category: "student",
    label: { en: "Student", zh: "学生" },
  },
  employee: {
    category: "employee",
    label: { en: "Staff", zh: "职员" },
  },
};

/** Short presentation categories; the full official appointment stays intact. */
export function compactDirectoryRole(
  person: DirectoryCandidate,
): CompactDirectoryRole | null {
  const titles = person.appointments.map((appointment) => appointment.title);
  const hasTitle = (pattern: RegExp) =>
    titles.some((title) => pattern.test(title));
  // Academic rank modifiers do not turn a professor into a generic assistant.
  if (person.roles.includes("professor") || hasTitle(/\bprofessor\b/i))
    return COMPACT_DIRECTORY_ROLES.professor;
  if (person.roles.includes("lecturer") || hasTitle(/\blecturer\b/i))
    return COMPACT_DIRECTORY_ROLES.lecturer;
  if (
    person.roles.includes("teaching-assistant") ||
    hasTitle(/\bteaching\s+(?:assistant|associate)\b/i)
  )
    return COMPACT_DIRECTORY_ROLES["teaching-assistant"];
  if (
    person.roles.includes("student-assistant") ||
    hasTitle(
      /\b(?:research|student|graduate|undergraduate|office|lab|laboratory)\s+(?:assistant|associate)\b/i,
    )
  )
    return COMPACT_DIRECTORY_ROLES.assistant;
  if (person.roles.includes("faculty") || hasTitle(/\binstructor\b/i))
    return COMPACT_DIRECTORY_ROLES.faculty;
  if (person.roles.includes("student")) return COMPACT_DIRECTORY_ROLES.student;
  if (person.roles.includes("employee"))
    return COMPACT_DIRECTORY_ROLES.employee;
  return null;
}

/** OSU can list one appointment both with and without college or contract suffixes. */
export function distinctDirectoryAppointments(
  appointments: DirectoryAppointment[],
) {
  const titleKey = (title: string) =>
    title
      .replace(/\([^)]*\)/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  const departmentKey = (organization: string | null) =>
    organization
      ?.split(/\s+-\s+/)
      .at(-1)
      ?.trim()
      .toLowerCase() ?? "";
  const distinct = new Map<string, DirectoryAppointment>();
  for (const appointment of appointments) {
    const key = `${titleKey(appointment.title)}\0${departmentKey(appointment.organization)}`;
    const previous = distinct.get(key);
    if (
      !previous ||
      `${appointment.title}${appointment.organization ?? ""}`.length >
        `${previous.title}${previous.organization ?? ""}`.length
    )
      distinct.set(key, appointment);
  }
  return [...distinct.values()];
}

export function visibleDirectoryRoles(roles: DirectoryRole[]) {
  const hasAssistantRole =
    roles.includes("teaching-assistant") || roles.includes("student-assistant");
  const hasFacultyRole = roles.some((role) =>
    ["professor", "lecturer", "faculty"].includes(role),
  );
  return roles.filter((role) => {
    if (role === "employee" && (roles.length > 1 || hasFacultyRole))
      return false;
    if (role === "student" && hasAssistantRole) return false;
    return true;
  });
}

export function instructorDirectoryQuery(instructor: DirectoryInstructor) {
  return (
    instructor.email
      ?.trim()
      .match(/^([a-z0-9_-]+\.\d{1,10})@osu\.edu$/i)?.[1] ??
    instructor.name.trim()
  );
}

export function normalizedDirectoryName(name: string) {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/** A fuzzy search hit is never enough to automatically assign someone's role. */
export function selectDirectoryCandidate(
  candidates: DirectoryCandidate[],
  instructor: DirectoryInstructor,
): DirectoryCandidate | null {
  const query = instructorDirectoryQuery(instructor);
  if (/^[a-z0-9_-]+\.\d{1,10}$/i.test(query)) {
    // The server accepts an identity search result only when its account matches.
    return candidates.length === 1 ? candidates[0] : null;
  }
  const expected = normalizedDirectoryName(instructor.name);
  const exact = candidates.filter(
    (person) => normalizedDirectoryName(person.name) === expected,
  );
  return exact.length === 1 ? exact[0] : null;
}
