import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import {
  planningSchema,
  planningTable,
} from "../../src/lib/planning/namespace.ts";
import { directorySchema } from "../../src/lib/planning/directory.ts";
import { templateSchema } from "../../src/lib/planning/template.ts";
import { curriculumSchema } from "../../src/lib/planning/curriculum.ts";
const sha = (value) => createHash("sha256").update(value).digest("hex");
export async function archiveDirectory(db, input, readAsset) {
  const directory = directorySchema.parse(input);
  for (const document of directory.documents) {
    const asset = await readAsset(document.sha256);
    if (
      asset.content.length > 8388608 ||
      sha(asset.content) !== document.sha256
    )
      throw Error("Public source integrity check failed");
    const sourceId = document.sha256 + ":" + document.url;
    await db.query(
      "INSERT INTO " +
        planningTable("source_document") +
        " (id,source_url,sha256,fetched_at,validated_at,media_type) VALUES ($1,$2,$3,$4,NULL,$5) ON CONFLICT DO NOTHING",
      [
        sourceId,
        document.url,
        document.sha256,
        document.fetchedAt,
        document.mediaType,
      ],
    );
    await db.query(
      "INSERT INTO " +
        planningTable("source_asset") +
        " (source_id,content,extraction,metadata) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [
        sourceId,
        asset.content,
        asset.extraction ? JSON.stringify(asset.extraction) : null,
        JSON.stringify(document),
      ],
    );
  }
  const serialized = JSON.stringify(directory);
  const id = sha(serialized);
  await db.query(
    "INSERT INTO " +
      planningTable("directory_snapshot") +
      " (id,captured_at,index_url,directory) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [id, directory.generatedAt, directory.index.url, serialized],
  );
  return {
    snapshot: id,
    sources: directory.documents.length,
    programs: directory.programs.length,
  };
}
export async function archiveCurricula(db, input) {
  if (!Array.isArray(input) || input.length > 10000)
    throw Error("Expected a bounded public curriculum array");
  const candidates = input.map((value) => curriculumSchema.parse(value));
  for (const c of candidates) {
    const sourceId = c.source.sha256 + ":" + c.source.url;
    await db.query(
      "INSERT INTO " +
        planningTable("curriculum_version") +
        " (id,source_id,document_kind,program,specialization,campus,ge_system,version,applicable_from,applicable_until,evidence,curriculum,review_status,reviewed_at,reviewer,publication_status,plan_scope,academic_year) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) ON CONFLICT (id) DO NOTHING",
      [
        c.id,
        sourceId,
        c.documentKind,
        c.program,
        c.specialization,
        c.campus,
        c.geSystem,
        c.version,
        c.applicableFrom,
        c.applicableUntil,
        JSON.stringify(c.evidence),
        JSON.stringify(c),
        c.reviewStatus,
        c.reviewedAt,
        c.reviewer,
        c.publicationStatus,
        c.planScope,
        c.academicYear,
      ],
    );
  }
  return { curricula: candidates.length };
}
export async function archiveTemplate(db, input) {
  const template = templateSchema.parse(input),
    serialized = JSON.stringify(template),
    id = sha(serialized);
  await db.query(
    "INSERT INTO " +
      planningTable("template_seed") +
      " (id,program_code,applied_version,template) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING",
    [id, template.programCode, template.appliedVersion, serialized],
  );
  return { seed: id, reviewStatus: "pending" };
}
async function run() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: "boolean" },
      cache: { type: "string", default: ".planning-cache" },
      local: { type: "string" },
    },
  });
  const [action, file] = positionals;
  if (
    !["init", "archive", "curricula", "seed", "backup", "status"].includes(
      action,
    )
  )
    throw Error(
      "Use init | archive <directory.json> | curricula <candidates.json> | seed <template.json> | backup <new-file> | status; --local <directory> selects an isolated embedded database",
    );
  if (!values.apply) {
    console.log(
      JSON.stringify({
        action,
        schema: planningSchema(),
        apply: false,
        backend: values.local ? "local" : "postgres",
        retainAll: true,
      }),
    );
    return;
  }
  let db, pool;
  if (values.local) {
    await mkdir(resolve(values.local), { recursive: true, mode: 0o700 });
    const { PGlite } = await import("@electric-sql/pglite");
    db = new PGlite(resolve(values.local));
    await db.waitReady;
  } else {
    if (!process.env.PLANNING_DATABASE_URL)
      throw Error(
        "PLANNING_DATABASE_URL required; no other database is inferred",
      );
    const { Pool } = await import("pg");
    pool = new Pool({
      connectionString: process.env.PLANNING_DATABASE_URL,
      max: 1,
    });
    db = await pool.connect();
  }
  try {
    if (action === "backup") {
      if (!file) throw Error("New backup file required");
      if (!values.local)
        throw Error("For PostgreSQL use scripts/planning/database.mjs backup");
      const dump = await db.dumpDataDir("gzip");
      await writeFile(file, new Uint8Array(await dump.arrayBuffer()), {
        flag: "wx",
        mode: 0o600,
      });
      console.log(JSON.stringify({ backup: true, backend: "local" }));
      return;
    }
    await db.query("BEGIN");
    let result = { action };
    if (action === "init") {
      const sql = (
        await readFile(
          new URL("../../db/schemas/planning.sql", import.meta.url),
          "utf8",
        )
      ).replaceAll("osu_planning", '"' + planningSchema() + '"');
      if (db.exec) await db.exec(sql);
      else await db.query(sql);
    }
    if (action === "archive") {
      if (!file) throw Error("Public directory file required");
      result = await archiveDirectory(
        db,
        JSON.parse(await readFile(file, "utf8")),
        async (digest) => {
          const content = await readFile(resolve(values.cache, digest));
          let extraction = null;
          try {
            extraction = JSON.parse(
              await readFile(
                resolve(values.cache, "extracted", digest + ".json"),
                "utf8",
              ),
            );
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          return { content, extraction };
        },
      );
    }
    if (action === "curricula") {
      if (!file) throw Error("Public candidate array required");
      result = await archiveCurricula(
        db,
        JSON.parse(await readFile(file, "utf8")),
      );
    }
    if (action === "seed") {
      if (!file) throw Error("Reviewed template file required");
      result = await archiveTemplate(
        db,
        JSON.parse(await readFile(file, "utf8")),
      );
    }
    if (action === "status") {
      result = {};
      for (const table of [
        "source_document",
        "source_asset",
        "curriculum_version",
        "directory_snapshot",
        "template_seed",
      ])
        result[table] = (
          await db.query(
            "SELECT count(*)::int AS count FROM " + planningTable(table),
          )
        ).rows[0].count;
    }
    await db.query("COMMIT");
    console.log(
      JSON.stringify({ ...result, schema: planningSchema(), committed: true }),
    );
  } catch {
    try {
      await db.query("ROLLBACK");
    } catch {}
    throw Error("Planning archive operation failed; changes rolled back");
  } finally {
    if (pool) {
      db.release();
      await pool.end();
    } else await db.close();
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await run();
