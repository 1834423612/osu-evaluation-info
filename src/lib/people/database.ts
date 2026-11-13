import { queryDatabase } from "@/lib/db";
import { verifiedOfficialProfileSource } from "./profile-source";
import {
  directoryHasDepartmentProfile,
  hasDirectoryRoleEvidence,
} from "./directory";
import type { DirectoryCandidate, DirectoryLookupResult } from "./directory";

export type CachedDirectoryPerson = {
  nameDotNumber: string;
  person: DirectoryCandidate;
  source: "osu-search" | "content-api-v2" | "department-profile";
  sourceUrl?: string;
  cacheVersion?: number;
  verifiedAt: string;
};

type DirectoryPersonRow = {
  name_dot_number: string;
  display_name: string;
  roles: DirectoryCandidate["roles"];
  appointments: DirectoryCandidate["appointments"];
  source: "osu-search" | "content-api-v2" | "department-profile";
  source_url?: string | null;
  cache_version?: number;
  verified_at: string;
};

export const DIRECTORY_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const DIRECTORY_CACHE_VERSION = 3;
export const INCOMPLETE_DIRECTORY_MAX_AGE_MS = 30 * 60 * 1000;

export function directoryPersonIsFresh(
  person: CachedDirectoryPerson,
  subject?: string,
) {
  if ((person.cacheVersion ?? 0) < DIRECTORY_CACHE_VERSION) return false;
  if (
    directoryHasDepartmentProfile(subject) &&
    !hasDirectoryRoleEvidence(person.person)
  )
    return false;
  const maxAge = hasDirectoryRoleEvidence(person.person)
    ? DIRECTORY_CACHE_MAX_AGE_MS
    : INCOMPLETE_DIRECTORY_MAX_AGE_MS;
  const age = Date.now() - Date.parse(person.verifiedAt);
  return age >= -60_000 && age < maxAge;
}

export function isVerifiedDirectoryPerson(
  value: unknown,
  expectedIdentity: string,
): value is CachedDirectoryPerson {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const person = value as Partial<CachedDirectoryPerson>;
  const roles = person.person?.roles;
  const appointments = person.person?.appointments;
  const validRoles = new Set([
    "professor",
    "lecturer",
    "faculty",
    "teaching-assistant",
    "student-assistant",
    "student",
    "employee",
  ]);
  return (
    person.nameDotNumber === expectedIdentity &&
    /^[a-z0-9_-]+\.\d{1,10}$/i.test(person.nameDotNumber) &&
    typeof person.verifiedAt === "string" &&
    Number.isFinite(Date.parse(person.verifiedAt)) &&
    (person.source === "osu-search" ||
      person.source === "content-api-v2" ||
      person.source === "department-profile") &&
    (person.source !== "department-profile" ||
      verifiedOfficialProfileSource(person.sourceUrl, expectedIdentity)) &&
    typeof person.person?.name === "string" &&
    person.person.name.length > 0 &&
    person.person.name.length <= 180 &&
    Array.isArray(roles) &&
    roles.length <= validRoles.size &&
    roles.every((role) => validRoles.has(role)) &&
    Array.isArray(appointments) &&
    appointments.length <= 8 &&
    appointments.every(
      (appointment) =>
        appointment &&
        typeof appointment.title === "string" &&
        appointment.title.length > 0 &&
        appointment.title.length <= 180 &&
        (appointment.organization === null ||
          (typeof appointment.organization === "string" &&
            appointment.organization.length <= 180)),
    )
  );
}

function mapRow(row: DirectoryPersonRow): CachedDirectoryPerson | null {
  const value: CachedDirectoryPerson = {
    nameDotNumber: row.name_dot_number,
    person: {
      name: row.display_name,
      roles: row.roles,
      appointments: row.appointments,
    },
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    cacheVersion: row.cache_version ?? 0,
    verifiedAt: row.verified_at,
  };
  return isVerifiedDirectoryPerson(value, row.name_dot_number) ? value : null;
}

export async function readDirectoryPerson(
  identity: string,
): Promise<CachedDirectoryPerson | null> {
  const result = await queryDatabase<DirectoryPersonRow>(
    `SELECT name_dot_number, display_name, roles, appointments, source, source_url, cache_version,
            verified_at::text
       FROM osu_directory.person_cache
      WHERE name_dot_number = $1`,
    [identity],
  );
  const row = result.rows[0];
  return row ? mapRow(row) : null;
}

export async function writeDirectoryPerson(
  identity: string,
  person: DirectoryCandidate,
  result: Extract<DirectoryLookupResult, { status: "available" }>,
) {
  if (
    !/^[a-z0-9_-]+\.\d{1,10}$/i.test(identity) ||
    !result.results.some((candidate) => candidate === person) ||
    result.cache === "database" ||
    (result.source !== "osu-search" &&
      result.source !== "content-api-v2" &&
      result.source !== "department-profile") ||
    (result.source === "department-profile" &&
      !verifiedOfficialProfileSource(result.sourceUrl, identity))
  )
    return false;

  await queryDatabase(
    `INSERT INTO osu_directory.person_cache
       (name_dot_number, display_name, roles, appointments, source, verified_at, source_url, cache_version)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, coalesce($6::timestamptz, now()), $7, $8)
     ON CONFLICT (name_dot_number) DO UPDATE SET
       display_name = EXCLUDED.display_name,
       roles = EXCLUDED.roles,
       appointments = EXCLUDED.appointments,
       source = EXCLUDED.source,
       verified_at = EXCLUDED.verified_at,
       source_url = EXCLUDED.source_url,
       cache_version = EXCLUDED.cache_version,
       updated_at = now()
     WHERE ROW(osu_directory.person_cache.display_name,
               osu_directory.person_cache.roles,
               osu_directory.person_cache.appointments,
               osu_directory.person_cache.source,
               osu_directory.person_cache.verified_at,
               osu_directory.person_cache.source_url,
               osu_directory.person_cache.cache_version)
       IS DISTINCT FROM ROW(EXCLUDED.display_name, EXCLUDED.roles,
                            EXCLUDED.appointments, EXCLUDED.source,
                            EXCLUDED.verified_at, EXCLUDED.source_url,
                            EXCLUDED.cache_version)`,
    [
      identity,
      person.name,
      JSON.stringify(person.roles),
      JSON.stringify(person.appointments),
      result.source,
      result.verifiedAt ?? null,
      result.sourceUrl ?? null,
      DIRECTORY_CACHE_VERSION,
    ],
  );
  return true;
}

export function directoryPersonResponse(
  person: CachedDirectoryPerson,
  options: { stale?: boolean } = {},
): DirectoryLookupResult {
  return {
    status: "available",
    source: person.source,
    ...(person.sourceUrl ? { sourceUrl: person.sourceUrl } : {}),
    cache: "database",
    verifiedAt: person.verifiedAt,
    ...(options.stale ? { stale: true } : {}),
    results: [person.person],
  };
}
