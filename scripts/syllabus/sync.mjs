import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import { anonymousSyllabusFetch } from "../../src/lib/syllabus/anonymous-fetch.ts";
import { markFreshDocuments, recordDocumentCheck } from "./refresh.mjs";
import { SyllabusError } from "../../src/lib/syllabus/normalize.ts";
import { syllabusBudget, SyllabusBudgetReached } from "./budget.mjs";
import {
  discoverSyllabusTerms,
  readSyllabusDocument,
  readSyllabusPage,
} from "../../src/lib/syllabus/upstream.ts";
import {
  saveDocument,
  savePage,
  saveTerms,
  SyllabusIndexChangedError,
  termIsAvailableForSync,
  extendRunTerms,
} from "./store.mjs";

export function parseSyncOptions(args) {
  const options = {
    discoverOnly: false,
    indexOnly: false,
    newRun: false,
    delayMs: 350,
    maxDocuments: Infinity,
    maxRuntimeSeconds: 0,
    refreshHours: 24,
    archiveRefreshHours: 720,
    missingRefreshHours: 24,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--discover-only") options.discoverOnly = true;
    else if (arg === "--index-only") options.indexOnly = true;
    else if (arg === "--new-run") options.newRun = true;
    else if (
      [
        "--delay-ms",
        "--max-documents",
        "--max-runtime-seconds",
        "--refresh-hours",
        "--archive-refresh-hours",
        "--missing-refresh-hours",
      ].includes(arg)
    ) {
      const value = Number(args[++i]),
        key = {
          "--delay-ms": "delayMs",
          "--max-documents": "maxDocuments",
          "--max-runtime-seconds": "maxRuntimeSeconds",
          "--refresh-hours": "refreshHours",
          "--archive-refresh-hours": "archiveRefreshHours",
          "--missing-refresh-hours": "missingRefreshHours",
        }[arg];
      if (
        !Number.isSafeInteger(value) ||
        value <
          (arg === "--delay-ms" ? 200 : arg === "--max-documents" ? 1 : 0) ||
        (arg.endsWith("hours") && value > 87600) ||
        (arg === "--max-runtime-seconds" && value > 86400)
      )
        throw Error("Invalid " + arg);
      options[key] = value;
    } else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

/** Sequential, paced anonymous requests; only transient errors are retried. */
export function pacedFetch(
  delayMs,
  budget = syllabusBudget(),
  { sleep = delay, fetcher = anonymousSyllabusFetch } = {},
) {
  return async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      await budget.wait(delayMs, sleep);
      let response;
      try {
        response = await fetcher(url, {
          ...init,
          signal: budget.signal(init?.signal),
        });
      } catch (error) {
        budget.check();
        if (init.signal?.aborted || attempt >= 2) throw error;
        await budget.wait(1000 * 2 ** attempt, sleep);
        continue;
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 2)
        return response;
      const retry = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await budget.wait(
        Math.min(
          60_000,
          Math.max(
            1000 * 2 ** attempt,
            Number.isFinite(retry) ? retry * 1000 : 0,
          ),
        ),
        sleep,
      );
    }
  };
}

