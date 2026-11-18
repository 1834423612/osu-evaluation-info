import { existsSync } from "node:fs";
import { Pool } from "pg";
import { normalizeAcademicEntries } from "../../src/lib/calendar/academic.ts";
for (const path of [".env.local", ".env"])
  if (existsSync(path)) process.loadEnvFile(path);
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const { planningSchema } = await import("../../src/lib/planning/namespace.ts");
const apply = process.argv.includes("--apply"),
  year = new Date().getUTCFullYear();
const url = new URL(
  "https://registrar.osu.edu/umbraco/api/calendar/getentries",
);
url.search = new URLSearchParams({
  start: `${year - 1}-01-01`,
  end: `${year + 5}-12-31`,
  selected: "year",
  filters: "",
}).toString();
let entries;
for (let attempt = 0; attempt < 3; attempt++) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
    if (!response.ok) throw Error("Registrar unavailable");
    const json = await response.json();
    entries = normalizeAcademicEntries(json.Entries);
    if (entries.length < 20) throw Error("Incomplete calendar response");
    break;
  } catch (error) {
    if (attempt === 2) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
}
if (!apply) {
  console.log(JSON.stringify({ entries: entries.length, apply: false }));
  process.exit(0);
}
const schema = planningSchema(),
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
  await client.query(
    `CREATE TABLE IF NOT EXISTS "${schema}".academic_calendar (id text PRIMARY KEY, data jsonb NOT NULL, source_url text NOT NULL, fetched_at timestamptz NOT NULL DEFAULT now())`,
  );
  for (const entry of entries)
    await client.query(
      `INSERT INTO "${schema}".academic_calendar(id,data,source_url) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET data=excluded.data,source_url=excluded.source_url,fetched_at=now()`,
      [entry.id, entry, url.href],
    );
  await client.query(
    `DELETE FROM "${schema}".academic_calendar WHERE data->>'date'>=$1 AND data->>'date'<=$2 AND NOT(id=ANY($3::text[]))`,
    [
      `${year - 1}-01-01`,
      `${year + 5}-12-31`,
      entries.map((entry) => entry.id),
    ],
  );
  await client.query("COMMIT");
  console.log(
    JSON.stringify({ entries: entries.length, schema, applied: true }),
  );
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
