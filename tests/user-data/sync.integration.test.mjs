import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "sync isolates accounts and handles retry, concurrency, deletion, conflict and stale reconciliation",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const f of [".env.local", ".env"])
      if (existsSync(f)) process.loadEnvFile(f);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool();
    const { exchangeSync } = await import("../../src/lib/user-data/sync.ts"),
      { itemKey } = await import("../../src/lib/saved/exchange.ts");
    t.after(async () => {
      try {
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    for (const file of ["20261114_user_data_base.sql", "20261114_sync.sql"])
      await db.query(
        readFileSync("db/migrations/" + file, "utf8").replaceAll(
          "osu_user",
          schema,
        ),
      );
    const item = structuredClone(snapshot.items[0]),
      key = itemKey(item),
      op = (value, base = 0) => ({ id: randomUUID(), key, base, item: value });
    const first = op(item),
      a = await exchangeSync("a", { cursor: 0, operations: [first] });
    assert.equal(a.cursor, 1);
    assert.equal(a.receipts[0].status, "applied");
    const retry = await exchangeSync("a", { cursor: 0, operations: [first] });
    assert.equal(retry.cursor, 1);
    assert.deepEqual(a.receipts, retry.receipts);
    await assert.rejects(
      exchangeSync("a", { cursor: 0, operations: [{ ...first, item: null }] }),
      (e) => e.code === "operation_reused",
    );
    assert.equal(
      (await exchangeSync("b", { cursor: 0, operations: [] })).records.length,
      0,
    );
    const changed = structuredClone(item);
    changed.payload.title = "Device B";
    const deleted = await exchangeSync("a", {
      cursor: 1,
      operations: [op(null, 1)],
    });
    assert.equal(deleted.cursor, 2);
    const conflict = await exchangeSync("a", {
      cursor: 1,
      operations: [op(changed, 1)],
    });
    assert.equal(conflict.receipts[0].status, "conflict");
    assert.equal(conflict.records[0].item, null);
    const resolved = await exchangeSync("a", {
      cursor: 2,
      operations: [op(changed, 2)],
    });
    assert.equal(resolved.cursor, 3);
    // Two genuinely concurrent updates based on one revision cannot overwrite each other.
    const v1 = structuredClone(changed),
      v2 = structuredClone(changed);
    v1.payload.title = "One";
    v2.payload.title = "Two";
    const parallel = await Promise.all([
      exchangeSync("a", { cursor: 3, operations: [op(v1, 3)] }),
      exchangeSync("a", { cursor: 3, operations: [op(v2, 3)] }),
    ]);
    assert.deepEqual(parallel.map((x) => x.receipts[0].status).sort(), [
      "applied",
      "conflict",
    ]);
    // New identity from an offline device is merged even if its cursor is behind.
    const second = snapshot.items[1];
    const merged = await exchangeSync("a", {
      cursor: 1,
      operations: [
        { id: randomUUID(), key: itemKey(second), base: 0, item: second },
      ],
    });
    assert.equal(merged.cursor, 5);
    await db.query(
      'UPDATE "' + schema + '".sync_state SET floor=4 WHERE owner_id=$1',
      ["u:a"],
    );
    const expired = await exchangeSync("a", {
      cursor: 1,
      operations: [op(null, 1)],
    });
    assert.equal(expired.reset, true);
    assert.equal(expired.receipts.length, 0);
    assert.equal(expired.records.length, 2);
    // Organization stays account-private and uses the same CAS/receipt protocol.
    const folders = Array.from({ length: 30 }, (_, i) => ({
      kind: "collection",
      payload: {
        id: randomUUID(),
        name: "Term " + i,
        tags: [],
        members: [key],
      },
    }));
    const foldersResult = await exchangeSync("folders", {
      cursor: 0,
      operations: folders.map((item) => ({
        id: randomUUID(),
        key: "collection:" + item.payload.id,
        base: 0,
        item,
      })),
    });
    assert.equal(foldersResult.records.length, 30);
    const extra = {
      ...folders[0],
      payload: { ...folders[0].payload, id: randomUUID() },
    };
    await assert.rejects(
      exchangeSync("folders", {
        cursor: 30,
        operations: [
          {
            id: randomUUID(),
            key: "collection:" + extra.payload.id,
            base: 0,
            item: extra,
          },
        ],
      }),
      (e) => e.code === "quota",
    );
    assert.equal(
      (await exchangeSync("folders", { cursor: 0, operations: [] })).records
        .length,
      30,
    );
    assert.equal(
      (await exchangeSync("other-folder-owner", { cursor: 0, operations: [] }))
        .records.length,
      0,
    );
    const bad = { ...first, id: randomUUID(), key: "course:wrong" };
    await assert.rejects(exchangeSync("a", { cursor: 5, operations: [bad] }));
    await assert.rejects(
      exchangeSync("a", { cursor: 999, operations: [] }),
      (e) => e.code === "cursor",
    );
  },
);
