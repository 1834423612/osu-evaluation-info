import { telemetryBatchSchema } from "../telemetry/protocol.ts";
import type { Pool } from "pg";
import { getTelemetryPool } from "./telemetry-pool.ts";
import { UserDataError } from "./http.ts";
import { userDataTable as table } from "./namespace.ts";
import { privateDigest, checkBudget } from "./rate-limit.ts";
import { requestNetwork } from "./network.ts";
export async function recordProductEvents(
  headers: Headers,
  raw: unknown,
  pool: Pool = getTelemetryPool(),
) {
  const input = telemetryBatchSchema.parse(raw),
    network = requestNetwork(headers);
  const actor = privateDigest(input.device, "telemetry-device");
  if (pool.waitingCount >= 20) throw new UserDataError("busy", 503);
  const budget = {
    query: (sql: string, values: readonly unknown[]) =>
      pool.query(sql, Array.from(values)),
  };
  await checkBudget("telemetry-device", actor, 60, 60, budget);
  await checkBudget("telemetry-all", "all", 60, 2500, budget);
  if (network.address)
    await checkBudget("telemetry-network", network.address, 60, 120, budget);
  const environment =
      process.env.NEXT_PUBLIC_DEPLOYMENT_ENV ??
      (process.env.NODE_ENV === "production" ? "production" : "development"),
    release = process.env.NEXT_PUBLIC_BUILD_SHA || "development";
  const db = await pool.connect();
  let accepted = 0;
  try {
    await db.query("BEGIN");
    await db.query(
      "INSERT INTO " +
        table("visitor_context") +
        "(session_id,actor_digest,user_agent,accept_language,language,languages,time_zone,viewport,network_address,network_source,environment) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9::inet,$10,$11) ON CONFLICT(session_id) DO NOTHING",
      [
        input.session,
        actor,
        (headers.get("user-agent") ?? "").slice(0, 1500),
        (headers.get("accept-language") ?? "").slice(0, 500),
        input.language,
        JSON.stringify(input.languages),
        input.timeZone,
        input.viewport,
        network.address,
        network.source,
        environment,
      ],
    );
    const rows = input.events.map((e) => ({
      id: e.id,
      type: e.type,
      path: e.path,
      entity: e.entity ?? null,
      term: e.term ?? null,
      status: e.status ?? null,
      result_count: e.count ?? null,
      duration_ms: e.duration ?? null,
      captured_at: e.capturedAt,
    }));
    const result = await db.query<{ accepted: string }>(
      "WITH inserted AS (INSERT INTO " +
        table("product_event") +
        "(id,actor_digest,session_id,type,path,entity,term,status,result_count,duration_ms,captured_at,environment,release) SELECT x.id,$1,$2,x.type,x.path,x.entity,x.term,x.status,x.result_count,x.duration_ms,x.captured_at,$3,$4 FROM jsonb_to_recordset($5::jsonb) AS x(id uuid,type text,path text,entity text,term text,status text,result_count integer,duration_ms integer,captured_at timestamptz) ORDER BY x.id ON CONFLICT(id) DO NOTHING RETURNING type,path,entity,term), labeled AS (SELECT type,CASE WHEN type IN ('search','search_result') THEN coalesce(term,'') WHEN type='page_view' THEN path ELSE coalesce(entity,'') END AS dimension FROM inserted), dimensions AS (SELECT type,'' AS dimension,count(*) AS hits FROM labeled GROUP BY type UNION ALL SELECT type,dimension,count(*) AS hits FROM labeled WHERE dimension<>'' GROUP BY type,dimension), totals AS (INSERT INTO " +
        table("product_day") +
        "(environment,type,dimension,hits) SELECT $3,type,dimension,hits FROM dimensions ORDER BY type,dimension ON CONFLICT(day,environment,type,dimension) DO UPDATE SET hits=" +
        table("product_day") +
        ".hits+EXCLUDED.hits RETURNING 1) SELECT count(*) AS accepted FROM inserted",
      [actor, input.session, environment, release, JSON.stringify(rows)],
    );
    accepted = Number(result.rows[0].accepted);
    await db.query("COMMIT");
    return { accepted, receipts: input.events.map((x) => x.id) };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
