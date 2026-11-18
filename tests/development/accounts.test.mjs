import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { PGlite } from "@electric-sql/pglite";
import { snapshot } from "../user-data/fixtures.mjs";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import {
  mergeAccountContent,
  content,
} from "../../src/lib/development/model.ts";
test("three-way account merge keeps independent additions and reports competing edits", () => {
  const plan = emptyPlan();
  plan.appliedVersion = "AU2024";
  const base = { planning: plan, favorites: [] },
    local = structuredClone(base),
    remote = structuredClone(base);
  local.planning.reviewed = true;
  remote.favorites = [snapshot.items[0]];
  const safe = mergeAccountContent(base, local, remote);
  assert.deepEqual(safe.conflicts, []);
  assert.equal(safe.value.planning.reviewed, true);
  assert.equal(safe.value.favorites.length, 1);
  local.planning.appliedVersion = "AU2025";
  remote.planning.appliedVersion = "AU2026";
  assert.ok(
    mergeAccountContent(base, local, remote).conflicts.includes(
      "account.planning.appliedVersion",
    ),
  );
});
test("paired accounts pull without automatic production writes, reject stale/conflicting pushes, and roll back all domains on quota failure", async () => {
  process.env.NODE_ENV = "test";
  process.env.USER_DATA_SCHEMA = "osu_development_test";
  process.env.AUTH_SCHEMA = "osu_development_test";
  process.env.DATABASE_URL = "postgresql://synthetic.invalid/test";
  process.env.USER_DATA_SECRET =
    "synthetic-development-account-secret-000000000";
  process.env.DEVELOPMENT_PRODUCTION_ORIGIN = "https://production.example.edu";
  const db = new PGlite();
  const query = async (sql, values) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  global.osuEvaluationPool = {
    query,
    connect: async () => ({ query, release() {} }),
  };
  global.osuAccountPools = new Map([
    [
      "osu_development_test",
      {
        query: (sql, values) =>
          query(sql.replace('"user"', 'osu_development_test."user"'), values),
      },
    ],
  ]);
  const realFetch = global.fetch;
  try {
    const { domainSQL } = await import("../../src/lib/user-data/namespace.ts");
    for (const file of [
      "20261114_user_data_base.sql",
      "20261114_sync.sql",
      "20261116_planning.sql",
      "20261117_calendars.sql",
      "20261117_development_links.sql",
    ])
      await db.exec(
        domainSQL(
          await readFile(
            new URL("../../db/migrations/" + file, import.meta.url),
            "utf8",
          ),
        ),
      );
    await db.exec(
      'CREATE TABLE osu_development_test."user"(id text PRIMARY KEY,"emailVerified" boolean);INSERT INTO osu_development_test."user" VALUES(\'production\',true)',
    );
    const { readAccountSnapshot, writeAccountSnapshot } =
      await import("../../src/lib/development/accounts.ts");
    const {
      issueDevelopmentGrant,
      authenticateDevelopmentGrant,
      bindDevelopment,
      pullDevelopment,
      previewProductionMerge,
      pushProductionMerge,
    } = await import("../../src/lib/development/server.ts");
    const initial = emptyPlan();
    initial.appliedVersion = "AU2024";
    await writeAccountSnapshot(
      "production",
      { planningVersion: 0, cursor: 0 },
      { planning: initial, favorites: [snapshot.items[0]] },
    );
    const grant = await issueDevelopmentGrant(
      "production",
      "Synthetic production",
    );
    assert.equal(
      (
        await authenticateDevelopmentGrant(
          new Request("https://production.example.edu", {
            headers: { Authorization: "Bearer " + grant.pairing },
          }),
        )
      ).accountId,
      "production",
    );
    let pushes = 0,
      offline = false;
    global.fetch = async (url, options) => {
      assert.equal(
        url,
        "https://production.example.edu/api/account/development/remote",
      );
      assert.equal(options.headers.Authorization, "Bearer " + grant.pairing);
      if (offline) return new Response("", { status: 503 });
      if (options.method === "PUT") {
        pushes++;
        const packed = JSON.parse(options.body),
          input = JSON.parse(
            gunzipSync(Buffer.from(packed.data, "base64url")).toString(),
          );
        return Response.json({
          ...(await writeAccountSnapshot(
            "production",
            input.expected,
            input.next,
          )),
          label: "Synthetic production",
        });
      }
      return Response.json({
        ...(await readAccountSnapshot("production")),
        label: "Synthetic production",
      });
    };
    await bindDevelopment("development", grant.pairing);
    assert.equal(pushes, 0);
    let dev = await readAccountSnapshot("development");
    assert.equal(dev.favorites.length, 1);
    assert.equal(dev.planning.appliedVersion, "AU2024");
    let prod = await readAccountSnapshot("production");
    dev.planning.appliedVersion = "AU2025";
    await writeAccountSnapshot("development", dev, content(dev));
    prod.planning.appliedVersion = "AU2026";
    await writeAccountSnapshot("production", prod, content(prod));
    const conflict = await previewProductionMerge("development");
    assert.ok(conflict.conflicts.length);
    await assert.rejects(
      pushProductionMerge("development", conflict.preview),
      (error) => error.code === "merge_conflict",
    );
    assert.equal(pushes, 0);
    await pullDevelopment("development", true);
    dev = await readAccountSnapshot("development");
    assert.equal(dev.planning.appliedVersion, "AU2025");
    dev.planning.appliedVersion = "AU2026";
    dev.planning.reviewed = true;
    await writeAccountSnapshot("development", dev, content(dev));
    const preview = await previewProductionMerge("development");
    assert.deepEqual(preview.conflicts, []);
    prod = await readAccountSnapshot("production");
    prod.planning.pdfOrigin = "browser-print";
    await writeAccountSnapshot("production", prod, content(prod));
    await assert.rejects(
      pushProductionMerge("development", preview.preview),
      (error) => error.code === "preview_outdated",
    );
    assert.equal(pushes, 0);
    const fresh = await previewProductionMerge("development");
    await pushProductionMerge("development", fresh.preview);
    assert.equal(pushes, 1);
    assert.equal(
      (await readAccountSnapshot("production")).planning.reviewed,
      true,
    );
    // Production's independent pdfOrigin edit must reach development before
    // it can become the merge base; repeated pulls/pushes must not revert it.
    await pullDevelopment("development");
    dev = await readAccountSnapshot("development");
    assert.equal(dev.planning.pdfOrigin, "browser-print");
    assert.equal(dev.planning.reviewed, true);
    const nextPush = await previewProductionMerge("development");
    assert.deepEqual(nextPush.conflicts, []);
    await pushProductionMerge("development", nextPush.preview);
    assert.equal(
      (await readAccountSnapshot("production")).planning.pdfOrigin,
      "browser-print",
    );
    await pullDevelopment("development");
    assert.equal(
      (await readAccountSnapshot("development")).planning.pdfOrigin,
      "browser-print",
    );
    offline = true;
    const before = await readAccountSnapshot("development");
    await assert.rejects(pullDevelopment("development", true));
    assert.deepEqual(await readAccountSnapshot("development"), before);
    offline = false;
    const over = Array.from({ length: 101 }, (_, index) => ({
      ...snapshot.items[0],
      payload: { ...snapshot.items[0].payload, id: "synthetic-" + index },
    }));
    await assert.rejects(
      writeAccountSnapshot("development", before, {
        planning: { ...before.planning, reviewed: false },
        favorites: over,
      }),
      (error) => error.code === "quota",
    );
    assert.deepEqual(await readAccountSnapshot("development"), before);
    const stored = (
      await query(
        "SELECT token_cipher FROM osu_development_test.development_link",
      )
    ).rows[0];
    assert.ok(!stored.token_cipher.includes(grant.pairing));
    await query(
      "UPDATE osu_development_test.development_grant SET revoked_at=now()",
    );
    await assert.rejects(
      authenticateDevelopmentGrant(
        new Request("https://production.example.edu", {
          headers: { Authorization: "Bearer " + grant.pairing },
        }),
      ),
    );
  } finally {
    global.fetch = realFetch;
    global.osuEvaluationPool = undefined;
    global.osuAccountPools = undefined;
    await db.close();
  }
});
