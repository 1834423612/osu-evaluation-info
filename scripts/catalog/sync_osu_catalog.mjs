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
} from "./upstream.mjs";
import { discoverPlan, samePlan } from "./plan.mjs";
import { selectRun } from "./checkpoints.mjs";
import { preparePage } from "./rows.mjs";
import { writePage } from "./writer.mjs";
import { publishCatalogSnapshot } from "./snapshots.mjs";

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
  const deadline = Date.now() + 45 * 60 * 1000;
  const signal = AbortSignal.timeout(45 * 60 * 1000);
  const search = (query) => searchOfficial(query, { signal });
  let processed = 0;
  let stopping = false;
  const stop = () => {
    stopping = true;
  };
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    if (client) {
      await client.connect();
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
      await requireCatalogSchema(client);
    }
    const available = searchableTerms(
      await fetchOfficialJson("searchableTermsV2", { signal }),
    );
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
        const plan = await discoverPlan(terms, available, search);
        runId = await selectRun(
          client,
          termCodes,
          plan,
          args.includes("--new-run") || attempt > 0,
        );
        const partitions = (
          await client.query(
            "SELECT * FROM osu_catalog.sync_partitions WHERE run_id=$1 AND NOT complete ORDER BY partition_key",
            [runId],
          )
        ).rows;
        for (const partition of partitions) {
          for (let page = partition.next_page; ; page++) {
            if (processed >= maxPages || stopping || Date.now() >= deadline) {
              console.log(
                `Checkpoint saved for run ${runId}; remaining work will resume on the next invocation.`,
              );
              if (stopping) process.exitCode = 1;
              return;
            }
            const data = await search({
              ...partition.query,
              p: String(page),
            });
            const prepared = preparePage(data, partition, page);
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
        const count = Number(
          (
            await client.query(
              "SELECT count(*) AS n FROM osu_catalog.section_snapshots WHERE last_seen_run=$1",
              [runId],
            )
          ).rows[0].n,
        );
        await publishCatalogSnapshot(client, runId, plan.expectedTotal, count);
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
                `${error.code ?? "ERROR"}: ${error.message}`.slice(0, 1000),
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
    `Catalog sync failed (${error.code ?? "configuration"}): ${error.message}`,
  );
  process.exitCode = 1;
});
