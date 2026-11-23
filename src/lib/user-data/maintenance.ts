import { getDatabasePool } from "../db.ts";
import { authTablePrefix, authSchema } from "../auth/config.ts";
import { userDataSchema, userDataTable as table } from "./namespace.ts";
const rules = [
  [
    "development_grant",
    `expires_at<now() OR revoked_at IS NOT NULL OR account_id NOT IN (SELECT id FROM "${authSchema()}"."${authTablePrefix()}user")`,
  ],
  [
    "development_link",
    `account_id NOT IN (SELECT id FROM "${authSchema()}"."${authTablePrefix()}user")`,
  ],
  [
    "calendar",
    `owner_id NOT IN (SELECT id FROM "${authSchema()}"."${authTablePrefix()}user")`,
  ],
  [
    "calendar_link",
    "expires_at<now()-interval '30 days' OR revoked_at<now()-interval '30 days'",
  ],
  [
    "planning_backup",
    `account_id NOT IN (SELECT id FROM "${authSchema()}"."${authTablePrefix()}user")`,
  ],
  [
    "planning_share",
    `expires_at<now()-interval '7 days' OR revoked_at<now()-interval '7 days' OR owner_id NOT IN (SELECT id FROM "${authSchema()}"."${authTablePrefix()}user")`,
  ],
  ["rate_bucket", "expires_at<now()"],
  ["cooldown_bucket", "expires_at<now()"],
  ["institutional_challenge", "expires_at<now()"],
  ["security_event", "created_at<now()-interval '7 days'"],
  ["visitor_context", "created_at<now()-interval '7 days'"],
  ["diagnostic_report", "created_at<now()-interval '7 days'"],
  ["product_event", "received_at<now()-interval '30 days'"],
  [
    "product_day",
    "day<((now() AT TIME ZONE 'UTC')::date-90) AND dimension<>''",
  ],
  [
    "shared_collection",
    "expires_at<now()-interval '7 days' OR revoked_at<now()-interval '7 days'",
  ],
  [
    "transfer",
    "expires_at<now()-interval '1 day' OR completed_at<now()-interval '1 day' OR revoked_at<now()-interval '1 day'",
  ],
  ["share_code", "reusable_after<now()"],
  ["transfer_code", "reusable_after<now()"],
  ["transfer_pair", "expires_at<now()"],
  ["sync_receipt", "created_at<now()-interval '180 days'"],
] as const;
export async function maintainUserData(apply = false) {
  const db = await getDatabasePool().connect(),
    schema = userDataSchema(),
    report: Record<
      string,
      { eligible: number; removed: number; remaining: number }
    > = {};
  let locked = false,
    inTransaction = false;
  async function exists(name: string) {
    return !!(
      await db.query("SELECT to_regclass($1) AS present", [table(name)])
    ).rows[0].present;
  }
  try {
    if (!(await exists("installation")))
      throw new Error("User-data ownership marker is missing");
    if (
      !(
        await db.query(
          "SELECT 1 FROM " + table("installation") + " WHERE name=$1",
          ["auth:" + authTablePrefix()],
        )
      ).rows.length
    )
      throw new Error(
        "User-data ownership marker does not match this environment",
      );
    if (apply) {
      locked = !!(
        await db.query("SELECT pg_try_advisory_lock(hashtext($1)) AS locked", [
          "user-data-maintenance:" + schema,
        ])
      ).rows[0].locked;
      if (!locked)
        throw new Error("Another user-data maintenance job is running");
    }
    for (const [name, predicate] of rules) {
      if (!(await exists(name))) continue;
      const count = async () =>
        Number(
          (
            await db.query(
              "SELECT count(*) AS n FROM " +
                table(name) +
                " WHERE " +
                predicate,
            )
          ).rows[0].n,
        );
      const eligible = await count();
      let removed = 0;
      if (apply)
        for (let batch = 0; batch < 50; batch++) {
          const result = await db.query(
            "DELETE FROM " +
              table(name) +
              " WHERE ctid IN (SELECT ctid FROM " +
              table(name) +
              " WHERE " +
              predicate +
              " LIMIT 10000)",
          );
          removed += result.rowCount ?? 0;
          if ((result.rowCount ?? 0) < 10000) break;
        }
      report[name] = {
        eligible,
        removed,
        remaining: apply ? await count() : eligible,
      };
    }
    if (await exists("sync_item")) {
      const owners = (
        await db.query<{ owner_id: string; n: string }>(
          "SELECT owner_id,count(*) AS n FROM " +
            table("sync_item") +
            " WHERE item IS NULL AND updated_at<now()-interval '180 days' GROUP BY owner_id ORDER BY owner_id",
        )
      ).rows;
      let removed = 0;
      if (apply)
        for (const { owner_id: owner } of owners) {
          await db.query("BEGIN");
          inTransaction = true;
          await db.query(
            "SELECT 1 FROM " +
              table("sync_state") +
              " WHERE owner_id=$1 FOR UPDATE",
            [owner],
          );
          const old = (
            await db.query<{ floor: string; n: string }>(
              "SELECT coalesce(max(version),0) AS floor,count(*) AS n FROM " +
                table("sync_item") +
                " WHERE owner_id=$1 AND item IS NULL AND updated_at<now()-interval '180 days'",
              [owner],
            )
          ).rows[0];
          await db.query(
            "UPDATE " +
              table("sync_state") +
              " SET floor=greatest(floor,$2) WHERE owner_id=$1",
            [owner, old.floor],
          );
          const result = await db.query(
            "DELETE FROM " +
              table("sync_item") +
              " WHERE owner_id=$1 AND item IS NULL AND updated_at<now()-interval '180 days'",
            [owner],
          );
          removed += result.rowCount ?? 0;
          await db.query("COMMIT");
          inTransaction = false;
        }
      const eligible = owners.reduce((n, x) => n + Number(x.n), 0);
      report.sync_tombstones = {
        eligible,
        removed,
        remaining: apply
          ? Number(
              (
                await db.query(
                  "SELECT count(*) AS n FROM " +
                    table("sync_item") +
                    " WHERE item IS NULL AND updated_at<now()-interval '180 days'",
                )
              ).rows[0].n,
            )
          : eligible,
      };
    }
    return { schema, apply, tables: report };
  } finally {
    if (inTransaction) await db.query("ROLLBACK").catch(() => {});
    if (locked)
      await db
        .query("SELECT pg_advisory_unlock(hashtext($1))", [
          "user-data-maintenance:" + schema,
        ])
        .catch(() => {});
    db.release();
  }
}
