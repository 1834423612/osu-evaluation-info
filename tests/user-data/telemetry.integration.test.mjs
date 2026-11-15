import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
test(
  "batched telemetry deduplicates replays atomically, buckets dimensions and restricts network provenance",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const f of [".env.local", ".env"])
      if (existsSync(f)) process.loadEnvFile(f);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool(),
      { recordProductEvents } =
        await import("../../src/lib/user-data/telemetry.ts");
    t.after(async () => {
      try {
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    for (const file of [
      "20261114_user_data_base.sql",
      "20261114_sync.sql",
      "20261114_telemetry.sql",
      "20261115_visitor_context.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + file, "utf8").replace(
          /osu_(?:identity|analytics|diagnostics)/g,
          schema,
        ),
      );
    const event = {
        id: randomUUID(),
        type: "search",
        path: "/?token=secret",
        term: "MATH 1151",
        capturedAt: new Date().toISOString(),
      },
      batch = {
        device: randomUUID(),
        session: randomUUID(),
        language: "en-US",
        languages: ["en-US"],
        timeZone: "America/New_York",
        viewport: "small",
        events: [event, { ...event, id: randomUUID(), term: "BIOLOGY 1100" }],
      };
    const headers = new Headers({
      "user-agent": "Test Browser",
      "accept-language": "en-US",
      "x-forwarded-for": "203.0.113.9",
    });
    delete process.env.USER_DATA_TRUSTED_PROXY_HEADER;
    const race = await Promise.all([
      recordProductEvents(headers, batch, db),
      recordProductEvents(headers, batch, db),
    ]);
    assert.equal(
      race.reduce((n, x) => n + x.accepted, 0),
      2,
    );
    const counts = (
      await db.query(
        'SELECT dimension,hits FROM "' +
          schema +
          '".product_day ORDER BY dimension',
      )
    ).rows;
    assert.deepEqual(
      counts.map((x) => [x.dimension, Number(x.hits)]),
      [
        ["", 2],
        ["BIOLOGY 1100", 1],
        ["MATH 1151", 1],
      ],
    );
    const context = (
      await db.query('SELECT * FROM "' + schema + '".visitor_context')
    ).rows[0];
    assert.equal(context.network_address, null);
    assert.equal(context.network_source, "not_configured");
    assert.equal(context.user_agent, "Test Browser");
    assert.notEqual(context.actor_digest, batch.device);
    process.env.USER_DATA_TRUSTED_PROXY_HEADER = "cf-connecting-ip";
    headers.set("cf-connecting-ip", "2001:db8::1");
    await recordProductEvents(
      headers,
      {
        ...batch,
        session: randomUUID(),
        events: [{ ...event, id: randomUUID(), term: "token=secret" }],
      },
      db,
    );
    assert.equal(
      (
        await db.query(
          'SELECT network_address::text AS ip FROM "' +
            schema +
            '".visitor_context WHERE session_id=$1',
          [
            (
              await db.query(
                'SELECT session_id FROM "' +
                  schema +
                  '".visitor_context WHERE network_address IS NOT NULL',
              )
            ).rows[0].session_id,
          ],
        )
      ).rows[0].ip,
      "2001:db8::1/128",
    );
    assert.equal(
      (
        await db.query(
          'SELECT term FROM "' + schema + '".product_event WHERE term=$1',
          ["[redacted]"],
        )
      ).rows.length,
      1,
    );
  },
);
