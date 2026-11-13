import { mkdir, appendFile, readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import {
  searchSocketIo,
  searchLegacy,
  normalizeNewRecord,
  normalizeLegacyRecord,
} from "../../src/lib/people/directory.ts";

export const foldName = (value) =>
  (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
export function projectPerson(record, legacy = false) {
  const user = String(
      legacy ? record?.username : (record?.id ?? ""),
    ).toLowerCase(),
    attributes = legacy ? record : record?.attributes;
  if (!/^[a-z][a-z0-9_-]*\.\d+$/.test(user) || !attributes) return null;
  const person = legacy
    ? normalizeLegacyRecord(record)
    : normalizeNewRecord(record);
  if (!person) return null;
  const campuses = [];
  for (const [code, label] of [
    ["COL", "Columbus"],
    ["MNS", "Mansfield"],
    ["LMA", "Lima"],
    ["MRN", "Marion"],
    ["NWK", "Newark"],
    ["WST", "Wooster"],
  ])
    if (
      String(
        attributes.address?.city ?? attributes.city ?? "",
      ).toLowerCase() === label.toLowerCase()
    )
      campuses.push(code);
  return {
    user,
    ...person,
    campuses,
    first: String(
      legacy ? attributes.firstName : (attributes.first_name ?? ""),
    ),
    middle: String(
      legacy ? (attributes.middleName ?? "") : (attributes.middle_name ?? ""),
    ),
    last: String(legacy ? attributes.lastName : (attributes.last_name ?? "")),
  };
}

export async function scanDirectory({
  output,
  intervalMs = 250,
  workers = 8,
  limit = Infinity,
  legacy = false,
  accounts = false,
} = {}) {
  loadCatalogEnvironment();
  output = resolve(
    output ??
      (accounts
        ? "data/local/rmp/identity-account-scan.jsonl"
        : legacy
          ? "data/local/rmp/identity-legacy-scan.jsonl"
          : "data/local/rmp/identity-directory-scan.jsonl"),
  );
  await mkdir(dirname(output), { recursive: true });
  const completed = new Set();
  try {
    for (const line of (await readFile(output, "utf8"))
      .split("\n")
      .filter(Boolean)) {
      const row = JSON.parse(line);
      if (row.status === "available" && row.cache_saved)
        completed.add(row.professor_id);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const client = createCatalogClient("rmp-directory-full-audit");
  await client.connect();
  let profiles = [],
    after = 0;
  try {
    for (;;) {
      const { rows } = await client.query(
        `SELECT p.legacy_id::text AS id,p.first_name,p.last_name,p.department,
        ARRAY(SELECT DISTINCT s.campus_code FROM osu_rmp.professor_school ps JOIN osu_rmp.school s ON s.legacy_id=ps.school_id WHERE ps.professor_id=p.legacy_id) AS campuses
        FROM osu_rmp.professor p WHERE p.active AND p.legacy_id>$1 AND NOT EXISTS
        (SELECT 1 FROM osu_rmp.professor_identity_map m WHERE m.professor_id=p.legacy_id AND m.state='accepted')
        ORDER BY p.legacy_id LIMIT 100`,
        [after],
      );
      if (!rows.length) break;
      profiles.push(...rows);
      after = rows.at(-1).id;
    }
    if (accounts) {
      const report = JSON.parse(
        await readFile("data/local/rmp/identity-research-report.json", "utf8"),
      );
      const selected = new Map(
        report.results
          .filter((r) => r.state !== "reserved")
          .map((r) => [
            String(r.professor_id),
            r.evidence.candidates.map((c) => c.user),
          ]),
      );
      profiles = profiles
        .filter((p) => selected.get(p.id)?.length)
        .map((p) => ({
          ...p,
          accountQueries: [...new Set(selected.get(p.id))],
        }));
    }
    if (legacy) {
      try {
        const primary = new Map(
          (
            await readFile(
              "data/local/rmp/identity-directory-scan.jsonl",
              "utf8",
            )
          )
            .trim()
            .split("\n")
            .filter(Boolean)
            .map((line) => JSON.parse(line))
            .map((row) => [row.professor_id, row]),
        );
        profiles = profiles.filter(
          (p) =>
            !primary
              .get(p.id)
              ?.candidates?.some(
                (person) =>
                  foldName(person.first) ===
                    foldName(p.first_name.split(/\s+/)[0]) &&
                  foldName(person.last) === foldName(p.last_name),
              ),
        );
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    const total = profiles.length;
    profiles = profiles.filter((p) => !completed.has(p.id));
    const alreadyScanned = total - profiles.length;
    profiles = profiles.slice(0, limit);
    console.log(
      JSON.stringify({
        event: "start",
        unlinked: total,
        alreadyScanned,
        queued: profiles.length,
        output,
      }),
    );
    let index = 0,
      finished = 0,
      found = 0,
      failed = 0,
      nextStart = 0;
    let cacheWrites = Promise.resolve();
    const writeCache = (sql, values) => {
      const request = cacheWrites.then(() => client.query(sql, values));
      cacheWrites = request.catch(() => {});
      return request;
    };
    async function worker() {
      for (;;) {
        const profile = profiles[index++];
        if (!profile) return;
        const slot = Math.max(Date.now(), nextStart);
        nextStart = slot + intervalMs;
        await delay(Math.max(0, slot - Date.now()));
        const first = profile.first_name
          .replace(/\([^)]*\)/g, "")
          .trim()
          .split(/\s+/)[0];
        const queries = profile.accountQueries ?? [
          `${first} ${profile.last_name}`.trim(),
        ];
        const query = queries.join(",");
        let records = [],
          anyFailure = false;
        for (const term of queries) {
          const lookup = () =>
            legacy
              ? searchLegacy(term, Date.now() + 10000)
              : searchSocketIo(term);
          let found = await lookup();
          if (found === null) {
            await delay(2000);
            found = await lookup();
          }
          if (found === null) anyFailure = true;
          else
            records.push(
              ...(accounts ? found.filter((r) => r.id === term) : found),
            );
        }
        if (anyFailure && !records.length) records = null;
        const candidates = (records ?? [])
          .map((record) => projectPerson(record, legacy))
          .filter(Boolean);
        const row = {
          professor_id: profile.id,
          profile: {
            name: `${profile.first_name} ${profile.last_name}`,
            department: profile.department,
            campuses: profile.campuses,
          },
          query,
          status: records === null ? "unavailable" : "available",
          source: legacy ? "content-api-v2" : "osu-search",
          checked_at: new Date().toISOString(),
          possibly_truncated: records?.length === 15,
          candidates,
        };
        // Journal each response before cache writes; retries never erase earlier evidence.
        await appendFile(output, JSON.stringify(row) + "\n");
        for (const person of candidates) {
          if (
            foldName(person.first) !== foldName(first) ||
            foldName(person.last) !== foldName(profile.last_name)
          )
            continue;
          await writeCache(
            `INSERT INTO osu_directory.person_cache(name_dot_number,display_name,roles,appointments,source,verified_at,cache_version)
            VALUES($1,$2,$3::jsonb,$4::jsonb,$6,$5,3) ON CONFLICT(name_dot_number) DO UPDATE SET
            display_name=excluded.display_name,roles=excluded.roles,appointments=excluded.appointments,source=excluded.source,
            verified_at=excluded.verified_at,cache_version=3,source_url=NULL,updated_at=now()
            WHERE jsonb_array_length(excluded.appointments)>0 OR
              (jsonb_array_length(osu_directory.person_cache.appointments)=0 AND jsonb_array_length(osu_directory.person_cache.roles)=0)`,
            [
              person.user,
              person.name,
              JSON.stringify(person.roles),
              JSON.stringify(person.appointments),
              row.checked_at,
              row.source,
            ],
          );
        }
        await appendFile(
          output,
          JSON.stringify({ ...row, cache_saved: true }) + "\n",
        );
        finished++;
        if (candidates.length) found++;
        if (records === null) failed++;
        if (finished % 50 === 0 || finished === profiles.length)
          console.log(
            JSON.stringify({
              event: "progress",
              finished,
              total: profiles.length,
              withCandidates: found,
              sourceFailures: failed,
            }),
          );
      }
    }
    await Promise.all(Array.from({ length: workers }, worker));
    return {
      scanned: finished,
      withCandidates: found,
      sourceFailures: failed,
      output,
    };
  } finally {
    await client.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2),
    value = (name) =>
      args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
  if (args.includes("--help"))
    console.log(
      "Scan every unlinked RMP profile against OSU Search and cache official candidate accounts. Resumes from an append-only local evidence journal; does not accept identity mappings. Options: --output PATH --limit N",
    );
  else
    console.log(
      JSON.stringify(
        await scanDirectory({
          output: value("--output"),
          limit: Number(value("--limit") ?? Infinity),
          legacy: args.includes("--legacy"),
          accounts: args.includes("--accounts"),
        }),
      ),
    );
}
