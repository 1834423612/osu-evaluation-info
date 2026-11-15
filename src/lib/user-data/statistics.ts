import type { Pool } from "pg";
import { queryDatabase } from "../db.ts";
import { userDataTable as table, userDataSchema } from "./namespace.ts";
import { getTelemetryPool } from "./telemetry-pool.ts";
import {
  itemTitle,
  itemContext,
  itemHref,
  exchangeItemSchema,
  publicSnapshot,
  courseForItem,
} from "../saved/exchange.ts";
import type { CatalogCourse } from "../catalog/types.ts";
import { stableFavoriteKey } from "../telemetry/protocol.ts";
import { readAdminCursor, adminCursor } from "./admin-cursor.ts";
export type PopularKind = "course" | "section" | "instructor";
export type PopularItem = {
  key: string;
  kind: PopularKind;
  label: string;
  context: string;
  href: string | null;
  course?: CatalogCourse;
  focusSection?: string;
};
export type PopularResult = {
  asOf: string;
  items: PopularItem[];
  subjects?: string[];
};
const popularCache = new Map<
  string,
  { until: number; promise: Promise<PopularResult> }
>();
export async function popularFavorites(
  kind: PopularKind,
): Promise<PopularResult> {
  const key = userDataSchema() + ":" + kind,
    old = popularCache.get(key);
  if (old && old.until > Date.now()) return old.promise;
  const promise = (async () => {
    const rows = (
      await queryDatabase<{ key: string; accounts: string; item: unknown }>(
        "WITH ranked AS (SELECT key,count(*) AS accounts FROM " +
          table("sync_item") +
          " WHERE item IS NOT NULL AND key LIKE $1 AND (key NOT LIKE 'instructor:%' OR key ~* '^instructor:((osu:)?[a-z][a-z0-9_-]*\\.[0-9]+|rmp:[0-9]+)$') GROUP BY key ORDER BY count(*) DESC,key LIMIT 30) SELECT r.*,s.item FROM ranked r CROSS JOIN LATERAL(SELECT item FROM " +
          table("sync_item") +
          " WHERE key=r.key AND item IS NOT NULL ORDER BY updated_at DESC LIMIT 1)s ORDER BY r.accounts DESC,r.key",
        [kind + ":%"],
      )
    ).rows;
    const items: PopularItem[] = [];
    for (const row of rows) {
      if (!stableFavoriteKey(row.key)) continue;
      const parsed = exchangeItemSchema.safeParse(row.item);
      if (!parsed.success) continue;
      const item = parsed.data;
      const exposed =
        item.kind === "instructor"
          ? null
          : publicSnapshot({
              version: 1,
              title: "Course",
              createdAt: new Date().toISOString(),
              items: [item],
            }).items[0];
      const preview = exposed ? courseForItem(exposed) : null;
      items.push({
        key: row.key,
        kind,
        label: itemTitle(item).slice(0, 200),
        context: kind === "instructor" ? "" : itemContext(item).slice(0, 200),
        href:
          item.kind === "instructor"
            ? item.payload.id.startsWith("rmp:")
              ? "/rmp/" + item.payload.id.slice(4)
              : "/rmp?q=" + encodeURIComponent(item.payload.name)
            : itemHref(item),
        ...(preview
          ? {
              course: {
                ...preview,
                description: "",
                attributes: [],
                sections: [],
                sectionsPartial: true,
              },
              focusSection:
                exposed?.kind === "section"
                  ? exposed.payload.section.classNumber
                  : undefined,
            }
          : {}),
      });
    }
    return { asOf: new Date().toISOString(), items };
  })();
  popularCache.set(key, { until: Date.now() + 60000, promise });
  if (popularCache.size > 12)
    popularCache.delete(popularCache.keys().next().value!);
  try {
    return await promise;
  } catch (e) {
    popularCache.delete(key);
    throw e;
  }
}
export async function analyticsOverview(
  days: number,
  environment: string,
  pool: Pool = getTelemetryPool(),
) {
  const env = environment === "all" ? null : environment;
  const [totals, searches, outcomes, paths, contexts, links, latency] =
    await Promise.all([
      pool.query(
        "SELECT type,sum(hits)::bigint AS count FROM " +
          table("product_day") +
          " WHERE day>=((now() AT TIME ZONE 'UTC')::date-$1::int) AND dimension='' AND ($2::text IS NULL OR environment=$2) GROUP BY type ORDER BY type",
        [days - 1, env],
      ),
      pool.query(
        "SELECT dimension AS query,sum(hits)::bigint AS submissions FROM " +
          table("product_day") +
          " WHERE day>=((now() AT TIME ZONE 'UTC')::date-$1::int) AND type='search' AND dimension<>'' AND ($2::text IS NULL OR environment=$2) GROUP BY dimension ORDER BY sum(hits) DESC,dimension LIMIT 50",
        [days - 1, env],
      ),
      pool.query(
        "SELECT dimension AS status,sum(hits)::bigint AS count FROM " +
          table("product_day") +
          " WHERE day>=((now() AT TIME ZONE 'UTC')::date-$1::int) AND type='search_result_status' AND ($2::text IS NULL OR environment=$2) GROUP BY dimension",
        [days - 1, env],
      ),
      pool.query(
        "SELECT dimension AS path,sum(hits)::bigint AS views FROM " +
          table("product_day") +
          " WHERE day>=((now() AT TIME ZONE 'UTC')::date-$1::int) AND type='page_view' AND dimension<>'' AND ($2::text IS NULL OR environment=$2) GROUP BY dimension ORDER BY sum(hits) DESC LIMIT 30",
        [days - 1, env],
      ),
      analyticsContexts(environment, null, pool),
      pool.query(
        "SELECT coalesce(sum(previews),0)::bigint AS previews,coalesce(sum(opens),0)::bigint AS opens,count(*)::bigint AS links FROM " +
          table("page_link"),
        [],
      ),
      pool.query(
        "SELECT dimension AS bucket,sum(hits)::bigint AS count FROM " +
          table("product_day") +
          " WHERE day>=((now() AT TIME ZONE 'UTC')::date-$1::int) AND type='search_latency' AND ($2::text IS NULL OR environment=$2) GROUP BY dimension",
        [days - 1, env],
      ),
    ]);
  return {
    asOf: new Date().toISOString(),
    days,
    environment,
    totals: totals.rows,
    searches: searches.rows,
    outcomes: outcomes.rows,
    paths: paths.rows,
    contexts: contexts.rows,
    contextsNext: contexts.next,
    latency: latency.rows,
    pageLinks: links.rows[0],
  };
}
export async function analyticsContexts(
  environment: string,
  before: string | null,
  pool: Pool = getTelemetryPool(),
) {
  const cursor = readAdminCursor(before),
    env = environment === "all" ? null : environment;
  const result = await pool.query(
    "SELECT session_id AS id,user_agent,accept_language,language,languages,time_zone,viewport,network_address::text AS ip,network_source,browser_context,network_location,umami_id,account_id,created_at,environment,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS cursor_time FROM " +
      table("visitor_context") +
      " WHERE created_at>=now()-interval '7 days' AND ($1::text IS NULL OR environment=$1) AND ($2::timestamptz IS NULL OR (created_at,session_id)<($2::timestamptz,$3::uuid)) ORDER BY created_at DESC,session_id DESC LIMIT 101",
    [env, cursor?.time ?? null, cursor?.id ?? null],
  );
  const rows = result.rows.slice(0, 100);
  return {
    rows,
    next: result.rows.length > 100 ? adminCursor(rows[99]) : null,
  };
}

export function invalidatePopularFavorites() {
  const prefix = userDataSchema() + ":";
  for (const key of popularCache.keys())
    if (key.startsWith(prefix)) popularCache.delete(key);
}