export async function syncSyllabus(
  options,
  {
    createClient = createCatalogClient,
    fetcher: providedFetcher,
    budget: providedBudget,
  } = {},
) {
  const budget = providedBudget ?? syllabusBudget(options.maxRuntimeSeconds);
  const fetcher = providedFetcher ?? pacedFetch(options.delayMs, budget);
  const discovered = await discoverSyllabusTerms(fetcher);
  if (options.discoverOnly) {
    console.log(JSON.stringify(discovered, null, 2));
    return;
  }
  loadCatalogEnvironment();
  const client = createClient("osu-syllabus-sync");
  let locked = false,
    runId,
    processed = 0,
    reused = 0,
    failures = 0;
  try {
    await client.connect();
    locked = (
      await client.query("SELECT pg_try_advisory_lock(674120205) AS locked")
    ).rows[0].locked;
    if (!locked)
      throw new Error("Another syllabus maintenance task is running.");
    const installed = await client.query(
      "SELECT to_regclass('osu_syllabus.schema_versions') AS installed",
    );
    if (
      !installed.rows[0].installed ||
      !(
        await client.query(
          "SELECT 1 FROM osu_syllabus.schema_versions WHERE version=5",
        )
      ).rowCount
    )
      throw new Error("Run pnpm syllabus:migrate before synchronization.");
    await saveTerms(client, discovered);
    let run = options.newRun
      ? null
      : (
          await client.query(
            "SELECT r.id,r.terms FROM osu_syllabus.sync_runs r WHERE r.status IN ('running','partial') AND EXISTS(SELECT 1 FROM osu_syllabus.sync_partitions p WHERE p.run_id=r.id AND p.published_at IS NULL AND p.unavailable_at IS NULL) ORDER BY r.started_at DESC LIMIT 1",
          )
        ).rows[0];
    if (!run) {
      // Previously published terms remain eligible after current changes or upstream hides them.
      const previous = (
        await client.query(
          "SELECT data FROM osu_syllabus.terms WHERE ever_published AND code IS NOT NULL",
        )
      ).rows.map((row) => row.data);
      const eligible = [
        ...new Map(
          [
            ...previous,
            ...discovered.filter((term) => term.published && term.code),
          ].map((term) => [term.id, term]),
        ).values(),
      ];
      if (!eligible.length)
        throw new Error("No published syllabus terms were discovered.");
      run = { id: randomUUID(), terms: eligible };
      await client.query("BEGIN");
      try {
        await client.query(
          "INSERT INTO osu_syllabus.sync_runs(id,status,terms) VALUES($1,'running',$2)",
          [run.id, JSON.stringify(eligible)],
        );
        for (const term of eligible)
          await client.query(
            "INSERT INTO osu_syllabus.sync_partitions(run_id,term_id) VALUES($1,$2)",
            [run.id, term.id],
          );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    run = await extendRunTerms(client, run, discovered);
    runId = run.id;
    await client.query(
      "UPDATE osu_syllabus.sync_runs SET status='running',error=NULL WHERE id=$1",
      [runId],
    );
    for (const term of run.terms) {
      let partition = (
        await client.query(
          "SELECT * FROM osu_syllabus.sync_partitions WHERE run_id=$1 AND term_id=$2",
          [runId, term.id],
        )
      ).rows[0];
      if (!termIsAvailableForSync(term, discovered)) {
        await client.query(
          "UPDATE osu_syllabus.sync_partitions SET unavailable_at=now() WHERE run_id=$1 AND term_id=$2",
          [runId, term.id],
        );
        console.log(
          `${term.name}: no longer published in official discovery; retained the last complete archive.`,
        );
        continue;
      }
      await client.query(
        "UPDATE osu_syllabus.sync_partitions SET unavailable_at=NULL WHERE run_id=$1 AND term_id=$2",
        [runId, term.id],
      );
      if (partition.published_at) continue;
      try {
        for (let page = partition.next_page; page <= 2000; page++) {
          budget.check();
          const result = await readSyllabusPage(term, page, undefined, fetcher);
          await savePage(client, runId, term, page, result);
          console.log(
            `${term.name}: page ${page + 1}, ${result.total} indexed syllabi expected.`,
          );
          if (!result.hasMore) break;
          if (page === 2000) throw new Error("Syllabus page limit reached.");
        }
      } catch (error) {
        // An expired historic term must not block discovery of a new current term.
        if (
          error instanceof SyllabusError &&
          ["restricted", "missing"].includes(error.kind)
        ) {
          await client.query(
            "UPDATE osu_syllabus.sync_partitions SET unavailable_at=now() WHERE run_id=$1 AND term_id=$2",
            [runId, term.id],
          );
          console.log(
            `${term.name}: official term unavailable; retained existing archive.`,
          );
          continue;
        }
        if (
          error instanceof SyllabusIndexChangedError ||
          error.code === "23505"
        )
          await client.query(
            "UPDATE osu_syllabus.sync_runs SET status='failed' WHERE id=$1",
            [runId],
          );
        throw error;
      }
    }
    if (options.indexOnly) {
      await client.query(
        "UPDATE osu_syllabus.sync_runs SET status='partial' WHERE id=$1",
        [runId],
      );
      console.log("Index published. Document archival remains pending.");
      return;
    }
    reused = await markFreshDocuments(
      client,
      runId,
      run.terms.filter((term) => termIsAvailableForSync(term, discovered)),
      options,
    );
    console.log(JSON.stringify({ runId, reusedChecks: reused }));
    let consecutiveFailures = 0;
    await client.query(
      "UPDATE osu_syllabus.entry_observations SET document_status=NULL WHERE run_id=$1 AND document_status='failed'",
      [runId],
    );
    // Keyset batches bound memory; saved checkpoints survive interruption.
    for (;;) {
      const batch = (
        await client.query(
          "SELECT o.code,o.data FROM osu_syllabus.entry_observations o JOIN osu_syllabus.sync_partitions p USING(run_id,term_id) JOIN osu_syllabus.terms t ON t.id=o.term_id LEFT JOIN osu_syllabus.document_checks c ON c.code=o.code WHERE o.run_id=$1 AND p.published_at IS NOT NULL AND p.unavailable_at IS NULL AND o.document_status IS NULL ORDER BY (c.code IS NULL) DESC,t.code DESC,c.checked_at ASC NULLS FIRST,o.code LIMIT 50",
          [runId],
        )
      ).rows;
      if (!batch.length) break;
      for (const row of batch) {
        budget.check();
        if (processed >= options.maxDocuments) {
          await client.query(
            "UPDATE osu_syllabus.sync_runs SET status='partial' WHERE id=$1",
            [runId],
          );
          console.log(
            JSON.stringify({
              runId,
              status: "partial",
              reason: "document-budget",
              processed,
              reusedChecks: reused,
            }),
          );
          return;
        }
        let status = "saved";
        try {
          const document = await readSyllabusDocument(row.code, fetcher);
          if (
            document.entry.entityId !== row.data.entityId ||
            document.entry.termId !== row.data.termId
          )
            throw Error("Syllabus document identity changed");
          if (!document.components.length && !document.entry.hasUploads)
            status = "missing";
          else {
            await saveDocument(client, document);
            if (document.entry.hasUploads) status = "uploaded";
          }
        } catch (error) {
          if (error instanceof SyllabusBudgetReached) throw error;
          status =
            error instanceof SyllabusError &&
            ["restricted", "missing"].includes(error.kind)
              ? error.kind
              : "failed";
          if (status === "failed") failures++;
        }
        if (status !== "failed")
          await recordDocumentCheck(client, row.data, status);
        await client.query(
          "UPDATE osu_syllabus.entry_observations SET document_status=$3 WHERE run_id=$1 AND code=$2",
          [runId, row.code, status],
        );
        consecutiveFailures = status === "failed" ? consecutiveFailures + 1 : 0;
        if (consecutiveFailures >= 5)
          throw new Error(
            "Five consecutive document failures; stopped to preserve the archive and avoid a blocked crawl. Rerun to resume.",
          );
        processed++;
        if (processed % 50 === 0)
          console.log(
            `Archived/checked ${processed} documents; ${failures} transient failures.`,
          );
      }
    }
    const counts = (
      await client.query(
        "SELECT o.document_status,count(*)::int AS count FROM osu_syllabus.entry_observations o JOIN osu_syllabus.sync_partitions p USING(run_id,term_id) WHERE o.run_id=$1 AND p.unavailable_at IS NULL GROUP BY o.document_status",
        [runId],
      )
    ).rows;
    const failed = counts.some((row) => row.document_status === "failed");
    if (failed) {
      await client.query(
        "UPDATE osu_syllabus.entry_observations SET document_status=NULL WHERE run_id=$1 AND document_status='failed'",
        [runId],
      );
      await client.query(
        "UPDATE osu_syllabus.sync_runs SET status='partial',error='Some documents need retry' WHERE id=$1",
        [runId],
      );
      throw new Error(
        "Some documents need retry; previous versions remain readable.",
      );
    }
    await client.query(
      "UPDATE osu_syllabus.sync_runs SET status='complete',completed_at=now() WHERE id=$1",
      [runId],
    );
    console.log(
      JSON.stringify({
        runId,
        status: "complete",
        counts,
        networkDocuments: processed,
        reusedChecks: reused,
      }),
    );
  } catch (error) {
    if (error instanceof SyllabusBudgetReached) {
      if (runId)
        await client.query(
          "UPDATE osu_syllabus.sync_runs SET status='partial',error=NULL WHERE id=$1",
          [runId],
        );
      console.log(
        JSON.stringify({
          runId,
          status: "partial",
          reason: "runtime-budget",
          processed,
          reusedChecks: reused,
        }),
      );
      return;
    }
    if (runId)
      await client
        .query("UPDATE osu_syllabus.sync_runs SET error=$2 WHERE id=$1", [
          runId,
          "Synchronization interrupted; rerun to resume.",
        ])
        .catch(() => {});
    throw error;
  } finally {
    if (locked)
      await client
        .query("SELECT pg_advisory_unlock(674120205)")
        .catch(() => {});
    await client.end().catch(() => {});
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.includes("--help"))
    console.log(
      "Usage: pnpm syllabus:sync [--discover-only] [--index-only] [--new-run] [--delay-ms 350] [--max-documents N] [--max-runtime-seconds 0] [--refresh-hours 24] [--archive-refresh-hours 720] [--missing-refresh-hours 24]\nExplicit migration required. Sync archives anonymous official responses only; never reuses HAR credentials.",
    );
  else {
    try {
      await syncSyllabus(parseSyncOptions(process.argv.slice(2)));
    } catch (error) {
      if (error instanceof SyllabusBudgetReached)
        console.log(
          JSON.stringify({
            status: "partial",
            reason: "runtime-budget",
            checkpoint: false,
          }),
        );
      else {
        console.error(`Syllabus sync failed: ${error.message}`);
        process.exitCode = 1;
      }
    }
  }
}
