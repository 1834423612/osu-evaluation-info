import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "private and public collection sharing enforces scope, expiry, revocation and bounded concurrent creation",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const path of [".env.local", ".env"])
      if (existsSync(path)) process.loadEnvFile(path);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    process.env.USER_DATA_SECRET = randomBytes(32).toString("hex");
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool();
    const {
      createShare,
      readShare,
      resolveShareCode,
      manageShare,
      listShares,
      recordShareEvent,
    } = await import("../../src/lib/user-data/sharing.ts");
    t.after(async () => {
      try {
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    for (const file of [
      "20261114_user_data_base.sql",
      "20261114_sharing.sql",
      "20261114_share_requests.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + file, "utf8").replaceAll(
          "osu_user",
          schema,
        ),
      );
    const a = { id: "g:a", owners: ["g:a"] },
      b = { id: "g:b", owners: ["g:b"] };
    await db.query(
      'INSERT INTO "' + schema + '".principal(id) VALUES($1),($2)',
      [a.id, b.id],
    );
    const input = { snapshot, visibility: "link", expiresIn: 3600 };
    const retryInput = { ...input, requestId: crypto.randomUUID() };
    const retries = await Promise.all([
      createShare(a, retryInput),
      createShare(a, retryInput),
    ]);
    assert.equal(retries[0].id, retries[1].id);
    assert.equal(retries[0].capability, retries[1].capability);
    assert.equal(
      (await manageShare(a, retries[0].id, "copy")).capability,
      retries[0].capability,
    );
    const privateShare = await createShare(a, input);
    await assert.rejects(readShare(privateShare.id), (e) => e.status === 404);
    await assert.rejects(
      readShare(privateShare.id, undefined, b.owners),
      (e) => e.status === 404,
    );
    assert.equal(
      (await readShare(privateShare.id, privateShare.capability)).snapshot.items
        .length,
      4,
    );
    assert.equal(
      (await readShare(privateShare.id, undefined, a.owners)).title,
      snapshot.title,
    );
    const stored = await db.query(
      'SELECT capability_digest,management_digest,snapshot FROM "' +
        schema +
        '".shared_collection WHERE id=$1',
      [privateShare.id],
    );
    assert.notEqual(stored.rows[0].capability_digest, privateShare.capability);
    assert.notEqual(stored.rows[0].management_digest, privateShare.management);
    assert.ok(
      !JSON.stringify(stored.rows[0].snapshot).includes("example.1@osu.edu"),
    );
    await assert.rejects(
      manageShare(b, privateShare.id, "rotate"),
      (e) => e.status === 404,
    );
    const rotated = await manageShare(a, privateShare.id, "rotate");
    await assert.rejects(
      readShare(privateShare.id, privateShare.capability),
      (e) => e.status === 404,
    );
    assert.equal(
      (await readShare(privateShare.id, rotated.capability)).id,
      privateShare.id,
    );
    const publicShare = await createShare(a, {
      ...input,
      visibility: "public",
    });
    assert.match(publicShare.code, /^\d{6}$/);
    assert.equal((await resolveShareCode(publicShare.code)).id, publicShare.id);
    assert.equal((await readShare(publicShare.id)).id, publicShare.id);
    await recordShareEvent(publicShare.id, "open", a.id, "same-window");
    await recordShareEvent(publicShare.id, "open", a.id, "same-window");
    const listing = await listShares(a.owners);
    assert.equal(listing.find((x) => x.id === publicShare.id).opens, 1);
    assert.equal((await listShares(b.owners)).length, 0);
    await db.query(
      'UPDATE "' +
        schema +
        "\".share_code SET expires_at=now()-interval '1 second' WHERE share_id=$1",
      [publicShare.id],
    );
    await assert.rejects(
      resolveShareCode(publicShare.code),
      (e) => e.status === 404,
    );
    assert.equal((await readShare(publicShare.id)).id, publicShare.id);
    await manageShare(a, publicShare.id, "revoke");
    await assert.rejects(readShare(publicShare.id), (e) => e.status === 404);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 25 }, () => createShare(b, input)),
    );
    assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 20);
    assert.ok(
      outcomes
        .filter((x) => x.status === "rejected")
        .every((x) => [409, 429].includes(x.reason.status)),
    );
    const count = await db.query(
      'SELECT count(*)::int AS n FROM "' +
        schema +
        '".shared_collection WHERE owner_id=$1',
      [b.id],
    );
    assert.equal(count.rows[0].n, 20);
    await db.query(
      'UPDATE "' +
        schema +
        "\".shared_collection SET expires_at=now()-interval '1 second' WHERE id=$1",
      [privateShare.id],
    );
    await assert.rejects(
      readShare(privateShare.id, rotated.capability),
      (e) => e.status === 404,
    );
  },
);
