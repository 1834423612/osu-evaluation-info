import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import { anonymousSyllabusFetch } from "../../src/lib/syllabus/anonymous-fetch.ts";
import { SyllabusError } from "../../src/lib/syllabus/normalize.ts";
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
} from "./store.mjs";

export function parseSyncOptions(args) {
  const options = {
    discoverOnly: false,
    indexOnly: false,
    newRun: false,
    delayMs: 350,
    maxDocuments: Infinity,
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--discover-only") options.discoverOnly = true;
    else if (arg === "--index-only") options.indexOnly = true;
    else if (arg === "--new-run") options.newRun = true;
    else if (arg === "--delay-ms" || arg === "--max-documents") {
      const value = Number(args[++i]);
      if (
        !Number.isSafeInteger(value) ||
        value < (arg === "--delay-ms" ? 200 : 1)
      )
        throw new Error(`Invalid ${arg}`);
      options[arg === "--delay-ms" ? "delayMs" : "maxDocuments"] = value;
    } else throw new Error(`Unknown argument ${arg}`);
  }
  return options;
}

/** Sequential, paced anonymous requests; only transient errors are retried. */
function pacedFetch(delayMs) {
  return async (url, init) => {
    for (let attempt = 0; ; attempt++) {
      await delay(delayMs);
      let response;
      try {
        response = await anonymousSyllabusFetch(url, init);
      } catch (error) {
        if (init.signal?.aborted || attempt >= 2) throw error;
        await delay(1000 * 2 ** attempt);
        continue;
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt >= 2)
        return response;
      const retry = Number(response.headers.get("retry-after"));
      await response.body?.cancel();
      await delay(
        Math.min(
          60_000,
          Math.max(
            1000 * 2 ** attempt,
            Number.isFinite(retry) ? retry * 1000 : 0,
          ),
        ),
      );
    }
  };
}

export async function syncSyllabus(options) {
  const fetcher = pacedFetch(options.delayMs);
  const discovered = await discoverSyllabusTerms(fetcher);
  if (options.discoverOnly) {
    console.log(JSON.stringify(discovered, null, 2));
    return;
  }
  loadCatalogEnvironment();
  const client = createCatalogClient("osu-syllabus-sync");
  let locked = false,
    runId;
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
          "SELECT 1 FROM osu_syllabus.schema_versions WHERE version=1",
        )
      ).rowCount
    )
      throw new Error("Run pnpm syllabus:migrate before synchronization.");
    await saveTerms(client, discovered);
    let run = options.newRun
      ? null
      : (
          await client.query(
            "SELECT id,terms FROM osu_syllabus.sync_runs WHERE status IN ('running','partial') ORDER BY started_at DESC LIMIT 1",
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
      if (partition.published_at) continue;
      try {
        for (let page = partition.next_page; page <= 2000; page++) {
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
    let processed = 0,
      failures = 0;
    await client.query(
      "UPDATE osu_syllabus.entry_observations SET document_status=NULL WHERE run_id=$1 AND document_status='failed'",
      [runId],
    );
    // Keyset batches bound memory; saved checkpoints survive interruption.
    for (;;) {
      const batch = (
        await client.query(
          "SELECT o.code,o.data FROM osu_syllabus.entry_observations o JOIN osu_syllabus.sync_partitions p USING(run_id,term_id) WHERE o.run_id=$1 AND p.published_at IS NOT NULL AND o.document_status IS NULL ORDER BY o.code LIMIT 50",
          [runId],
        )
      ).rows;
      if (!batch.length) break;
      for (const row of batch) {
        if (processed >= options.maxDocuments) {
          await client.query(
            "UPDATE osu_syllabus.sync_runs SET status='partial' WHERE id=$1",
            [runId],
          );
          console.log(`Paused after ${processed} documents; rerun to resume.`);
          return;
        }
        let status = "saved";
        try {
          const document = await readSyllabusDocument(row.code, fetcher);
          if (!document.components.length && !document.entry.hasUploads)
            throw new Error("Published syllabus has no readable content.");
          await saveDocument(client, document);
          if (document.entry.hasUploads) status = "uploaded";
        } catch (error) {
          status =
            error instanceof SyllabusError &&
            ["restricted", "missing"].includes(error.kind)
              ? error.kind
              : "failed";
          if (status === "failed") failures++;
        }
        await client.query(
          "UPDATE osu_syllabus.entry_observations SET document_status=$3 WHERE run_id=$1 AND code=$2",
          [runId, row.code, status],
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
        "SELECT document_status,count(*)::int AS count FROM osu_syllabus.entry_observations WHERE run_id=$1 GROUP BY document_status",
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
    console.log(JSON.stringify({ runId, status: "complete", counts }));
  } catch (error) {
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
      "Usage: pnpm syllabus:sync [--discover-only] [--index-only] [--new-run] [--delay-ms 350] [--max-documents N]\nExplicit migration required. Daily sync archives anonymous official responses only; never reuses HAR credentials.",
    );
  else {
    try {
      await syncSyllabus(parseSyncOptions(process.argv.slice(2)));
    } catch (error) {
      console.error(`Syllabus sync failed: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
