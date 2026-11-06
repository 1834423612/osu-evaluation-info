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
