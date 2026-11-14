import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "private-data maintenance enforces ownership, retains live favorites and archives, and expires tombstones with a reconciliation floor",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const f of [".env.local", ".env"])
      if (existsSync(f)) process.loadEnvFile(f);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    process.env.AUTH_TABLE_PREFIX = "ca_test_";
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool(),
      { maintainUserData } =
        await import("../../src/lib/user-data/maintenance.ts"),
      { exchangeSync } = await import("../../src/lib/user-data/sync.ts");
    t.after(async () => {
      try {
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    for (const f of [
      "20261114_user_data_base.sql",
      "20261114_sync.sql",
      "20261114_telemetry.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + f, "utf8").replaceAll(
          "osu_user",
          schema,
        ),
      );
    await assert.rejects(maintainUserData(true), /ownership marker/i);
    await db.query(
      'CREATE TABLE "' + schema + '".installation(name text PRIMARY KEY)',
    );
    await db.query(
      'INSERT INTO "' + schema + '".installation(name) VALUES($1)',
      ["auth:ca_test_"],
    );
    await db.query(
      'CREATE TABLE "' +
        schema +
        '".catalog_archive(id text PRIMARY KEY,data text)',
    );
    await db.query(
      'INSERT INTO "' + schema + '".catalog_archive VALUES($1,$2)',
      ["old-term", "permanent"],
    );
    await db.query(
      'INSERT INTO "' + schema + '".sync_state(owner_id,sequence) VALUES($1,3)',
      ["u:a"],
    );
    await db.query(
      'INSERT INTO "' +
        schema +
        "\".sync_item(owner_id,key,version,item,updated_at) VALUES($1,$2,1,NULL,now()-interval '200 days'),($1,$3,2,$4::jsonb,now()-interval '300 days'),($1,$5,3,NULL,now())",
      [
        "u:a",
        "course:old-deleted",
        "course:" + snapshot.items[0].payload.id,
        JSON.stringify(snapshot.items[0]),
        "course:recent-deleted",
      ],
    );
    await db.query(
      'INSERT INTO "' +
        schema +
        "\".visitor_context(session_id,actor_digest,user_agent,accept_language,language,languages,time_zone,viewport,network_source,environment,created_at) VALUES($1,'hash','old UA','en','en','[]','UTC','small','not_configured','test',now()-interval '8 days')",
      [randomUUID()],
    );
    const dry = await maintainUserData();
    assert.equal(dry.tables.visitor_context.eligible, 1);
    assert.equal(dry.tables.visitor_context.removed, 0);
    assert.equal(dry.tables.sync_tombstones.eligible, 1);
    const report = await maintainUserData(true);
    assert.equal(report.tables.visitor_context.removed, 1);
    assert.equal(report.tables.sync_tombstones.removed, 1);
    assert.equal(
      (await db.query('SELECT count(*) AS n FROM "' + schema + '".sync_item'))
        .rows[0].n,
      "2",
    );
    assert.equal(
      (await db.query('SELECT floor FROM "' + schema + '".sync_state')).rows[0]
        .floor,
      "1",
    );
    assert.equal(
      (await db.query('SELECT data FROM "' + schema + '".catalog_archive'))
        .rows[0].data,
      "permanent",
    );
    const stale = await exchangeSync("a", { cursor: 0, operations: [] });
    assert.equal(stale.reset, true);
    assert.equal(stale.records.length, 2);
    assert.equal(
      (await maintainUserData(true)).tables.sync_tombstones.removed,
      0,
    );
  },
);
