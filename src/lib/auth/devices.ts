import type { Pool } from "pg";
import { getAuthPool } from "./database.ts";
import { authTablePrefix } from "./config.ts";
import { userDataTable } from "../user-data/namespace.ts";
import { networkLocation } from "../user-data/location.ts";
export async function readAccountDevices(
  userId: string,
  pool: Pool = getAuthPool(),
  lookup = networkLocation,
) {
  const rows = await pool.query(
    'SELECT s.id,CASE WHEN s."ipAddress" IS NULL OR s."ipAddress" ~ \'^(127[.]|::1$|10[.]|192[.]168[.])\' THEN coalesce(v.ip,s."ipAddress") ELSE s."ipAddress" END AS ip,s."userAgent" AS agent,s."createdAt",s."updatedAt",v.network_location AS location,v.browser_context AS context,v.network_source AS source FROM "' +
      authTablePrefix() +
      'session" s LEFT JOIN LATERAL(SELECT network_location,browser_context,network_source,host(network_address) AS ip FROM ' +
      userDataTable("visitor_context") +
      ' WHERE account_id=$1 AND (browser_context->>\'accountSessionId\'=s.id OR (browser_context->>\'accountSessionId\' IS NULL AND host(network_address)=s."ipAddress" AND user_agent=s."userAgent")) ORDER BY created_at DESC LIMIT 1)v ON true WHERE s."userId"=$1 ORDER BY s."updatedAt" DESC',
    [userId],
  );
  return Promise.all(
    rows.rows.map(async (row) => ({
      ...row,
      location: row.location ?? (await lookup(row.ip)),
    })),
  );
}
