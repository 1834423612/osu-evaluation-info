import { courseChangeStateSql } from "./change-state.mjs";
export function parseChangeBackfillOptions(args) {
  const options = { maxBatches: 12, maxSeconds: 180 },
    seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i],
      value = Number(args[i + 1]);
    if (
      !["--max-batches", "--max-seconds"].includes(key) ||
      seen.has(key) ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > (key === "--max-batches" ? 200 : 1800)
    )
      throw Error("Expected --max-batches 1..200 and --max-seconds 1..1800");
    seen.add(key);
    options[key === "--max-batches" ? "maxBatches" : "maxSeconds"] = value;
  }
  return options;
}
/** Call inside the caller's transaction and catalog maintenance lock. A term becomes visible atomically. */
export async function captureCourseChanges(
  client,
  target,
  term,
  { chunkSize = 200, deadline = Infinity } = {},
) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 1000)
    throw Error("Invalid change chunk size");
  const check = () => {
    if (performance.now() >= deadline)
      throw Object.assign(Error("Course change budget reached"), {
        code: "CATALOG_CHANGE_BUDGET",
      });
  };
  check();
  if (
    (
      await client.query(
        "SELECT 1 FROM osu_catalog.change_batches WHERE run_id=$1 AND term_code=$2",
        [target, term],
      )
    ).rowCount
  )
    return 0;
  await client.query("SET LOCAL jit=off");
  const row = (
    await client.query(
      "SELECT v.published_at::text AS published_at FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.run_id=$1 AND v.published_at IS NOT NULL AND r.status='complete' AND r.terms ? $2",
      [target, term],
    )
  ).rows[0];
  if (!row) throw Error("Changes require a complete published term snapshot");
  const prior =
    (
      await client.query(
        "SELECT v.run_id FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.published_at IS NOT NULL AND r.status='complete' AND r.terms ? $1 AND (v.published_at,v.run_id)<($2,$3) ORDER BY v.published_at DESC,v.run_id DESC LIMIT 1",
        [term, row.published_at, target],
      )
    ).rows[0]?.run_id ?? null;
  await client.query(
    "INSERT INTO osu_catalog.change_batches(run_id,term_code,previous_run_id,observed_at) VALUES($1,$2,$3,$4)",
    [target, term, prior, row.published_at],
  );
  if (!prior) return 0;
  const ids = (
    await client.query(
      "SELECT DISTINCT course_id FROM osu_catalog.course_snapshots WHERE last_seen_run=ANY($1::uuid[]) AND term_code=$2 ORDER BY course_id",
      [[prior, target], term],
    )
  ).rows.map((x) => x.course_id);
  let count = 0;
  let offset = 0,
    size = chunkSize;
  while (offset < ids.length) {
    check();
    await client.query("SAVEPOINT course_change_chunk");
    try {
      // A slow chunk gets less work on retry, while the outer term stays atomic.
      const result = await client.query(
        `/* course-change-chunk */
      WITH old AS MATERIALIZED (${courseChangeStateSql("$1", "$2", "$4")}),
      fresh AS MATERIALIZED (${courseChangeStateSql("$3", "$2", "$4")}),
      delta AS (
        SELECT coalesce(b.course_id,a.course_id) course_id,coalesce(b.offering_number,a.offering_number) offering_number,
          coalesce(b.campus_code,a.campus_code) campus_code,coalesce(b.subject,a.subject) subject,
          coalesce(b.catalog_number,a.catalog_number) catalog_number,coalesce(b.title,a.title) title,
          a.facts before_data,b.facts after_data,
          CASE WHEN b.course_id IS NULL THEN 'removed' WHEN a.course_id IS NOT NULL THEN 'changed'
            WHEN EXISTS(SELECT 1 FROM osu_catalog.course_snapshots h JOIN osu_catalog.snapshot_versions v ON v.run_id=h.last_seen_run
              JOIN osu_catalog.sync_runs r ON r.id=v.run_id WHERE v.published_at IS NOT NULL AND r.status='complete'
              AND (v.published_at,v.run_id)<($5,$3) AND h.term_code=$2 AND h.course_id=b.course_id
              AND h.offering_number=b.offering_number AND h.campus_code=b.campus_code) THEN 'restored' ELSE 'added' END kind,
          CASE WHEN a.course_id IS NULL OR b.course_id IS NULL THEN ARRAY['sections'] ELSE osu_catalog.course_change_fields(a.facts,b.facts) END fields
        FROM old a FULL JOIN fresh b USING(course_id,offering_number,campus_code)
        WHERE a.facts IS DISTINCT FROM b.facts
      )
      INSERT INTO osu_catalog.course_changes(run_id,term_code,course_id,offering_number,campus_code,subject,catalog_number,title,kind,fields,before_data,after_data,observed_at)
      SELECT $3,$2,d.course_id,d.offering_number,d.campus_code,d.subject,d.catalog_number,d.title,d.kind,d.fields,d.before_data,d.after_data,$5
      FROM delta d WHERE d.kind<>'changed' OR cardinality(d.fields)>0`,
        [
          prior,
          term,
          target,
          ids.slice(offset, offset + size),
          row.published_at,
        ],
      );
      count += result.rowCount;
      offset += size;
      await client.query("RELEASE SAVEPOINT course_change_chunk");
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT course_change_chunk");
      await client.query("RELEASE SAVEPOINT course_change_chunk");
      check();
      if (error.code !== "57014" || size === 1) throw error;
      size = Math.max(1, Math.floor(size / 2));
      console.warn(
        `Course change query timed out; retrying with ${size} courses per chunk.`,
      );
    }
  }
  return count;
}
