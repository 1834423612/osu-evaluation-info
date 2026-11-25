#!/usr/bin/env node
/** Explicit, bounded source inspection. Optional archive access is transactionally read-only. */
import {
  actualCount,
  catalogError,
  officialRequestContext,
  officialSearchPath,
  searchOfficial,
} from "./upstream.mjs";
import { preparePage } from "./rows.mjs";
import { catalogFailure, compareSectionIdentities } from "./diagnostics.mjs";
import { createCatalogClient, loadCatalogEnvironment } from "./database.mjs";
import { FIND_CATALOG_SNAPSHOT_SQL } from "../../src/lib/catalog/snapshot-policy.ts";

const context = { stage: "configuration" };
async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/catalog/inspect-official.mjs --term 1272 --subject airsci [--campus col] [--compare-archive]\nValidates every page of one subject (below 10,000 hits). Optional archive comparison uses DATABASE_URL in a READ ONLY transaction. No snapshots or checkpoints are written.",
    );
    return;
  }
  const values = new Map();
  let compare = false;
  for (let i = 0; i < args.length; i++) {
    const name = args[i];
    if (name === "--compare-archive") {
      compare = true;
      continue;
    }
    const value = args[++i];
    if (
      !["--term", "--subject", "--campus"].includes(name) ||
      !value ||
      value.startsWith("--") ||
      values.has(name)
    )
      throw catalogError(`Invalid inspection argument: ${name}.`);
    values.set(name, value);
  }
  const term = values.get("--term"),
    subject = values.get("--subject")?.toLowerCase();
  const campus = values.get("--campus")?.toLowerCase();
  if (
    !/^\d{4}$/.test(term ?? "") ||
    !/^[a-z0-9.-]{1,32}$/.test(subject ?? "") ||
    (campus && !/^[a-z0-9_-]{1,32}$/.test(campus))
  )
    throw catalogError(
      "A four-digit --term and a valid --subject are required; --campus must be a campus code.",
    );
  const query = { term, subject, ...(campus ? { campus } : {}) };
  const sections = new Map(),
    resolutions = [];
  const signal = AbortSignal.timeout(120_000);
  let expected,
    hits = 0,
    pages = 0;
  for (let page = 1; ; page++) {
    const request = { ...query, p: String(page) };
    Object.assign(
      context,
      { stage: "official-inspection", page },
      officialRequestContext(officialSearchPath(request)),
    );
    context.operation = "official-request";
    const data = await searchOfficial(request, { signal });
    expected ??= actualCount(data);
    if (!expected) {
      if (page !== 1 || !Array.isArray(data.courses) || data.courses.length)
        throw catalogError(
          "Empty official count disagrees with the returned page.",
        );
      break;
    }
    if (expected >= 10_000)
      throw catalogError(
        "Inspection requires a subject/campus below the official 10,000-hit cap.",
      );
    context.operation = "page-validation";
    const prepared = preparePage(
      data,
      {
        query,
        partition_key: new URLSearchParams(query).toString(),
        expected_sections: expected,
      },
      page,
    );
    for (const row of prepared.sections) {
      const identity = Object.fromEntries(
        [
          "term_code",
          "class_number",
          "course_id",
          "offering_number",
          "campus_code",
          "subject",
          "catalog_number",
        ].map((key) => [key, row[key]]),
      );
      const previous = sections.get(row.class_number);
      if (previous && JSON.stringify(previous) !== JSON.stringify(identity))
        throw catalogError(
          "Conflicting section identities across inspected pages.",
          "CATALOG_IDENTITY_CONFLICT",
        );
      sections.set(row.class_number, identity);
    }
    resolutions.push(
      ...prepared.identityResolutions.map((row) => ({ page, ...row })),
    );
    hits += prepared.sectionCount;
    pages++;
    if (page === prepared.totalPages) break;
  }
  if (hits !== expected)
    throw catalogError(
      `Inspected ${hits} hits; official count is ${expected}.`,
      "CATALOG_INDEX_CHANGED",
    );
  const result = {
    event: "catalog.inspection_complete",
    checkedAt: new Date().toISOString(),
    query,
    requestUrl: context.requestUrl,
    pages,
    officialHits: hits,
    distinctSections: sections.size,
    identityResolutions: resolutions,
  };
  if (compare) {
    context.stage = "archive-comparison";
    context.operation = "readonly-database-query";
    loadCatalogEnvironment();
    const db = createCatalogClient("osu-catalog-readonly-inspection");
    try {
      await db.connect();
      await db.query(
        "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      const baseline = (await db.query(FIND_CATALOG_SNAPSHOT_SQL, [term, null]))
        .rows[0];
      if (!baseline)
        result.archive = {
          available: false,
          reason: "No accepted publication for this term.",
        };
      else {
        const archived = (
          await db.query(
            `SELECT s.term_code,s.class_number,s.course_id,s.offering_number,s.campus_code,s.subject,s.catalog_number,
          (c.course_id IS NOT NULL AND c.subject=s.subject AND c.catalog_number=s.catalog_number) AS parent_matched
          FROM osu_catalog.section_snapshots s LEFT JOIN osu_catalog.course_snapshots c
          ON c.last_seen_run=s.last_seen_run AND c.term_code=s.term_code AND c.course_id=s.course_id AND c.offering_number=s.offering_number AND c.campus_code=s.campus_code
          WHERE s.last_seen_run=$1 AND s.term_code=$2 AND ((lower(s.subject)=$3 AND ($5::text IS NULL OR lower(s.campus_code)=$5)) OR s.class_number=ANY($4::text[]))`,
            [baseline.id, term, subject, [...sections.keys()], campus ?? null],
          )
        ).rows;
        result.archive = {
          available: true,
          readOnly: true,
          run: baseline.id,
          snapshotAt: baseline.completed_at,
          sections: archived.length,
          parentLinkFailures: archived.filter((row) => !row.parent_matched)
            .length,
          ...compareSectionIdentities([...sections.values()], archived),
        };
      }
      await db.query("ROLLBACK");
    } finally {
      await db.end();
    }
  }
  console.log(JSON.stringify(result));
}
main().catch((error) => {
  console.error(
    JSON.stringify(catalogFailure("catalog.inspection_failed", error, context)),
  );
  process.exitCode = 1;
});
