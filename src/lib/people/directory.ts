import { createHash } from "node:crypto";

const SEARCH_SOCKET_URL =
  "wss://search-api.intcomm.osu.edu/socket.io/?EIO=3&transport=websocket";
const LEGACY_SEARCH_URL = "https://content.osu.edu/v2/people/search";
const MAX_RESULT_BYTES = 512 * 1024;
const MAX_RESULTS = 15;
const CACHE_LIMIT = 384;
const SUCCESS_TTL = 6 * 60 * 60 * 1000;
const EMPTY_TTL = 30 * 60 * 1000;
const ERROR_TTL = 30 * 1000;
const INCOMPLETE_TTL = 30 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 5_000;
export const DIRECTORY_SOURCE_BUDGET_MS = 18_000;
const MAX_PENDING_LOOKUPS = 12;
const NAME_DOT_NUMBER = /^[a-z0-9_-]+\.\d{1,10}$/i;

export function directoryAccountFromTerm(term: string) {
  const value = term.trim();
  return NAME_DOT_NUMBER.test(value) ? value.toLocaleLowerCase() : null;
}

export function hasDirectoryRoleEvidence(person: DirectoryCandidate) {
  return person.roles.length > 0 || person.appointments.length > 0;
}

/** Search terms omit middle names; result acceptance still uses the full name. */
export function directoryNameQueries(name: string) {
  const words = name.trim().replace(/\s+/g, " ").split(" ");
  if (words.length <= 2) return [words.join(" ")];
  const first = words[0];
  const last = words.at(-1)!;
  const queries = [`${first} ${last}`];
  // Four or more words can carry a compound family name after middle names.
  if (words.length >= 4) {
    const family = words.slice(-2);
    queries.push(`${first} ${family.join("")}`, `${first} ${family.join(" ")}`);
  }
  return [...new Set(queries)].slice(0, 3);
}

export type DirectoryRole =
  | "professor"
  | "lecturer"
  | "faculty"
  | "teaching-assistant"
  | "student-assistant"
  | "student"
  | "employee";

export interface DirectoryAppointment {
  title: string;
  organization: string | null;
}

export interface DirectoryCandidate {
  name: string;
  roles: DirectoryRole[];
  appointments: DirectoryAppointment[];
}

export type DirectoryLookupResult =
  | {
      status: "available";
      source: "osu-search" | "content-api-v2" | "department-profile";
      sourceUrl?: string;
      verifiedAt?: string;
      cache: "memory" | "database" | "source";
      stale?: boolean;
      results: DirectoryCandidate[];
    }
  | { status: "unavailable"; source: null; results: [] };

type NewPersonRecord = {
  attributes?: {
    first_name?: unknown;
    middle_name?: unknown;
    last_name?: unknown;
    affiliations?: unknown;
    majors?: unknown;
    appointments?: unknown;
  };
};

type LegacyPersonRecord = {
  displayName?: unknown;
  firstName?: unknown;
  middleName?: unknown;
  lastName?: unknown;
  affiliations?: unknown;
  majors?: unknown;
  appointments?: unknown;
};

type CacheEntry = { expiresAt: number; value: DirectoryLookupResult };
const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<DirectoryLookupResult>>();

function cacheKey(term: string, fallbackName?: string, subject?: string) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        term.toLocaleLowerCase(),
        fallbackName?.toLocaleLowerCase() ?? "",
        subject?.toUpperCase() ?? "",
      ]),
    )
    .digest("hex");
}

function cleanText(value: unknown, max = 180): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function textFromKeys(value: unknown, keys: string[]): string | null {
  if (!isRecord(value)) return null;
  for (const key of keys) {
    const found = cleanText(value[key]);
    if (found) return found;
  }
  return null;
}

function textEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 24)
    .map((item) => {
      if (typeof item === "string") return cleanText(item, 100);
      return textFromKeys(item, [
        "name",
        "label",
        "title",
        "type",
        "affiliation",
        "value",
      ]);
    })
    .filter((item): item is string => Boolean(item));
}

