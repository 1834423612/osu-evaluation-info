import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { snapshot } from "./fixtures.mjs";
test(
  "page links reuse an owner's canonical target, retain public course fallback and separate preview/open counters",
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
      { createPageLink, readPageLink } =
        await import("../../src/lib/user-data/page-links.ts"),
      { courseShareHref } = await import("../../src/lib/saved/page-link.ts");
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
      "20261114_page_links.sql",
    ])
      await db.query(
        readFileSync("db/migrations/" + file, "utf8").replace(
          /osu_(?:identity|analytics|diagnostics)/g,
          schema,
        ),
      );
    const actor = { id: "g:a", owners: ["g:a"] };
    await db.query('INSERT INTO "' + schema + '".principal(id) VALUES($1)', [
      actor.id,
    ]);
    const course = snapshot.items[0].payload,
      input = { href: courseShareHref(course), title: "MATH 1151", course };
    const created = await createPageLink(actor, input);
    assert.deepEqual(await createPageLink(actor, input), created);
    const read = await readPageLink(created.id);
    assert.equal(read.course.id, course.id);
    assert.equal(read.course.sections.length, 0);
    await readPageLink(created.id, "preview");
    await readPageLink(created.id, "open");
    await readPageLink(created.id, "open");
    const counts = (
      await db.query(
        'SELECT previews,opens FROM "' + schema + '".page_link WHERE id=$1',
        [created.id],
      )
    ).rows[0];
    assert.equal(Number(counts.previews), 1);
    assert.equal(Number(counts.opens), 2);
    await assert.rejects(createPageLink(actor, { ...input, href: "/saved" }));
    await assert.rejects(
      createPageLink(actor, { ...input, href: "/?course=wrong" }),
    );
  },
);
