import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
test(
  "diagnostic submission retries are idempotent, owner-bound, separately observed and retained only seven days",
  { skip: process.env.USER_DATA_INTEGRATION !== "1" },
  async (t) => {
    for (const p of [".env.local", ".env"])
      if (existsSync(p)) process.loadEnvFile(p);
    if (process.env.USER_DATA_TEST_DATABASE_URL)
      process.env.DATABASE_URL = process.env.USER_DATA_TEST_DATABASE_URL;
    const schema = "osu_user_test_" + randomBytes(5).toString("hex");
    process.env.USER_DATA_SCHEMA = schema;
    const { getDatabasePool } = await import("../../src/lib/db.ts"),
      db = getDatabasePool(),
      { saveDiagnosticReport, listDiagnosticReports, getDiagnosticReport } =
        await import("../../src/lib/diagnostics/reports.ts");
    t.after(async () => {
      try {
        assert.match(schema, /^osu_user_test_[a-f0-9]+$/);
        await db.query('DROP SCHEMA "' + schema + '" CASCADE');
      } finally {
        await db.end();
      }
    });
    await db.query('CREATE SCHEMA "' + schema + '"');
    await db.query(
      readFileSync("db/migrations/20261114_diagnostics.sql", "utf8").replaceAll(
        "osu_user",
        schema,
      ),
    );
    const report = {
        version: 1,
        id: randomUUID(),
        capturedAt: new Date().toISOString(),
        consent: "selected-report-v1",
        results: [
          {
            id: "h_ua",
            status: "available",
            source: "server",
            value: "claimed by client",
            duration: 0,
          },
        ],
      },
      headers = new Headers({ "user-agent": "observed by server" });
    await Promise.all(
      Array.from({ length: 4 }, () =>
        saveDiagnosticReport(report, "owner", headers, db),
      ),
    );
    await assert.rejects(
      () => saveDiagnosticReport(report, "another", headers, db),
      (e) => e.status === 409,
    );
    await assert.rejects(
      () =>
        saveDiagnosticReport(
          {
            ...report,
            results: [{ ...report.results[0], value: "different" }],
          },
          "owner",
          headers,
          db,
        ),
      (e) => e.status === 409,
    );
    let list = await listDiagnosticReports(null, db);
    assert.equal(list.items.length, 1);
    assert.equal(list.verification, "browser_reported");
    const detail = await getDiagnosticReport(report.id, db);
    assert.equal(detail.observed_context[0].value, "observed by server");
    assert.equal(detail.payload.results[0].value, "claimed by client");
    assert.ok(!("actor_digest" in list.items[0]));
    await db.query(
      'UPDATE "' +
        schema +
        "\".diagnostic_report SET created_at=now()-interval '8 days'",
    );
    list = await listDiagnosticReports(null, db);
    assert.equal(list.items.length, 0);
    for (let i = 0; i < 28; i++)
      await saveDiagnosticReport(
        { ...report, id: randomUUID() },
        "owner",
        headers,
        db,
      );
    await db.query(
      'UPDATE "' +
        schema +
        "\".diagnostic_report SET created_at=date_trunc('second',now())+interval '0.123456 seconds'",
    );
    const first = await listDiagnosticReports(null, db),
      second = await listDiagnosticReports(first.next, db);
    assert.equal(first.items.length, 25);
    assert.equal(second.items.length, 4);
    assert.equal(
      new Set([...first.items, ...second.items].map((r) => r.id)).size,
      29,
    );
    assert.ok(!("payload" in first.items[0]));
    await assert.rejects(
      () => listDiagnosticReports("invalid", db),
      (e) => e.code === "invalid_cursor",
    );
  },
);
