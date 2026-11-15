import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "popularity counts active account favorites once, excludes ambiguous names, and exposes only public summaries",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const f of [".env.local", ".env"])
      if (existsSync(f)) process.loadEnvFile(f);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    process.env.NEXT_PUBLIC_DEPLOYMENT_ENV = "development";
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool(),
      { exchangeSync } = await import("../../src/lib/user-data/sync.ts"),
      { popularFavorites, analyticsOverview, analyticsContexts } =
        await import("../../src/lib/user-data/statistics.ts"),
      { recordProductEvents } =
        await import("../../src/lib/user-data/telemetry.ts"),
      { itemKey } = await import("../../src/lib/saved/exchange.ts");
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
      "20261114_sharing.sql",
      "20261114_page_links.sql",
      "20261114_telemetry.sql",
      "20261115_visitor_context.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + f, "utf8").replace(
          /osu_(?:identity|analytics|diagnostics)/g,
          schema,
        ),
      );
    const ops = (items) =>
      items.map((item) => ({
        id: randomUUID(),
        key: itemKey(item),
        base: 0,
        item,
      }));
    await exchangeSync("a", {
      cursor: 0,
      operations: ops(snapshot.items.slice(0, 2)),
    });
    await exchangeSync("b", {
      cursor: 0,
      operations: ops(snapshot.items.slice(0, 2)),
    });
    let popular = await popularFavorites("course");
    assert.equal(popular.items.length, 1);
    assert.equal(popular.items[0].accounts, 2);
    assert.ok(!JSON.stringify(popular).includes("example.1@osu.edu"));
    const state = await exchangeSync("b", { cursor: 0, operations: [] }),
      record = state.records.find((x) => x.key === itemKey(snapshot.items[0]));
    await exchangeSync("b", {
      cursor: state.cursor,
      operations: [
        { id: randomUUID(), key: record.key, base: record.version, item: null },
      ],
    });
    assert.equal((await popularFavorites("course")).items[0].accounts, 1);
    const teacher = structuredClone(snapshot.items[2]);
    teacher.payload.id = "Alex Smith";
    await exchangeSync("a", { cursor: 2, operations: ops([teacher]) });
    assert.equal((await popularFavorites("instructor")).items.length, 0);
    teacher.payload.id = "smith.123";
    await exchangeSync("a", { cursor: 3, operations: ops([teacher]) });
    const teachers = await popularFavorites("instructor");
    assert.equal(teachers.items[0].accounts, 1);
    assert.equal(teachers.items[0].context, "");
    assert.ok(!JSON.stringify(teachers).includes(teacher.payload.email));
    const event = {
      id: randomUUID(),
      type: "search_result",
      path: "/",
      term: "math1151",
      status: "no_matches",
      count: 0,
      duration: 500,
      capturedAt: new Date().toISOString(),
    };
    await recordProductEvents(
      new Headers({ "user-agent": "Example browser" }),
      {
        device: randomUUID(),
        session: randomUUID(),
        language: "en",
        languages: ["en"],
        timeZone: "UTC",
        viewport: "large",
        events: [event],
      },
      db,
    );
    const overview = await analyticsOverview(7, "development", db);
    assert.equal(
      Number(overview.totals.find((x) => x.type === "search_result").count),
      1,
    );
    assert.equal(overview.outcomes[0].status, "no_matches");
    assert.equal(Number(overview.outcomes[0].count), 1);
    assert.equal(overview.contexts[0].user_agent, "Example browser");
    assert.equal(
      (await analyticsOverview(7, "production", db)).contexts.length,
      0,
    );
    await db.query(
      'INSERT INTO "' +
        schema +
        '".visitor_context(session_id,actor_digest,user_agent,accept_language,language,languages,time_zone,viewport,network_address,network_source,created_at,environment) SELECT x.id,v.actor_digest,v.user_agent,v.accept_language,v.language,v.languages,v.time_zone,v.viewport,v.network_address,v.network_source,v.created_at,v.environment FROM (SELECT * FROM "' +
        schema +
        '".visitor_context LIMIT 1)v CROSS JOIN unnest($1::uuid[])x(id)',
      [Array.from({ length: 101 }, () => randomUUID())],
    );
    await db.query(
      'UPDATE "' +
        schema +
        "\".visitor_context SET created_at=date_trunc('second',now())+interval '0.123456 seconds'",
    );
    const first = await analyticsContexts("development", null, db),
      second = await analyticsContexts("development", first.next, db);
    assert.equal(first.rows.length, 100);
    assert.equal(second.rows.length, 2);
    assert.equal(
      new Set([...first.rows, ...second.rows].map((r) => r.id)).size,
      102,
    );
    assert.equal(overview.latency[0].bucket, "under1000");
  },
);
