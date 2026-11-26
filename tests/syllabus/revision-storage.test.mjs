import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { saveDocument } from "../../scripts/syllabus/store.mjs";
import { normalizeDocument } from "../../src/lib/syllabus/normalize.ts";
import { documentFixture } from "./fixtures.mjs";

test("the archive rechecks random editor IDs without inserting a new version and retains real text updates", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE SCHEMA osu_syllabus;
    CREATE TABLE osu_syllabus.entries(code text,term_id uuid,entity_id uuid,term_code text,subject text,catalog_number text,class_number text);
    CREATE TABLE osu_syllabus.document_versions(code text,snapshot_id uuid,content_hash text,data jsonb,checked_at timestamptz DEFAULT now(),PRIMARY KEY(code,snapshot_id,content_hash));`);
  const document = normalizeDocument(documentFixture(), "example123");
  const entry = document.entry;
  await db.query(
    "INSERT INTO osu_syllabus.entries VALUES($1,$2,$3,$4,$5,$6,$7)",
    [
      entry.code,
      entry.termId,
      entry.entityId,
      entry.termCode,
      entry.subject,
      entry.catalogNumber,
      entry.classNumber,
    ],
  );
  const client = {
    query: async (sql, values) => {
      const result = await db.query(sql, values);
      return { ...result, rowCount: result.rows.length };
    },
  };
  const withEditor = (id, text = "Exam 40%") => ({
    ...document,
    components: [
      {
        ...document.components[0],
        html: `<div id="editor-0.${id}"><p>${text}</p></div>`,
        officialHtml: `<div id="editor-0.${id}"><p>${text}</p></div>`,
      },
    ],
  });
  await saveDocument(client, withEditor("123"));
  await saveDocument(client, withEditor("987"));
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM osu_syllabus.document_versions",
      )
    ).rows[0].count,
    1,
  );
  await saveDocument(client, withEditor("987", "Exam 50%"));
  const archived = (
    await db.query(
      "SELECT data FROM osu_syllabus.document_versions ORDER BY data->'components'->0->>'html'",
    )
  ).rows;
  assert.equal(archived.length, 2);
  assert.match(archived[0].data.components[0].html, /Exam 40%/);
  assert.match(archived[1].data.components[0].html, /Exam 50%/);
});
