import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { Pool } from "pg";
import {
  planningSchema,
  planningTable,
} from "../../src/lib/planning/namespace.ts";
import { curriculumSchema } from "../../src/lib/planning/curriculum.ts";
const [action, file] = process.argv.slice(2);
const schema = planningSchema();
if (!["init", "import", "backup", "retention"].includes(action))
  throw Error(
    "Use init | import <candidate.json> | backup <file> | retention; writes require --apply",
  );
if (!process.argv.includes("--apply")) {
  console.log(
    JSON.stringify({
      action,
      schema,
      apply: false,
      retention: "Keep all versions; no automatic deletion",
    }),
  );
  process.exit(0);
}
if (action === "retention") throw Error("No automatic deletion policy");
if (!process.env.PLANNING_DATABASE_URL)
  throw Error(
    "PLANNING_DATABASE_URL required; course or identity database is never inferred",
  );
if (action === "backup") {
  if (!file || file.startsWith("--")) throw Error("Backup output required");
  const result = spawnSync(
    "pg_dump",
    ["--format=custom", "--schema=" + schema],
    {
      env: { ...process.env, PGDATABASE: process.env.PLANNING_DATABASE_URL },
      maxBuffer: 100 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw Error("Planning backup failed");
  await writeFile(file, result.stdout, { flag: "wx", mode: 0o600 });
  process.exit(0);
}
const pool = new Pool({
  connectionString: process.env.PLANNING_DATABASE_URL,
  max: 1,
});
const client = await pool.connect();
try {
  await client.query("BEGIN");
  if (action === "init") {
    const sql = (
      await readFile(
        new URL("../../db/schemas/planning.sql", import.meta.url),
        "utf8",
      )
    ).replaceAll("osu_planning", '"' + schema + '"');
    await client.query(sql);
  } else {
    const candidate = curriculumSchema.parse(
      JSON.parse(await readFile(file, "utf8")),
    );
    const s = candidate.source;
    const sourceId = s.sha256 + ":" + s.url;
    await client.query(
      `INSERT INTO ${planningTable("source_document")} (id,source_url,sha256,fetched_at,validated_at,media_type) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
      [sourceId, s.url, s.sha256, s.fetchedAt, s.validatedAt, s.mediaType],
    );
    await client.query(
      `INSERT INTO ${planningTable("curriculum_version")} (id,source_id,document_kind,program,specialization,campus,ge_system,version,applicable_from,applicable_until,evidence,curriculum,review_status,reviewed_at,reviewer) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT DO NOTHING`,
      [
        candidate.id,
        sourceId,
        candidate.documentKind,
        candidate.program,
        candidate.specialization,
        candidate.campus,
        candidate.geSystem,
        candidate.version,
        candidate.applicableFrom,
        candidate.applicableUntil,
        JSON.stringify(candidate.evidence),
        JSON.stringify(candidate.semesters),
        candidate.reviewStatus,
        candidate.reviewedAt,
        candidate.reviewer,
      ],
    );
  }
  await client.query("COMMIT");
  console.log(JSON.stringify({ action, schema, committed: true }));
} catch {
  await client.query("ROLLBACK");
  throw Error("Planning database action failed; transaction rolled back");
} finally {
  client.release();
  await pool.end();
}
