import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "private transfer codes need sender approval; leases, retries and completion are atomic",
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
    const { createTransfer, requestTransfer, transferAction, listTransfers } =
      await import("../../src/lib/user-data/transfers.ts");
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
      "20261114_sharing.sql",
      "20261114_transfers.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + file, "utf8").replaceAll(
          "osu_user",
          schema,
        ),
      );
    const a = { id: "g:a", owners: ["g:a"] },
      b = { id: "g:b", owners: ["g:b"] },
      c = { id: "g:c", owners: ["g:c"] };
    await db.query(
      'INSERT INTO "' + schema + '".principal(id) VALUES($1),($2),($3)',
      [a.id, b.id, c.id],
    );
    const input = { requestId: randomUUID(), snapshot, expiresIn: 3600 },
      created = await createTransfer(a, input);
    assert.deepEqual(await createTransfer(a, input), created);
    assert.match(created.code, /^\d{6}$/);
    assert.equal((await listTransfers(c)).length, 0);
    assert.equal((await listTransfers(a))[0].capability, created.capability);
    await assert.rejects(
      transferAction(c, created.id, { action: "claim" }),
      (e) => e.status === 404,
    );
    const pair = await requestTransfer(b, { code: created.code });
    assert.ok(!JSON.stringify(pair).includes(snapshot.title));
    assert.equal(
      (
        await transferAction(b, created.id, {
          action: "status",
          pairId: pair.pairId,
        })
      ).approved,
      false,
    );
    await assert.rejects(
      transferAction(b, created.id, { action: "claim", pairId: pair.pairId }),
      (e) => e.code === "approval_required",
    );
    await assert.rejects(
      transferAction(c, created.id, { action: "approve", pairId: pair.pairId }),
      (e) => e.status === 404,
    );
    await transferAction(a, created.id, {
      action: "approve",
      pairId: pair.pairId,
    });
    const claimed = await transferAction(b, created.id, {
      action: "claim",
      pairId: pair.pairId,
    });
    assert.equal(claimed.snapshot.items.length, 4);
    await transferAction(a, created.id, {
      action: "approve",
      pairId: pair.pairId,
    });
    assert.equal(
      (
        await transferAction(b, created.id, {
          action: "claim",
          pairId: pair.pairId,
        })
      ).claim,
      claimed.claim,
      "repeated sender approval does not invalidate receiver's claim",
    );
    await assert.rejects(
      transferAction(c, created.id, {
        action: "claim",
        capability: created.capability,
      }),
      (e) => e.code === "claimed",
    );
    await assert.rejects(
      transferAction(c, created.id, { action: "ack", claim: claimed.claim }),
      (e) => e.status === 404,
    );
    await transferAction(b, created.id, {
      action: "ack",
      claim: claimed.claim,
    });
    await transferAction(b, created.id, {
      action: "ack",
      claim: claimed.claim,
    });
    await assert.rejects(
      transferAction(b, created.id, { action: "claim", pairId: pair.pairId }),
      (e) => e.status === 404,
    );
    const link = await createTransfer(a, { ...input, requestId: randomUUID() });
    const race = await Promise.allSettled([
      transferAction(b, link.id, {
        action: "claim",
        capability: link.capability,
      }),
      transferAction(c, link.id, {
        action: "claim",
        capability: link.capability,
      }),
    ]);
    assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
    await db.query(
      'UPDATE "' +
        schema +
        "\".transfer SET lease_until=now()-interval '1 second' WHERE id=$1",
      [link.id],
    );
    const resumed = await transferAction(c, link.id, {
      action: "claim",
      capability: link.capability,
    });
    assert.ok(resumed.claim);
    await transferAction(a, link.id, { action: "revoke" });
    await assert.rejects(
      transferAction(c, link.id, {
        action: "claim",
        capability: link.capability,
      }),
      (e) => e.status === 404,
    );
    const expired = await createTransfer(a, {
      ...input,
      requestId: randomUUID(),
    });
    await db.query(
      'UPDATE "' +
        schema +
        "\".transfer SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.id],
    );
    await assert.rejects(
      transferAction(b, expired.id, {
        action: "claim",
        capability: expired.capability,
      }),
      (e) => e.status === 404,
    );
  },
);