function normalizeAppointments(value: unknown): DirectoryAppointment[] {
  if (!Array.isArray(value)) return [];
  const appointments: DirectoryAppointment[] = [];
  const seen = new Set<string>();
  for (const item of value.slice(0, 24)) {
    const jobTitle = textFromKeys(item, ["job_title", "jobTitle"]);
    const workingTitle = textFromKeys(item, ["working_title", "workingTitle"]);
    const titleParts = [jobTitle, workingTitle].filter((part): part is string =>
      Boolean(part),
    );
    const title = [...new Set(titleParts)].join(" · ");
    const organization = textFromKeys(item, [
      "organization",
      "vp_college_name",
      "vpCollegeName",
    ]);
    if (!title) continue;
    const key = `${title.toLocaleLowerCase()}|${organization?.toLocaleLowerCase() ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    appointments.push({ title, organization });
  }
  return appointments.slice(0, 8);
}

export function inferRoles(
  appointments: DirectoryAppointment[],
  affiliations: string[],
  hasMajor: boolean,
): DirectoryRole[] {
  const roleEvidence = [
    ...appointments.map((appointment) => appointment.title),
    ...affiliations,
  ]
    .join(" ")
    .toLocaleLowerCase();
  const roles = new Set<DirectoryRole>();

  if (
    /\b(teaching assistant|graduate teaching associate|undergraduate teaching assistant|graduate teaching assistant)\b/.test(
      roleEvidence,
    )
  ) {
    roles.add("teaching-assistant");
  } else if (
    /\b(student assistant|graduate assistant|undergraduate assistant)\b/.test(
      roleEvidence,
    )
  ) {
    roles.add("student-assistant");
  }
  if (/\bprofessor\b/.test(roleEvidence)) {
    roles.add("professor");
  }
  if (/\blecturer\b/.test(roleEvidence)) {
    roles.add("lecturer");
  }
  if (
    !roles.has("professor") &&
    !roles.has("lecturer") &&
    /\b(instructor|faculty)\b/.test(roleEvidence)
  ) {
    roles.add("faculty");
  }
  if (hasMajor || /\bstudent\b/.test(roleEvidence)) roles.add("student");
  if (appointments.length > 0) roles.add("employee");
  return [...roles];
}

export function normalizeNewRecord(
  record: NewPersonRecord,
): DirectoryCandidate | null {
  const attributes = record.attributes;
  if (!attributes) return null;
  const name = [
    cleanText(attributes.first_name, 80),
    cleanText(attributes.middle_name, 80),
    cleanText(attributes.last_name, 80),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
  if (!name) return null;
  const appointments = normalizeAppointments(attributes.appointments);
  const affiliations = textEntries(attributes.affiliations);
  const majors = Array.isArray(attributes.majors) ? attributes.majors : [];
  return {
    name,
    roles: inferRoles(appointments, affiliations, majors.length > 0),
    appointments,
  };
}

export function normalizeLegacyRecord(
  record: LegacyPersonRecord,
): DirectoryCandidate | null {
  const name =
    cleanText(record.displayName, 180) ??
    [
      cleanText(record.firstName, 80),
      cleanText(record.middleName, 80),
      cleanText(record.lastName, 80),
    ]
      .filter((part): part is string => Boolean(part))
      .join(" ");
  if (!name) return null;
  const appointments = normalizeAppointments(record.appointments);
  const affiliations = textEntries(record.affiliations);
  const majors = Array.isArray(record.majors) ? record.majors : [];
  return {
    name,
    roles: inferRoles(appointments, affiliations, majors.length > 0),
    appointments,
  };
}

function dedupeCandidates(candidates: DirectoryCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    // Same-name people are distinct candidates. Merge only identical projections.
    const key = JSON.stringify(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readJsonLimited(response: Response): Promise<unknown> {
  return JSON.parse(await readTextLimited(response));
}

async function readTextLimited(response: Response): Promise<string> {
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > MAX_RESULT_BYTES)
    throw new Error("response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing response body");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RESULT_BYTES) {
        await reader.cancel();
        throw new Error("response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

const DEPARTMENT_PROFILES: Record<
  string,
  { origin: string; organization: string }
> = {
  MATH: {
    origin: "https://math.osu.edu",
    organization: "Department of Mathematics",
  },
};

export function directoryHasDepartmentProfile(subject?: string) {
  return Boolean(subject && DEPARTMENT_PROFILES[subject.toUpperCase()]);
}

function remainingTimeout(deadline: number) {
  return Math.max(0, Math.min(LOOKUP_TIMEOUT_MS, deadline - Date.now()));
}

function textFromHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseDepartmentProfile(
  html: string,
  identity: string,
  subject: string,
): DirectoryAppointment[] | null {
  const department = DEPARTMENT_PROFILES[subject.toUpperCase()];
  if (!department || !NAME_DOT_NUMBER.test(identity)) return null;
  const expectedUrl = `${department.origin}/people/${identity.toLowerCase()}`;
  const canonical = html.match(
    /<link\b(?=[^>]*\brel=["']canonical["'])(?=[^>]*\bhref=["']([^"']+)["'])[^>]*>/i,
  )?.[1];
  if (canonical?.replace(/\/$/, "") !== expectedUrl) return null;
  const profile = html.match(
    /<section\b[^>]*class=["'][^"']*\buser-profile__contact-information\b[^"']*["'][^>]*>([\s\S]*?)<\/section>/i,
  )?.[1];
  if (!profile) return null;
  const emails = [
    ...profile.matchAll(/href=["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi),
  ].map((match) => match[1].toLowerCase());
  if (!emails.includes(`${identity.toLowerCase()}@osu.edu`)) return null;
  const titleFields = [
    ...profile.matchAll(
      /<div\b[^>]*class=["'][^"']*\bfield--name-field-your-title\b[^"']*["'][^>]*>\s*(?:<div\b[^>]*class=["'][^"']*\bfield--label\b[^"']*["'][^>]*>[\s\S]*?<\/div>)?\s*<div\b[^>]*class=["'][^"']*\bfield--item\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
    ),
  ];
  if (titleFields.length !== 1) return null;
  const title = textFromHtml(titleFields[0][1]);
  if (!title || title.length > 180) return null;
  return [{ title, organization: department.organization }];
}

async function searchDepartmentProfile(
  identity: string,
  subject: string | undefined,
  deadline: number,
) {
  const department = subject
    ? DEPARTMENT_PROFILES[subject.toUpperCase()]
    : null;
  if (!department || !NAME_DOT_NUMBER.test(identity)) return null;
  const sourceUrl = `${department.origin}/people/${identity.toLowerCase()}`;
  let url = new URL(sourceUrl);
  for (let redirects = 0; redirects <= 2; redirects++) {
    const timeout = remainingTimeout(deadline);
    if (!timeout) return null;
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        redirect: "manual",
        cache: "no-store",
        headers: {
          Accept: "text/html",
          "User-Agent": "osu-eval-directory-lookup/1.0",
        },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) return null;
        const target = new URL(location, url);
        if (target.origin !== department.origin) return null;
        url = target;
        continue;
      }
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("text/html")
      ) {
        await response.body?.cancel();
        return null;
      }
      const appointments = parseDepartmentProfile(
        await readTextLimited(response),
        identity,
        subject!,
      );
      return appointments ? { appointments, sourceUrl } : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function searchSocketIo(
  term: string,
  timeout = LOOKUP_TIMEOUT_MS,
): Promise<unknown[] | null> {
  return new Promise((resolve) => {
    if (typeof WebSocket === "undefined") return resolve(null);
    let socket: WebSocket;
    try {
      socket = new WebSocket(SEARCH_SOCKET_URL);
    } catch {
      return resolve(null);
    }
    let settled = false;
    let requested = false;
    const timer = setTimeout(() => finish(null), timeout);
    const finish = (value: unknown[] | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // A connection can fail before it enters the open state.
      }
      resolve(value);
    };
    socket.onmessage = (event) => {
      const message = typeof event.data === "string" ? event.data : "";
      if (
        !message ||
        message.length > MAX_RESULT_BYTES ||
        new TextEncoder().encode(message).byteLength > MAX_RESULT_BYTES
      )
        return finish(null);
      if (message.startsWith("0")) {
        if (socket.readyState === WebSocket.OPEN) socket.send("40");
        return;
      }
      if (message === "40") {
        if (!requested) {
          requested = true;
          socket.send(
            `42${JSON.stringify(["search", { term, providers: ["people"] }])}`,
          );
        }
        return;
      }
      if (message.startsWith("2")) {
        if (socket.readyState === WebSocket.OPEN)
          socket.send(`3${message.slice(1)}`);
        return;
      }
      if (!message.startsWith("42")) return;
      try {
        const packet: unknown = JSON.parse(message.slice(2));
        if (!Array.isArray(packet) || packet[0] !== "results") return;
        const payload = packet[1];
        if (!isRecord(payload)) return;
        const meta = payload.meta;
        if (!isRecord(meta) || meta.provider !== "people") return;
        if (typeof meta.query === "string" && meta.query !== term) return;
        if (!Array.isArray(payload.data)) return finish(null);
        finish(payload.data.slice(0, MAX_RESULTS));
      } catch {
        finish(null);
      }
    };
    socket.onerror = () => finish(null);
    socket.onclose = () => finish(null);
  });
}

export async function searchLegacy(
  term: string,
  deadline: number,
): Promise<unknown[] | null> {
  if (/^[a-z0-9_-]+\.\d{1,10}$/i.test(term)) return null;
  const words = term.split(/\s+/).filter(Boolean);
  const params = new URLSearchParams();
  if (words.length === 1) params.set("lastname", words[0]);
  else {
    // Legacy firstname excludes middle names. Account fallback still requires
    // an exact username/email match before accepting the result.
    params.set("firstname", words[0]);
    params.set("lastname", words.slice(1).join(" "));
  }
  let url = new URL(LEGACY_SEARCH_URL);
  url.search = params.toString();
  for (let redirects = 0; redirects <= 2; redirects++) {
    const timeout = remainingTimeout(deadline);
    if (!timeout) return null;
    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(timeout),
        cache: "no-store",
        redirect: "manual",
        headers: {
          Accept: "application/json",
          "User-Agent": "osu-eval-directory-lookup/1.0",
        },
      });
    } catch {
      return null;
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const next = response.headers.get("location");
      await response.body?.cancel();
      if (!next) return null;
      try {
        const target = new URL(next, url);
        if (target.origin !== "https://content.osu.edu") return null;
        url = target;
        continue;
      } catch {
        return null;
      }
    }
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    try {
      const body: unknown = await readJsonLimited(response);
      if (!isRecord(body) || !isRecord(body.data)) return null;
      return Array.isArray(body.data.people)
        ? body.data.people.slice(0, MAX_RESULTS)
        : [];
    } catch {
      await response.body?.cancel();
      return null;
    }
  }
  return null;
}

function prepareResult(
  records: unknown[],
  source: "osu-search" | "content-api-v2",
  legacy = false,
  identity?: string,
): DirectoryLookupResult {
  const results = dedupeCandidates(
    records
      .filter((record) => {
        if (!identity) return true;
        if (!isRecord(record)) return false;
        if (legacy) {
          // Confirmed legacy fields; a matching name alone cannot prove an account.
          const username = cleanText(record.username)?.toLocaleLowerCase();
          const email = cleanText(record.email)?.toLocaleLowerCase();
          return username === identity || email === `${identity}@osu.edu`;
        }
        const attributes = isRecord(record.attributes) ? record.attributes : {};
        const id = cleanText(record.id)?.toLocaleLowerCase();
        const email = cleanText(attributes.email)?.toLocaleLowerCase();
        return id === identity || email === `${identity}@osu.edu`;
      })
      .map((record) =>
        isRecord(record)
          ? legacy
            ? normalizeLegacyRecord(record)
            : normalizeNewRecord(record as NewPersonRecord)
          : null,
      )
      .filter((candidate): candidate is DirectoryCandidate =>
        Boolean(candidate),
      ),
  ).slice(0, MAX_RESULTS);
  return { status: "available", source, cache: "source", results };
}

async function fetchLookup(
  term: string,
  fallbackName?: string,
  subject?: string,
): Promise<DirectoryLookupResult> {
  const deadline = Date.now() + DIRECTORY_SOURCE_BUDGET_MS;
  const identity = /^[a-z0-9_-]+\.\d{1,10}$/i.test(term)
    ? term.toLocaleLowerCase()
    : undefined;
  let matched: Extract<DirectoryLookupResult, { status: "available" }> | null =
    null;
  let sourceAvailable = false;
  const exactName = (name: string) =>
    name
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  const accept = (result: DirectoryLookupResult) => {
    if (result.status !== "available") return null;
    if (!identity)
      result.results = result.results.filter(
        (candidate) => exactName(candidate.name) === exactName(term),
      );
    return result.results.length ? result : null;
  };
  for (const query of identity ? [term] : directoryNameQueries(term)) {
    const timeout = remainingTimeout(deadline);
    if (!timeout) break;
    const current = await searchSocketIo(query, timeout);
    if (current === null) continue;
    sourceAvailable = true;
    const normalized = accept(
      prepareResult(current, "osu-search", false, identity),
    );
    if (!normalized) continue;
    matched = normalized;
    if (normalized.results.some(hasDirectoryRoleEvidence)) return normalized;
    break;
  }
  // A legacy name search only supplies candidates. The original account or
  // canonical full name remains the acceptance condition.
  const legacyName = identity ? fallbackName : term;
  if (legacyName) {
    for (const query of directoryNameQueries(legacyName)) {
      if (!remainingTimeout(deadline)) break;
      const legacy = await searchLegacy(query, deadline);
      if (legacy === null) continue;
      sourceAvailable = true;
      const normalized = accept(
        prepareResult(legacy, "content-api-v2", true, identity),
      );
      if (!normalized) continue;
      matched ??= normalized;
      if (normalized.results.some(hasDirectoryRoleEvidence)) return normalized;
      break;
    }
  }
  if (identity && matched?.results.length === 1) {
    const profile = await searchDepartmentProfile(identity, subject, deadline);
    if (profile) {
      const person = matched.results[0];
      return {
        status: "available",
        source: "department-profile",
        sourceUrl: profile.sourceUrl,
        cache: "source",
        results: [
          {
            ...person,
            appointments: profile.appointments,
            roles: inferRoles(
              profile.appointments,
              [],
              person.roles.includes("student"),
            ),
          },
        ],
      };
    }
  }
  if (matched) return matched;
  if (sourceAvailable)
    return {
      status: "available",
      source: "osu-search",
      cache: "source",
      results: [],
    };
  return { status: "unavailable", source: null, results: [] };
}

export function validDirectorySearchTerm(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const term = value.trim().replace(/\s+/g, " ");
  return (
    term.length >= 2 &&
    term.length <= 120 &&
    /^[\p{L}\p{M}\p{N} .,'’\-]+$/u.test(term)
  );
}

export function validDirectoryFallbackName(value: unknown): value is string {
  return (
    validDirectorySearchTerm(value) && value.trim().split(/\s+/).length >= 2
  );
}

export async function lookupDirectory(
  termValue: string,
  fallbackNameValue?: string,
  subject?: string,
  options: { bypassCache?: boolean } = {},
): Promise<DirectoryLookupResult> {
  if (!validDirectorySearchTerm(termValue))
    return { status: "unavailable", source: null, results: [] };
  const term = termValue.trim().replace(/\s+/g, " ");
  const fallbackName = validDirectoryFallbackName(fallbackNameValue)
    ? fallbackNameValue.trim().replace(/\s+/g, " ")
    : undefined;
  const key = cacheKey(term, fallbackName, subject);
  const cached = cache.get(key);
  if (!options.bypassCache && cached && cached.expiresAt > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return cached.value.status === "available"
      ? { ...cached.value, cache: "memory" }
      : cached.value;
  }
  if (cached) cache.delete(key);
  const inflight = pending.get(key);
  if (inflight) return inflight;
  if (pending.size >= MAX_PENDING_LOOKUPS)
    return { status: "unavailable", source: null, results: [] };

  const request = fetchLookup(term, fallbackName, subject)
    .catch((): DirectoryLookupResult => ({
      status: "unavailable",
      source: null,
      results: [],
    }))
    .then((value) => {
      const verified =
        value.status === "available"
          ? { ...value, verifiedAt: new Date().toISOString() }
          : value;
      const ttl =
        verified.status === "unavailable"
          ? ERROR_TTL
          : verified.results.length
            ? verified.results.some(hasDirectoryRoleEvidence)
              ? SUCCESS_TTL
              : INCOMPLETE_TTL
            : EMPTY_TTL;
      cache.set(key, { value: verified, expiresAt: Date.now() + ttl });
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return verified;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}
