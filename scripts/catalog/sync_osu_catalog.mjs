#!/usr/bin/env node
/** Official OSU class search -> immutable, validated PostgreSQL generations. */
import { appendFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import {
  CATALOG_LOCK,
  createCatalogClient,
  loadCatalogEnvironment,
  requireCatalogSchema,
} from "./database.mjs";
import {
  fetchOfficialJson,
  searchOfficial,
  searchableTerms,
  actualCount,
  facet,
  catalogError,
  officialRequestContext,
  officialSearchPath,
} from "./upstream.mjs";
import { discoverPlan, samePlan } from "./plan.mjs";
import { selectRun } from "./checkpoints.mjs";
import { preparePage } from "./rows.mjs";
import { writePage } from "./writer.mjs";
import { prepareSearchGeneration } from "../search/prepare.mjs";
import { publishCatalogSnapshot } from "./snapshots.mjs";
import { assertCatalogCoverage } from "./coverage.mjs";
import { catalogFailure } from "./diagnostics.mjs";
const context = { stage: "configuration" };
function stage(name, details = {}) {
  for (const key of Object.keys(context)) delete context[key];
  Object.assign(context, { stage: name }, details);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: node scripts/catalog/sync_osu_catalog.mjs [--term 1272] [--new-run] [--max-pages N] [--discover-only]\nReads DATABASE_URL and .env.local. Default: every searchable term, all campuses. Resume only compatible checkpoints. --max-pages deliberately checkpoints a partial run.",
    );
    return;
  }
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    if (["--term", "--max-pages"].includes(args[i])) {
      const name = args[i],
        value = args[++i];
      if (!value || value.startsWith("--") || values.has(name))
        throw new Error(`Invalid ${name} argument.`);
      values.set(name, value);
    } else if (!["--new-run", "--discover-only"].includes(args[i]))
      throw new Error(`Unknown argument: ${args[i]}`);
  }
  const requestedTerm = values.get("--term");
  const maxPages = values.has("--max-pages")
    ? Number(values.get("--max-pages"))
    : Infinity;
  if (requestedTerm && !/^\d{4}$/.test(requestedTerm))
    throw new Error("--term must be a four-digit term code.");
  if (
    values.has("--max-pages") &&
    (!Number.isSafeInteger(maxPages) || maxPages < 1)
  )
    throw new Error("--max-pages must be a positive integer.");
  loadCatalogEnvironment();
  const client = args.includes("--discover-only")
    ? null
    : createCatalogClient("osu-catalog-sync");
  let locked = false,
    runId;
  const deadline = Date.now() + 20 * 60 * 1000;
  const signal = AbortSignal.timeout(20 * 60 * 1000);
  const search = (query) => {
    for (const key of [
      "term",
      "subject",
      "campus",
      "p",
      "component",
      "catalog-number",
      "academic-career",
    ])
      delete context[key];
    Object.assign(context, officialRequestContext(officialSearchPath(query)), {
      operation: "official-request",
    });
    return searchOfficial(query, { signal });
  };
  let processed = 0;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (client) {
      stage("database-connection");
      await client.connect();
      stage("database-lock");
      locked = (
        await client.query("SELECT pg_try_advisory_lock($1) AS locked", [
          CATALOG_LOCK,
        ])
      ).rows[0].locked;
      if (!locked) {
        console.log(
          "Another catalog maintenance task is running; synchronization skipped.",
        );
        return;
      }
      stage("database-schema");
      await requireCatalogSchema(client);
    }
    stage("term-discovery", officialRequestContext("searchableTermsV2"));
    const available = searchableTerms(
      await fetchOfficialJson("searchableTermsV2", { signal }),
    );
    const discovery = {
      terms: available.map((term) => term.strm),
      checkedAt: new Date().toISOString(),
    };
    const terms = available.filter(
      (t) => !requestedTerm || requestedTerm === t.strm,
    );
    if (!terms.length)
      throw new Error("The requested term is not currently searchable.");
    if (!client) {
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
      return;
    }
    const termCodes = terms.map((t) => t.strm).sort();
    // At most one automatic restart when the live index moves during traversal.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        stage("partition-discovery");
        const plan = await discoverPlan(terms, available, search);
        stage("checkpoint-selection");
        runId = await selectRun(
          client,
          termCodes,
          plan,
          args.includes("--new-run") || attempt > 0,
        );
        context.run = runId;
        const partitions = (
          await client.query(
            "SELECT * FROM osu_catalog.sync_partitions WHERE run_id=$1 AND NOT complete ORDER BY partition_key",
            [runId],
          )
        ).rows;
        stage("snapshot-ingestion", { run: runId });
        for (const partition of partitions) {
          for (let page = partition.next_page; ; page++) {
            if (processed >= maxPages || stopping || Date.now() >= deadline) {
              console.log(
                `Checkpoint saved for run ${runId}; remaining work will resume on the next invocation.`,
              );
              if (stopping) process.exitCode = 1;
              return;
            }
            stage("snapshot-ingestion", {
              run: runId,
              partition: partition.partition_key,
              page,
              expectedSections: partition.expected_sections,
            });
            const data = await search({
              ...partition.query,
              p: String(page),
            });
            context.operation = "page-validation";
            const prepared = preparePage(data, partition, page);
            for (const resolution of prepared.identityResolutions)
              console.warn(
                JSON.stringify({
                  event: "catalog.parent_identity_reconciled",
                  ...context,
                  ...resolution,
                }),
              );
            context.operation = "page-write";
            await writePage(client, runId, partition, page, prepared);
            processed++;
            console.log(
              `${partition.partition_key} page ${page}/${prepared.totalPages}: ${prepared.sectionCount} sections`,
            );
            if (page === prepared.totalPages) break;
            await delay(100);
          }
        }
        if (stopping || Date.now() >= deadline) {
          console.log(
            `Checkpoint saved for run ${runId}; publication deferred.`,
          );
          if (stopping) process.exitCode = 1;
          return;
        }
        stage("final-plan-validation", { run: runId });
        const finalPlan = await discoverPlan(terms, available, search);
        if (!samePlan(plan.partitions, finalPlan.partitions))
          throw catalogError(
            "Official partition coverage changed before publication.",
            "CATALOG_INDEX_CHANGED",
          );
        if (stopping) {
          console.log(
            `Checkpoint saved for run ${runId}; publication deferred.`,
          );
          process.exitCode = 1;
          return;
        }
        stage("snapshot-reconciliation", { run: runId });
        const count = Number(
          (
            await client.query(
              "SELECT count(*) AS n FROM osu_catalog.section_snapshots WHERE last_seen_run=$1",
              [runId],
            )
          ).rows[0].n,
        );
        stage("coverage-validation", { run: runId });
        await assertCatalogCoverage(client, runId);
        // Keep the old publication visible until every term has a complete index.
        // A failed preparation cannot expose a new generation to visitors.
        const searchTerms = terms.map((term) => ({
          code: term.strm,
          label: term.descr,
        }));
        for (const term of termCodes) {
          stage("search-preparation", { run: runId, term });
          await prepareSearchGeneration(client, {
            run: runId,
            term,
            terms: searchTerms,
            snapshotAt: new Date().toISOString(),
          });
        }
        stage("publication", { run: runId });
        await publishCatalogSnapshot(
          client,
          runId,
          plan.expectedTotal,
          count,
          discovery,
        );
        console.log(
          `Complete: ${plan.expectedTotal} official hits reconciled exactly, ${count} distinct sections (${plan.expectedTotal - count} duplicate hits); run ${runId}`,
        );
        if (process.env.GITHUB_STEP_SUMMARY)
          await appendFile(
            process.env.GITHUB_STEP_SUMMARY,
            `Catalog published: ${count} distinct sections from ${plan.expectedTotal} official hits. Run: ${runId}.\n`,
          ).catch(() => {});
        return;
      } catch (error) {
        if (runId)
          await client
            .query(
              "UPDATE osu_catalog.sync_runs SET status='failed',error=$2 WHERE id=$1 AND status<>'complete'",
              [
                runId,
                `${error.code ?? "ERROR"}: ${JSON.stringify(catalogFailure("catalog.sync_failed", error, context))}`.slice(
                  0,
                  6000,
                ),
              ],
            )
            .catch(() => {});
        runId = undefined;
        if (
          error.code !== "CATALOG_INDEX_CHANGED" ||
          attempt === 1 ||
          stopping ||
          Date.now() >= deadline
        )
          throw error;
        console.warn(
          "Official index changed; rebuilding once from a fresh validated plan.",
        );
      }
    }
  } finally {
    process.removeListener("SIGTERM", stop);
    process.removeListener("SIGINT", stop);
    if (locked)
      await client
        .query("SELECT pg_advisory_unlock($1)", [CATALOG_LOCK])
        .catch(() => {});
    await client?.end().catch(() => {});
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(catalogFailure("catalog.sync_failed", error, context)),
  );
  process.exitCode = 1;
});
