import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { getTelemetryPool } from "../user-data/telemetry-pool.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { privateDigest } from "../user-data/rate-limit.ts";
import { UserDataError } from "../user-data/http.ts";
import { diagnosticContext } from "./server-context.ts";
import { diagnosticReportSchema } from "./protocol.ts";
import { readAdminCursor, adminCursor } from "../user-data/admin-cursor.ts";
export async function saveDiagnosticReport(
  input: unknown,
  actor: string,
  headers: Headers,
  pool: Pool = getTelemetryPool(),
) {
  const report = diagnosticReportSchema.parse(input),
    payload = JSON.stringify(report);
  if (Buffer.byteLength(payload) > 524288)
    throw new UserDataError("too_large", 413);
  const digest = createHash("sha256").update(payload).digest("hex"),
    actorDigest = privateDigest(actor, "diagnostic-actor");
  const observed = diagnosticContext(headers).results.filter((r) =>
    report.results.some((s) => s.id === r.id),
  );
  const result = await pool.query(
    "INSERT INTO " +
      table("diagnostic_report") +
      "(id,actor_digest,payload_digest,payload,observed_context) VALUES($1,$2,$3,$4::jsonb,$5::jsonb) ON CONFLICT(id) DO UPDATE SET id=excluded.id WHERE " +
      table("diagnostic_report") +
      ".actor_digest=excluded.actor_digest AND " +
      table("diagnostic_report") +
      ".payload_digest=excluded.payload_digest RETURNING id,created_at",
    [report.id, actorDigest, digest, payload, JSON.stringify(observed)],
  );
  if (!result.rows.length) throw new UserDataError("conflict", 409);
  return {
    id: report.id,
    receivedAt: result.rows[0].created_at,
    retentionDays: 7,
    verification: "browser_reported",
  };
}
export async function listDiagnosticReports(
  before: string | null,
  pool: Pool = getTelemetryPool(),
) {
  const cursor = readAdminCursor(before);
  const result = await pool.query(
    "SELECT id,(SELECT jsonb_object_agg(r->>'id',r->'value') FROM jsonb_array_elements(payload->'results') r WHERE r->>'id' IN ('os','browser','ip','screen','tz','h_ua')) AS summary,payload->>'capturedAt' AS captured_at,jsonb_array_length(payload->'results') AS readings,created_at,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS cursor_time FROM " +
      table("diagnostic_report") +
      " WHERE created_at>=now()-interval '7 days' AND ($1::timestamptz IS NULL OR (created_at,id)<($1::timestamptz,$2::uuid)) ORDER BY created_at DESC,id DESC LIMIT 26",
    [cursor?.time ?? null, cursor?.id ?? null],
  );
  const more = result.rows.length > 25,
    items = result.rows.slice(0, 25);
  return {
    items,
    verification: "browser_reported",
    next: more ? adminCursor(items[24]) : null,
  };
}
export async function getDiagnosticReport(
  id: string,
  pool: Pool = getTelemetryPool(),
) {
  const r = await pool.query(
    "SELECT id,payload,observed_context,created_at FROM " +
      table("diagnostic_report") +
      " WHERE id=$1 AND created_at>=now()-interval '7 days'",
    [id],
  );
  if (!r.rows.length) throw new UserDataError("not_found", 404);
  return { ...r.rows[0], verification: "browser_reported" };
}
