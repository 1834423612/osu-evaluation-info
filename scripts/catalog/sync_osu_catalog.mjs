#!/usr/bin/env node
/** Official OSU class search -> PostgreSQL; bounded pages, retries, atomic checkpoints. */
import { randomUUID } from "node:crypto";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
  withPageTransaction,
} from "./database.mjs";

import { stripEnrollmentFields } from "../../src/lib/catalog/availability.ts";
import { publishCatalogSnapshot } from "./snapshots.mjs";

loadCatalogEnvironment();
const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: node scripts/catalog/sync_osu_catalog.mjs [--term 1272] [--new-run] [--max-pages N] [--discover-only]\nReads DATABASE_URL and .env.local. Default: every currently searchable term, all campuses. Resume unfinished work automatically. --max-pages deliberately checkpoints a partial run.",
  );
  process.exit(0);
}
const arg = (key) =>
  args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
const requestedTerm = arg("--term");
const maxPages = Number(arg("--max-pages") ?? Infinity);
if (requestedTerm && !/^\d{4}$/.test(requestedTerm))
  throw new Error("--term must be a four-digit term code.");
if (!(maxPages > 0)) throw new Error("--max-pages must be positive.");
const base = "https://content.osu.edu/v2/classes/";
const sleep = (ms) =>
  new Promise((resolveSleep) => setTimeout(resolveSleep, ms));

async function fetchJson(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(base + path, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok)
        throw new Error(
          `Official OSU endpoint returned HTTP ${response.status}.`,
        );
      const value = await response.json();
      if (!value.data || typeof value.data !== "object")
        throw new Error("Invalid OSU response.");
      return value.data;
    } catch (error) {
      if (attempt === 4) throw error;
      await sleep(Math.min(15_000, 800 * 2 ** attempt));
    }
  }
}
const search = (query) =>
  fetchJson(
    `search?${new URLSearchParams({ q: "", client: "class-search-ui", sort: "subject", ...query })}`,
  );
const facet = (data, slug) =>
  data.filters.find((f) => f.slug === slug)?.items ?? [];
const actualCount = (data) => {
  const selected = data.filters.flatMap((f) =>
    f.items.filter((i) => i.selected).map((i) => i.count),
  );
  return selected.length ? Math.min(...selected) : data.totalItems;
};
const availableTerms = (await fetchJson("searchableTermsV2")).data.filter(
  (t) => t.classSearch === "Y",
);
const terms = availableTerms.filter(
  (t) => !requestedTerm || requestedTerm === t.strm,
);
if (!terms.length)
  throw new Error("The requested term is not currently searchable.");
