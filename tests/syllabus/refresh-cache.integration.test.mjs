import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import {
  syncSyllabus,
  parseSyncOptions,
} from "../../scripts/syllabus/sync.mjs";
import { syllabusBudget } from "../../scripts/syllabus/budget.mjs";
import {
  rawEntry,
  documentFixture,
  envelope,
  termId,
  state,
} from "./fixtures.mjs";
test(
  "bounded syllabus refresh keeps document checkpoints while refreshing indexes, and never renews failed or reused checks",
  { skip: process.env.SYLLABUS_DATABASE_TEST !== "1", timeout: 60000 },
  async () => {
    loadCatalogEnvironment();
    const schema = "syllabus_refresh_test_" + randomUUID().replaceAll("-", ""),
      db = new pg.Client({
        connectionString: process.env.DATABASE_URL,
        statement_timeout: 5000,
      });
    const query = (sql, args) =>
      db.query(
        sql
          .replaceAll("osu_syllabus", schema)
          .replaceAll("674120205", "674129215"),
        args,
      );
    const createClient = () => ({
      connect: async () => {},
      end: async () => {},
      query,
    });
    const entries = [
        structuredClone(rawEntry),
        {
          ...rawEntry,
          code: "example124",
          entity_id: randomUUID(),
          title: "ART 2000 15116",
        },
      ],
      calls = new Map();
    let indexCalls = 0,
      failCode = null,
      published = true,
      endsAt = null;
    const fetcher = async (url) => {
      const u = new URL(url);
      if (u.pathname.endsWith("app-state")) {
        const json = structuredClone(state);
        const term = json.items[0].state.terms[0];
        term.is_published = published;
        term.end_date = endsAt;
        return Response.json(json);
      }
      if (u.pathname.endsWith("doc-library-search")) {
        indexCalls++;
        return Response.json(envelope(entries));
      }
      const code = u.searchParams.get("code"),
        entry = entries.find((x) => x.code === code);
      assert.ok(entry);
      calls.set(code, (calls.get(code) ?? 0) + 1);
      if (code === failCode) return new Response(null, { status: 503 });
      return Response.json(documentFixture(entry));
    };
    const run = (extra) =>
      syncSyllabus(
        parseSyncOptions([
          "--refresh-hours",
          "168",
          "--missing-refresh-hours",
          "72",
          ...extra,
        ]),
        { createClient, fetcher },
      );
    try {
      await db.connect();
      for (const name of [
        "001-syllabus.sql",
        "003-permanent-archive.sql",
        "004-canonical-archives.sql",
        "005-document-refresh.sql",
      ])
        await query(
          await readFile(
            new URL("../../db/migrations/syllabus/" + name, import.meta.url),
            "utf8",
          ),
        );
      await run(["--max-documents", "1"]);
      assert.equal(calls.get("example123"), 1);
      assert.equal(calls.has("example124"), false);
      await query("DROP TABLE osu_syllabus.document_checks");
      await query(
        await readFile(
          new URL(
            "../../db/migrations/syllabus/005-document-refresh.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM osu_syllabus.document_checks",
          )
        ).rows[0].n,
        1,
      );
      const original = (
        await query(
          "SELECT checked_at::text value FROM osu_syllabus.document_checks WHERE code='example123'",
        )
      ).rows[0].value;
      entries.push({
        ...rawEntry,
        code: "example125",
        entity_id: randomUUID(),
        title: "ART 2000 15117",
      });
      await run([]);
      assert.equal(indexCalls, 2);
      assert.equal(calls.get("example123"), 1);
      assert.equal(calls.get("example124"), 1);
      assert.equal(calls.get("example125"), 1);
      assert.equal(
        (
          await query(
            "SELECT checked_at::text value FROM osu_syllabus.document_checks WHERE code='example123'",
          )
        ).rows[0].value,
        original,
      );
      await run([]);
      assert.equal(indexCalls, 3);
      assert.equal(
        [...calls.values()].reduce((a, b) => a + b, 0),
        3,
      );
      entries[0].sub_title = "Changed official index";
      await run([]);
      assert.equal(calls.get("example123"), 2);
      assert.equal(calls.get("example124"), 1);
      await query(
        "UPDATE osu_syllabus.document_checks SET checked_at=now()-interval '8 days' WHERE code='example124'",
      );
      const stale = (
        await query(
          "SELECT checked_at::text value FROM osu_syllabus.document_checks WHERE code='example124'",
        )
      ).rows[0].value;
      failCode = "example124";
      await assert.rejects(run([]), /Some documents need retry/);
      assert.equal(
        (
          await query(
            "SELECT checked_at::text value FROM osu_syllabus.document_checks WHERE code='example124'",
          )
        ).rows[0].value,
        stale,
      );
      const count = (
        await query(
          "SELECT count(*)::int n FROM osu_syllabus.document_versions",
        )
      ).rows[0].n;
      published = false;
      await run([]);
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM osu_syllabus.document_versions",
          )
        ).rows[0].n,
        count,
      );
      failCode = null;
      published = true;
      endsAt = new Date(Date.now() - 1000).toISOString();
      await query(
        "UPDATE osu_syllabus.document_checks SET checked_at=now()-interval '2 days'",
      );
      const before = [...calls.values()].reduce((a, b) => a + b, 0);
      await run([]);
      assert.equal(
        [...calls.values()].reduce((a, b) => a + b, 0),
        before + 3,
      );
      await run([]);
      assert.equal(
        [...calls.values()].reduce((a, b) => a + b, 0),
        before + 3,
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM osu_syllabus.document_checks",
          )
        ).rows[0].n,
        3,
      );
      assert.equal(
        (
          await query(
            "SELECT count(*)::int n FROM osu_syllabus.entries WHERE term_id=$1",
            [termId],
          )
        ).rows[0].n,
        3,
      );
      entries.push(
        {
          ...rawEntry,
          code: "example126",
          entity_id: randomUUID(),
          title: "ART 2000 15118",
        },
        {
          ...rawEntry,
          code: "example127",
          entity_id: randomUUID(),
          title: "ART 2000 15119",
        },
      );
      let clock = 0;
      await syncSyllabus(parseSyncOptions(["--refresh-hours", "168"]), {
        createClient,
        budget: syllabusBudget(1, () => clock),
        fetcher: async (url, init) => {
          const response = await fetcher(url, init);
          if (new URL(url).searchParams.get("code") === "example126")
            clock = 2000;
          return response;
        },
      });
      assert.equal(calls.get("example126"), 1);
      assert.equal(calls.has("example127"), false);
      await run([]);
      assert.equal(calls.get("example126"), 1);
      assert.equal(calls.get("example127"), 1);
    } finally {
      await db.query("ROLLBACK").catch(() => {});
      await db.query('DROP SCHEMA IF EXISTS "' + schema + '" CASCADE');
      await db.end();
    }
  },
);
