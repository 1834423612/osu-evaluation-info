import { randomUUID } from "node:crypto";
import { withPageTransaction } from "./database.mjs";
import { samePlan } from "./plan.mjs";

const MAX_CHECKPOINT_AGE_MS = 6 * 60 * 60 * 1000;

/** Select only a recent, structurally compatible and intact staging generation. */
export async function selectRun(client, terms, plan, forceNew = false) {
  const previous = (
    await client.query(
      `SELECT r.* FROM osu_catalog.sync_runs r JOIN osu_catalog.snapshot_versions v ON v.run_id=r.id
     WHERE v.published_at IS NULL AND r.status IN ('running','failed') AND r.terms=$1::jsonb
     ORDER BY r.started_at DESC,r.id DESC LIMIT 1`,
      [JSON.stringify(terms)],
    )
  ).rows[0];
  let reusable = false;
  if (previous && !forceNew) {
    const saved = (
      await client.query(
        "SELECT * FROM osu_catalog.sync_partitions WHERE run_id=$1 ORDER BY partition_key",
        [previous.id],
      )
    ).rows;
    const age = Date.now() - new Date(previous.started_at).getTime();
    reusable =
      age >= 0 &&
      age < MAX_CHECKPOINT_AGE_MS &&
      previous.expected_sections === plan.expectedTotal &&
      !/^CATALOG_(?:DATA_INVALID|IDENTITY_CONFLICT|INDEX_CHANGED|CHECKPOINT_INVALID)/.test(
        previous.error ?? "",
      ) &&
      samePlan(saved, plan.partitions) &&
      saved.every(
        (p) =>
          p.next_page >= 1 &&
          p.fetched_sections >= 0 &&
          p.fetched_sections <= p.expected_sections &&
          (!p.complete || p.fetched_sections === p.expected_sections),
      );
    if (reusable) {
      const invalid = (
        await client.query(
          `SELECT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c WHERE c.last_seen_run=$1
           AND (c.offering_number !~ '^[0-9]+$' OR c.course_id !~ '^[0-9]+$' OR c.campus_code=''))
         OR EXISTS(SELECT 1 FROM osu_catalog.section_snapshots s WHERE s.last_seen_run=$1
           AND (s.class_number !~ '^[0-9]+$' OR NOT EXISTS(SELECT 1 FROM osu_catalog.course_snapshots c
             WHERE c.last_seen_run=s.last_seen_run AND c.term_code=s.term_code AND c.course_id=s.course_id
               AND c.offering_number=s.offering_number AND c.campus_code=s.campus_code
               AND c.subject=s.subject AND c.catalog_number=s.catalog_number))) AS invalid`,
          [previous.id],
        )
      ).rows[0].invalid;
      reusable = !invalid;
    }
  }
  if (reusable) {
    await client.query(
      "UPDATE osu_catalog.sync_runs SET status='running',error=NULL WHERE id=$1",
      [previous.id],
    );
    console.log(`Resuming run ${previous.id}`);
    return previous.id;
  }
  const next = randomUUID();
  await withPageTransaction(client, async () => {
    if (previous)
      await client.query(
        "UPDATE osu_catalog.sync_runs SET status='failed',error=$2 WHERE id=$1",
        [
          previous.id,
          "CATALOG_CHECKPOINT_INVALID: superseded by a fresh validated partition plan.",
        ],
      );
    await client.query(
      "INSERT INTO osu_catalog.sync_runs(id,status,terms,expected_sections) VALUES($1,'running',$2::jsonb,$3)",
      [next, JSON.stringify(terms), plan.expectedTotal],
    );
    await client.query(
      "INSERT INTO osu_catalog.snapshot_versions(run_id) VALUES($1)",
      [next],
    );
    await client.query(
      `INSERT INTO osu_catalog.sync_partitions(run_id,partition_key,query,expected_sections)
       SELECT $1,x.* FROM jsonb_to_recordset($2::jsonb) AS x(partition_key text,query jsonb,expected_sections integer)`,
      [next, JSON.stringify(plan.partitions)],
    );
  });
  console.log(
    `${previous ? `Discarded stale run ${previous.id}; started` : "Started"} run ${next}`,
  );
  return next;
}