if (args.includes("--discover-only")) {
  for (const term of terms) {
    const data = await search({ term: term.strm });
    console.log(
      JSON.stringify({
        term: term.strm,
        label: term.descr,
        sections: actualCount(data),
        subjects: facet(data, "subject").length,
        upstreamCap: 10_000,
      }),
    );
  }
  process.exit(0);
}
const client = createCatalogClient("osu-catalog-sync");
let runId;
let locked = false;
try {
  await client.connect();
  locked = (
    await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
      CATALOG_LOCK,
    ])
  ).rows[0].locked;
  if (!locked) throw new Error("Another OSU catalog sync is already running.");
  await requireCatalogSchema(client);
  const termCodes = terms.map((t) => t.strm).sort();
  if (!args.includes("--new-run")) {
    const previous = await client.query(
      "SELECT r.id FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id WHERE v.published_at IS NULL AND r.status IN ('running','failed') AND r.terms = $1::jsonb ORDER BY r.started_at DESC LIMIT 1",
      [JSON.stringify(termCodes)],
    );
    runId = previous.rows[0]?.id;
  }
  if (runId) {
    await client.query(
      "UPDATE osu_catalog.sync_runs SET status='running', error=NULL WHERE id=$1",
      [runId],
    );
    console.log(`Resuming run ${runId}`);
  } else {
    runId = randomUUID();
    await withPageTransaction(client, async () => {
      await client.query(
        "INSERT INTO osu_catalog.sync_runs (id,status,terms) VALUES ($1,'running',$2::jsonb)",
        [runId, JSON.stringify(termCodes)],
      );
      await client.query(
        "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
        [runId],
      );
    });
    console.log(`Started run ${runId}`);
  }

  let expectedTotal = 0;
  const discoveries = new Map();
  const subjectUniverse = new Map();
  // Some term facets omit valid subjects (Summer 2026 omitted ART and GENED).
  // Cross-term discovery plus hit reconciliation exposes and repairs those gaps.
  for (const term of availableTerms) {
    const data = await search({ term: term.strm });
    discoveries.set(term.strm, data);
    for (const subject of facet(data, "subject"))
      subjectUniverse.set(subject.term, subject);
  }
  // Partition before requesting page 51: upstream silently caps broad queries at 10,000.
  async function addPartition(query, count, depth = 0) {
    if (count === 0) return;
    if (count < 10_000) {
      const key = new URLSearchParams(query).toString();
      await client.query(
        "INSERT INTO osu_catalog.sync_partitions (run_id,partition_key,query,expected_sections) VALUES ($1,$2,$3::jsonb,$4) ON CONFLICT DO NOTHING",
        [runId, key, JSON.stringify(query), count],
      );
      return;
    }
    const dimensions = [
      "campus",
      "component",
      "catalog-number",
      "academic-career",
    ];
    const dimension = dimensions[depth];
    if (!dimension)
      throw new Error(
        `Cannot safely partition ${JSON.stringify(query)} below the official 10,000-hit cap.`,
      );
    const data = await search(query);
    const values = facet(data, dimension);
    if (!values.length)
      throw new Error(`No ${dimension} facets for partition.`);
    for (const item of values)
      await addPartition(
        { ...query, [dimension]: item.term },
        item.count,
        depth + 1,
      );
  }
  for (const term of terms) {
    const data = discoveries.get(term.strm);
    const expected = actualCount(data);
    expectedTotal += expected;
    const subjects = new Map(
      facet(data, "subject").map((subject) => [subject.term, subject]),
    );
    let discovered = [...subjects.values()].reduce(
      (n, subject) => n + subject.count,
      0,
    );
    if (discovered < expected) {
      const candidates = [...subjectUniverse.keys()]
        .filter((subject) => !subjects.has(subject))
        .sort();
      for (const subject of candidates) {
        const extra = await search({ term: term.strm, subject });
        const count = actualCount(extra);
        if (count) {
          subjects.set(subject, { term: subject, count });
          discovered += count;
        }
        if (discovered >= expected) break;
      }
    }
    if (discovered !== expected)
      throw new Error(
        `Subject discovery coverage mismatch for ${term.strm}: ${discovered} vs official ${expected} hits. Refusing to mark incomplete coverage complete.`,
      );
    for (const subject of subjects.values())
      await addPartition(
        { term: term.strm, subject: subject.term },
        subject.count,
      );
    console.log(
      `${term.descr}: ${expected} official hits, ${subjects.size} subjects (reconciled)`,
    );
  }
  await client.query(
    "UPDATE osu_catalog.sync_runs SET expected_sections=$2 WHERE id=$1",
    [runId, expectedTotal],
  );

  const partitions = (
    await client.query(
      "SELECT * FROM osu_catalog.sync_partitions WHERE run_id=$1 AND NOT complete ORDER BY partition_key",
      [runId],
    )
  ).rows;
  let pagesProcessed = 0;
  let limited = false;
  outer: for (const partition of partitions) {
    for (let page = partition.next_page; ; page++) {
      if (pagesProcessed >= maxPages) {
        limited = true;
        break outer;
      }
      const data = await search({ ...partition.query, p: String(page) });
      if (data.totalItems >= 10_000)
        throw new Error(
          "Partition grew beyond the official result cap. Start a new run to repartition.",
        );
      const sectionCount = data.courses.reduce(
        (n, c) => n + c.sections.length,
        0,
      );
      if (!data.courses.length && page <= data.totalPages)
        throw new Error(
          "Unexpected empty official results page; checkpoint preserved.",
        );
      const fetchedAt = new Date().toISOString();

      // Bulk JSON recordsets keep a page to two data queries instead of one query per row.
      const rawCourses = data.courses.map(({ course: c, sections }) => ({
        term_code: sections[0]?.termCode ?? partition.query.term,
        course_id: String(c.courseId),
        offering_number: String(c.offeringNumber),
        campus_code: String(c.campusCode ?? ""),
        subject: c.subject,
        catalog_number: String(c.catalogNumber),
        title: c.title ?? "",
        description: c.description ?? "",
        data: c,
      }));
      const courses = [
        ...new Map(
          rawCourses.map((c) => [
            [c.term_code, c.course_id, c.offering_number, c.campus_code].join(
              ":",
            ),
            c,
          ]),
        ).values(),
      ];
      const rawSections = data.courses.flatMap(({ course: c, sections }) =>
        sections.map((s) => ({
          term_code: String(s.termCode ?? partition.query.term),
          class_number: String(s.classNumber),
          course_id: String(s.courseId ?? c.courseId),
          offering_number: String(s.courseOfferingNumber ?? c.offeringNumber),
          campus_code: String(s.secCampus ?? c.campusCode ?? ""),
          subject: c.subject,
          catalog_number: String(c.catalogNumber),
          data: stripEnrollmentFields(s),
        })),
      );
      const sections = [
        ...new Map(
          rawSections.map((s) => [`${s.term_code}:${s.class_number}`, s]),
        ).values(),
      ];
      courses.sort((a, b) =>
        compareKeys(
          [a.term_code, a.course_id, a.offering_number, a.campus_code],
          [b.term_code, b.course_id, b.offering_number, b.campus_code],
        ),
      );
      sections.sort((a, b) =>
        compareKeys(
          [a.term_code, a.class_number],
          [b.term_code, b.class_number],
        ),
      );
      const coursesJson = JSON.stringify(courses);
      const sectionsJson = JSON.stringify(sections);
      await withPageTransaction(client, async () => {
        await client.query(
          `INSERT INTO osu_catalog.course_snapshots (term_code,course_id,offering_number,campus_code,subject,catalog_number,title,description,data,fetched_at,last_seen_run)
          SELECT x.*, $2::timestamptz, $3::uuid FROM jsonb_to_recordset($1::jsonb) AS x(term_code text,course_id text,offering_number text,campus_code text,subject text,catalog_number text,title text,description text,data jsonb)
          ON CONFLICT (last_seen_run,term_code,course_id,offering_number,campus_code) DO UPDATE SET subject=EXCLUDED.subject,catalog_number=EXCLUDED.catalog_number,title=EXCLUDED.title,description=EXCLUDED.description,data=EXCLUDED.data,fetched_at=EXCLUDED.fetched_at,last_seen_run=EXCLUDED.last_seen_run`,
          [coursesJson, fetchedAt, runId],
        );
        await client.query(
          `INSERT INTO osu_catalog.section_snapshots (term_code,class_number,course_id,offering_number,campus_code,subject,catalog_number,data,fetched_at,last_seen_run)
          SELECT x.*, $2::timestamptz, $3::uuid FROM jsonb_to_recordset($1::jsonb) AS x(term_code text,class_number text,course_id text,offering_number text,campus_code text,subject text,catalog_number text,data jsonb)
          ON CONFLICT (last_seen_run,term_code,class_number) DO UPDATE SET course_id=EXCLUDED.course_id,offering_number=EXCLUDED.offering_number,campus_code=EXCLUDED.campus_code,subject=EXCLUDED.subject,catalog_number=EXCLUDED.catalog_number,data=EXCLUDED.data,fetched_at=EXCLUDED.fetched_at,last_seen_run=EXCLUDED.last_seen_run`,
          [sectionsJson, fetchedAt, runId],
        );
        await client.query(
          "UPDATE osu_catalog.sync_partitions SET next_page=$3,complete=$4,fetched_sections=fetched_sections+$5 WHERE run_id=$1 AND partition_key=$2",
          [
            runId,
            partition.partition_key,
            page + 1,
            page >= data.totalPages,
            sectionCount,
          ],
        );
      });
      pagesProcessed++;
      console.log(
        `${partition.partition_key} page ${page}/${data.totalPages}: ${sectionCount} sections`,
      );
      if (page >= data.totalPages) break;
      await sleep(100);
    }
  }
  const count = Number(
    (
      await client.query(
        "SELECT count(*) AS n FROM osu_catalog.section_snapshots WHERE last_seen_run=$1",
        [runId],
      )
    ).rows[0].n,
  );
  if (limited) {
    console.log(
      `Checkpoint saved: ${count} sections so far. Run the same command again without --max-pages to continue.`,
    );
  } else {
    const remaining = Number(
      (
        await client.query(
          "SELECT count(*) AS n FROM osu_catalog.sync_partitions WHERE run_id=$1 AND NOT complete",
          [runId],
        )
      ).rows[0].n,
    );
    if (remaining)
      throw new Error(`${remaining} partitions remain incomplete.`);
    const audit = (
      await client.query(
        "SELECT COALESCE(sum(expected_sections),0)::int AS expected, COALESCE(sum(fetched_sections),0)::int AS fetched, count(*) FILTER (WHERE expected_sections<>fetched_sections)::int AS mismatched FROM osu_catalog.sync_partitions WHERE run_id=$1",
        [runId],
      )
    ).rows[0];
    if (
      audit.expected !== expectedTotal ||
      audit.fetched !== expectedTotal ||
      audit.mismatched
    )
      throw new Error(
        `Coverage check failed: official ${expectedTotal}, partition expectation ${audit.expected}, fetched ${audit.fetched}, mismatched partitions ${audit.mismatched}. Start a new run if the official index changed.`,
      );
    await publishCatalogSnapshot(client, runId, expectedTotal, count);
    console.log(
      `Complete: ${audit.fetched} official hits reconciled exactly, ${count} distinct sections (${audit.fetched - count} duplicate hits); run ${runId}`,
    );
  }
} catch (error) {
  if (runId)
    await client
      .query(
        "UPDATE osu_catalog.sync_runs SET status='failed',error=$2 WHERE id=$1",
        [runId, String(error.message).slice(0, 1000)],
      )
      .catch(() => {});
  console.error(`Catalog sync failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (locked)
    await client
      .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
      .catch(() => {});
  await client.end().catch(() => {});
}

function compareKeys(left, right) {
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}
