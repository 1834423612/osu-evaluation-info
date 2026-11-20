import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { planSchema } from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";

for (const file of [".env.local", ".env"])
  if (existsSync(file)) process.loadEnvFile(file);
const { getDatabasePool } = await import("../../src/lib/db.ts");
const pool = getDatabasePool();
const db = await pool.connect();
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
const report = {
  readOnly: true,
  checkedAt: new Date().toISOString(),
  tables: [],
  models: [],
  incomplete: [],
};
async function read(sql, values) {
  await db.query("BEGIN READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout='20s'");
    const result = await db.query(sql, values);
    await db.query("COMMIT");
    return result.rows;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
function modelSummary(values, schema) {
  const issues = {};
  let invalid = 0;
  for (const value of values) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      invalid++;
      for (const issue of parsed.error.issues)
        issues[issue.code] = (issues[issue.code] ?? 0) + 1;
    }
  }
  return { checked: values.length, invalid, issues };
}
async function readModels(table, column, schema) {
  const summary = { checked: 0, invalid: 0, issues: {} };
  await db.query("BEGIN READ ONLY");
  try {
    await db.query("SET LOCAL statement_timeout='20s'");
    await db.query(
      `DECLARE audit_models NO SCROLL CURSOR FOR SELECT ${quote(column)} AS value FROM ${table} WHERE ${quote(column)} IS NOT NULL`,
    );
    for (;;) {
      const { rows } = await db.query("FETCH FORWARD 100 FROM audit_models");
      if (!rows.length) break;
      const batch = modelSummary(
        rows.map((row) => row.value),
        schema,
      );
      summary.checked += batch.checked;
      summary.invalid += batch.invalid;
      for (const [code, count] of Object.entries(batch.issues))
        summary.issues[code] = (summary.issues[code] ?? 0) + count;
    }
    await db.query("CLOSE audit_models");
    await db.query("COMMIT");
    return summary;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}
try {
  const columns =
    await read(`SELECT c.table_schema,c.table_name,c.column_name,c.data_type,c.character_maximum_length
    FROM information_schema.columns c JOIN information_schema.tables t USING(table_schema,table_name)
    WHERE t.table_type='BASE TABLE' AND c.table_schema NOT IN ('information_schema') AND c.table_schema NOT LIKE 'pg_%'
    ORDER BY c.table_schema,c.table_name,c.ordinal_position`);
  const tables = Map.groupBy(
    columns,
    (column) => column.table_schema + "." + column.table_name,
  );
  for (const [name, fields] of tables) {
    const table =
      quote(fields[0].table_schema) + "." + quote(fields[0].table_name);
    const bounded = fields.filter(
      (field) => field.character_maximum_length !== null,
    );
    try {
      const profiles = bounded.map(
        (field, index) =>
          `max(length(${quote(field.column_name)})) AS "length${index}",count(*) FILTER(WHERE length(${quote(field.column_name)}) >= ${Number(field.character_maximum_length)}) AS "at${index}"`,
      );
      const [profile] = await read(
        `SELECT count(*) AS rows${profiles.length ? "," + profiles.join(",") : ""} FROM ${table}`,
      );
      report.tables.push({
        table: name,
        rows: Number(profile.rows),
        jsonColumns: fields
          .filter((field) => ["json", "jsonb"].includes(field.data_type))
          .map((field) => field.column_name),
        boundedText: bounded.map((field, index) => ({
          column: field.column_name,
          limit: field.character_maximum_length,
          longest: Number(profile["length" + index] ?? 0),
          atLimit: Number(profile["at" + index]),
        })),
      });
      const schema =
        fields[0].table_name === "planning_backup"
          ? planSchema
          : fields[0].table_name === "calendar"
            ? calendarSchema
            : null;
      const column =
        fields[0].table_name === "planning_backup" ? "plan" : "data";
      if (schema && fields.some((field) => field.column_name === column)) {
        report.models.push({
          table: name,
          ...(await readModels(table, column, schema)),
        });
      }
    } catch (error) {
      report.incomplete.push({
        table: name,
        code: typeof error.code === "string" ? error.code : "audit_failed",
      });
    }
  }
  const inputIndex = process.argv.indexOf("--plan");
  if (inputIndex >= 0) {
    try {
      report.inputPlan = modelSummary(
        [JSON.parse(readFileSync(process.argv[inputIndex + 1], "utf8"))],
        planSchema,
      );
    } catch {
      report.inputPlan = {
        checked: 1,
        invalid: 1,
        issues: { unreadable_input: 1 },
      };
      report.incomplete.push({ table: "input_plan", code: "unreadable_input" });
    }
  }
  const outputIndex = process.argv.indexOf("--output");
  if (outputIndex >= 0)
    writeFileSync(
      process.argv[outputIndex + 1],
      JSON.stringify(report, null, 2),
    );
  console.log(
    JSON.stringify(
      {
        readOnly: true,
        tables: report.tables.length,
        rows: report.tables.reduce((sum, table) => sum + table.rows, 0),
        boundedColumnsAtLimit: report.tables.flatMap((table) =>
          table.boundedText
            .filter((field) => field.atLimit)
            .map((field) => ({ table: table.table, ...field })),
        ),
        models: report.models,
        inputPlan: report.inputPlan,
        incomplete: report.incomplete,
      },
      null,
      2,
    ),
  );
  if (
    report.incomplete.length ||
    report.models.some((model) => model.invalid) ||
    report.inputPlan?.invalid
  )
    process.exitCode = 2;
} finally {
  db.release();
  await pool.end();
}
