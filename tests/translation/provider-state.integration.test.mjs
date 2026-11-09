import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPostgresTranslationState } from "../../src/lib/translation/postgres-state.ts";
import { saveBrowserProviderStates } from "../../src/lib/translation/browser-state.ts";
import {
  executeManagement,
  parseManagementArgs,
} from "../../scripts/translation/manage.mjs";

test(
  "database state coordinates workers, fences late outcomes, survives restart and isolates browser observations",
  {
    skip: process.env.TRANSLATION_DATABASE_TEST !== "1",
    timeout: 30000,
  },
  async () => {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      max: 4,
      connectionTimeoutMillis: 3000,
      statement_timeout: 5000,
    });
    const schema = `translation_state_test_${randomUUID().replaceAll("-", "")}`;
    try {
      for (const file of ["translation.sql", "translation-state.sql"]) {
        const sql = (
          await readFile(
            new URL(`../../db/schemas/${file}`, import.meta.url),
            "utf8",
          )
        ).replaceAll("osu_translation", schema);
        await pool.query(sql);
        await pool.query(sql); // Explicit schema setup is idempotent.
      }
      await pool.query(
        `INSERT INTO ${schema}.daily_usage VALUES(CURRENT_DATE,'ollama','en','failure',999,999,999,1)`,
      );
      const one = createPostgresTranslationState(pool, schema),
        two = createPostgresTranslationState(pool, schema);
      const registration = {
        id: "ollama",
        configured: true,
        configHash: "initial",
        policy: {
          timeoutMs: 6000,
          slowMs: 2500,
          cooldownMs: 1000,
          concurrency: 3,
        },
      };
      await one.register(registration);
      await two.register(registration);
      const initial = (await one.status()).find(
        (row) => row.provider === "ollama",
      );
      assert.equal(initial.health, "unknown");
      const ids = [randomUUID(), randomUUID()];
      const decisions = await Promise.all([
        one.claim("ollama", ids[0], "en", 10),
        two.claim("ollama", ids[1], "en", 10),
      ]);
      assert.equal(decisions.filter((decision) => decision.allowed).length, 1);
      const active = ids[decisions.findIndex((decision) => decision.allowed)];
      await one.finish(
        "ollama",
        active,
        { success: true, reason: "success", durationMs: 10, httpStatus: 200 },
        true,
      );
      assert.equal(
        (await two.status()).find((row) => row.provider === "ollama").health,
        "healthy",
      );
      const old = randomUUID();
      await one.claim("ollama", old, "en", 10);
      const configuration = (
        await pool.query(
          `SELECT * FROM ${schema}.provider_nodes WHERE id='ollama'`,
        )
      ).rows[0];
      for (const command of ["status", "history", "attempts"])
        await executeManagement(parseManagementArgs([command]), two, {});
      assert.deepEqual(
        (
          await pool.query(
            `SELECT * FROM ${schema}.provider_nodes WHERE id='ollama'`,
          )
        ).rows[0],
        configuration,
      );
      const beforeBadProbe = (await one.status())[0];
      await assert.rejects(
        two.manage("ollama", "retry", {}, "wrong-shell-config"),
        /differs from the website/,
      );
      assert.deepEqual((await one.status())[0], beforeBadProbe);
      await two.manage("ollama", "retry");
      const draining = (await two.status())[0];
      assert.equal(draining.availability, "busy");
      assert.equal(draining.active_requests, "1");
      assert.equal(draining.draining_requests, "1");
      assert.equal(
        (await two.claim("ollama", randomUUID(), "en", 10)).availability,
        "busy",
      );
      assert.equal(
        await one.finish(
          "ollama",
          old,
          { success: false, reason: "auth", durationMs: 20, httpStatus: 403 },
          true,
        ),
        false,
      );
      assert.equal(
        (await one.status()).find((row) => row.provider === "ollama").health,
        "unknown",
      );
      assert.equal((await one.status())[0].active_requests, "0");
      const lost = randomUUID();
      await one.claim("ollama", lost, "en", 10);
      await pool.query(
        `UPDATE ${schema}.provider_attempts SET started_at=clock_timestamp()-interval '2 seconds',lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1`,
        [lost],
      );
      const recovery = randomUUID();
      assert.equal(
        (await two.claim("ollama", recovery, "en", 10)).allowed,
        true,
      );
      assert.equal(
        await one.finish(
          "ollama",
          lost,
          { success: false, reason: "timeout", durationMs: 100 },
          true,
        ),
        false,
      );
      await two.finish(
        "ollama",
        recovery,
        { success: true, reason: "success", durationMs: 10, httpStatus: 200 },
        true,
      );
      const attempts = await one.attempts("ollama");
      assert.equal(attempts.find((row) => row.id === lost).status, "expired");
      assert.ok(
        (await one.history("ollama")).some(
          (row) => row.reason === "lease_expired" && row.source === "expiry",
        ),
      );
      const a = randomUUID(),
        b = randomUUID();
      const event = (sessionId, sequence, phase) => ({
        provider: "gtx",
        target: "en",
        outcome: phase === "healthy" ? "success" : "failure",
        characters: 10,
        durationMs: 20,
        browser: {
          sessionId,
          sequence,
          phase,
          reason: phase === "healthy" ? "success" : "network",
          consecutiveFailures: phase === "healthy" ? 0 : 1,
          retryAfterMs: phase === "healthy" ? 0 : 5000,
        },
      });
      await saveBrowserProviderStates(
        pool,
        [
          event(a, 2, "healthy"),
          event(a, 3, "healthy"),
          event(b, 1, "cooldown"),
        ],
        schema,
      );
      await saveBrowserProviderStates(pool, [event(a, 1, "cooldown")], schema);
      const browser = await pool.query(
        `SELECT * FROM ${schema}.browser_provider_state ORDER BY session_id`,
      );
      assert.equal(
        browser.rows.find((row) => row.session_id === a).phase,
        "healthy",
      );
      assert.equal(
        browser.rows.find((row) => row.session_id === b).phase,
        "cooldown",
      );
      assert.equal(
        (await one.status()).find((row) => row.provider === "gtx").health,
        "per_device",
      );
      assert.equal(
        (await one.status()).find((row) => row.provider === "ollama").health,
        "healthy",
      );
      const siblingFailure = randomUUID(),
        siblingSuccess = randomUUID();
      await one.claim("ollama", siblingFailure, "en", 10);
      await two.claim("ollama", siblingSuccess, "en", 10);
      await one.finish(
        "ollama",
        siblingFailure,
        {
          success: false,
          reason: "rate_limit",
          retryAfterMs: 120000,
          durationMs: 10,
          httpStatus: 429,
        },
        true,
      );
      const beforeSuccess = (await one.status())[0];
      await two.finish(
        "ollama",
        siblingSuccess,
        { success: true, reason: "success", durationMs: 10 },
        true,
      );
      const afterSuccess = (await one.status())[0];
      assert.equal(afterSuccess.health, "cooldown");
      assert.equal(
        afterSuccess.next_retry_at.getTime(),
        beforeSuccess.next_retry_at.getTime(),
      );
      await one.manage("ollama", "retry");
      assert.equal(
        (await pool.query(`SELECT source FROM ${schema}.v_daily_attempts`))
          .rows[0].source,
        "legacy_unknown",
      );
      await one.manage("ollama", "configure", {
        timeoutMs: 2000,
        slowMs: 1500,
        cooldownMs: 1000,
        concurrency: 2,
      });
      await two.register(registration);
      assert.equal(
        (await two.status()).find((row) => row.provider === "ollama")
          .timeout_ms,
        2000,
      );
      assert.equal((await two.status())[0].provider, "ollama");
      const slow = randomUUID();
      await one.claim("ollama", slow, "en", 10);
      await one.finish(
        "ollama",
        slow,
        { success: true, reason: "success", durationMs: 1600, httpStatus: 200 },
        true,
      );
      assert.equal(
        (await two.claim("ollama", randomUUID(), "en", 10)).availability,
        "waiting_retry",
      );
      const manual = randomUUID();
      assert.equal(
        (await two.claim("ollama", manual, "en", 10, "initial", true)).allowed,
        true,
      );
      assert.equal(
        (await one.claim("ollama", randomUUID(), "en", 10, "initial", true))
          .availability,
        "busy",
      );
      await two.finish(
        "ollama",
        manual,
        { success: false, reason: "auth", durationMs: 10, httpStatus: 403 },
        true,
      );
      assert.equal(
        (await one.claim("ollama", randomUUID(), "en", 10, "initial", true))
          .availability,
        "waiting_retry",
      );
      await one.manage("ollama", "disable");
      assert.equal(
        (await two.claim("ollama", randomUUID(), "en", 10)).availability,
        "disabled",
      );
      await two.register(registration);
      assert.equal(
        (await one.status()).find((row) => row.provider === "ollama")
          .availability,
        "disabled",
      );
      await one.manage("ollama", "enable");
      await one.register({ ...registration, configHash: "updated" });
      assert.equal(
        (await two.claim("ollama", randomUUID(), "en", 10, "initial")).allowed,
        false,
      );
      assert.equal(
        (await pool.query(`SELECT requests FROM ${schema}.daily_usage`)).rows[0]
          .requests,
        "999",
      );
    } finally {
      await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await pool.end();
    }
  },
);
