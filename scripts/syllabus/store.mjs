import { createHash } from "node:crypto";
import { cleanSyllabusHtml } from "../../src/lib/syllabus/content.ts";
import { cleanOfficialSyllabusHtml } from "../../src/lib/syllabus/official-render.ts";

export class SyllabusIndexChangedError extends Error {}

export async function saveTerms(client, terms) {
  if (!terms.length)
    throw new Error(
      "Empty official term discovery; existing archives retained.",
    );
  await client.query("BEGIN");
  try {
    for (const term of terms)
      await client.query(
        `INSERT INTO osu_syllabus.terms(id,code,name,data,ever_published) VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(id) DO UPDATE SET code=excluded.code,name=excluded.name,data=excluded.data,ever_published=osu_syllabus.terms.ever_published OR excluded.ever_published,checked_at=now()`,
        [term.id, term.code, term.name, JSON.stringify(term), term.published],
      );
    await client.query(
      "INSERT INTO osu_syllabus.term_discoveries(data) VALUES($1)",
      [JSON.stringify(terms)],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export function termIsAvailableForSync(term, discovered) {
  return discovered.some((item) => item.id === term.id && item.published);
}

export async function extendRunTerms(client, run, discovered) {
  await client.query("BEGIN");
  try {
    const saved = (
      await client.query(
        "SELECT terms FROM osu_syllabus.sync_runs WHERE id=$1 AND status IN ('running','partial') FOR UPDATE",
        [run.id],
      )
    ).rows[0];
    if (!saved) throw new Error("Syllabus checkpoint is no longer resumable.");
    const ids = new Set(saved.terms.map((term) => term.id));
    const additions = discovered.filter(
      (term) => term.published && term.code && !ids.has(term.id),
    );
    const terms = [...saved.terms, ...additions];
    for (const term of additions)
      await client.query(
        "INSERT INTO osu_syllabus.sync_partitions(run_id,term_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [run.id, term.id],
      );
    if (additions.length)
      await client.query(
        "UPDATE osu_syllabus.sync_runs SET terms=$2 WHERE id=$1",
        [run.id, JSON.stringify(terms)],
      );
    await client.query("COMMIT");
    return { ...run, terms };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function savePage(client, runId, term, page, result) {
  await client.query("BEGIN");
  try {
    const partition = (
      await client.query(
        "SELECT * FROM osu_syllabus.sync_partitions WHERE run_id=$1 AND term_id=$2 FOR UPDATE",
        [runId, term.id],
      )
    ).rows[0];
    if (
      partition.next_page !== page ||
      (partition.expected_count !== null &&
        (partition.expected_count !== result.total ||
          partition.page_size !== result.pageSize))
    )
      throw new SyllabusIndexChangedError(
        "Syllabus pagination changed; the previous publication is preserved.",
      );
    if (
      result.total === 0 &&
      (
        await client.query(
          "SELECT 1 FROM osu_syllabus.sync_partitions WHERE term_id=$1 AND published_at IS NOT NULL AND expected_count>0 LIMIT 1",
          [term.id],
        )
      ).rowCount
    )
      throw new SyllabusIndexChangedError(
        "Empty replacement index; retaining the last complete archive pending verification.",
      );
    await client.query(
      `INSERT INTO osu_syllabus.entry_observations(run_id,term_id,code,data)
       SELECT $1,$2,item->>'code',item FROM jsonb_array_elements($3::jsonb) AS item`,
      [runId, term.id, JSON.stringify(result.entries)],
    );
    await client.query(
      "UPDATE osu_syllabus.sync_partitions SET next_page=$3,expected_count=$4,page_size=$5 WHERE run_id=$1 AND term_id=$2",
      [runId, term.id, page + 1, result.total, result.pageSize],
    );
    if (!result.hasMore) {
      const count = Number(
        (
          await client.query(
            "SELECT count(*) AS count FROM osu_syllabus.entry_observations WHERE run_id=$1 AND term_id=$2",
            [runId, term.id],
          )
        ).rows[0].count,
      );
      if (count !== result.total)
        throw new SyllabusIndexChangedError(
          "Incomplete syllabus index; publication refused.",
        );
      await client.query(
        `INSERT INTO osu_syllabus.entries(code,term_id,entity_id,term_code,subject,catalog_number,class_number,data,fetched_at,last_seen_run)
        SELECT code,term_id,(data->>'entityId')::uuid,data->>'termCode',data->>'subject',data->>'catalogNumber',data->>'classNumber',data,fetched_at,run_id
        FROM osu_syllabus.entry_observations WHERE run_id=$1 AND term_id=$2
        ON CONFLICT(code) DO UPDATE SET data=excluded.data,fetched_at=excluded.fetched_at,last_seen_run=excluded.last_seen_run
        WHERE osu_syllabus.entries.term_id=excluded.term_id AND osu_syllabus.entries.entity_id=excluded.entity_id`,
        [runId, term.id],
      );
      const mismatches = await client.query(
        `SELECT 1 FROM osu_syllabus.entry_observations o JOIN osu_syllabus.entries e USING(code)
        WHERE o.run_id=$1 AND o.term_id=$2 AND (o.term_id<>e.term_id OR (o.data->>'entityId')::uuid<>e.entity_id) LIMIT 1`,
        [runId, term.id],
      );
      if (mismatches.rowCount)
        throw new SyllabusIndexChangedError(
          "Official syllabus code was reused for another identity.",
        );
      await client.query(
        "UPDATE osu_syllabus.sync_partitions SET published_at=now() WHERE run_id=$1 AND term_id=$2",
        [runId, term.id],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function saveDocument(client, document) {
  const safe = {
    ...document,
    components: document.components.map((component) => ({
      ...component,
      html: cleanSyllabusHtml(component.html),
      officialHtml: cleanOfficialSyllabusHtml(
        component.officialHtml ?? component.html,
      ),
    })),
  };
  const json = JSON.stringify(safe),
    hash = createHash("sha256").update(json).digest("hex");
  const identity = await client.query(
    "SELECT 1 FROM osu_syllabus.entries WHERE code=$1 AND term_id=$2 AND entity_id=$3 AND term_code=$4 AND subject=$5 AND catalog_number=$6 AND class_number=$7",
    [
      safe.entry.code,
      safe.entry.termId,
      safe.entry.entityId,
      safe.entry.termCode,
      safe.entry.subject,
      safe.entry.catalogNumber,
      safe.entry.classNumber,
    ],
  );
  if (!identity.rowCount)
    throw new Error("Syllabus document does not match its archived section.");
  await client.query(
    `INSERT INTO osu_syllabus.document_versions(code,snapshot_id,content_hash,data) VALUES($1,$2,$3,$4)
    ON CONFLICT(code,snapshot_id,content_hash) DO UPDATE SET checked_at=now()`,
    [safe.entry.code, safe.snapshotId, hash, json],
  );
}
