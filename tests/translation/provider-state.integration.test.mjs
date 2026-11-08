import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createPostgresTranslationState } from "../../src/lib/translation/postgres-state.ts";
import { saveBrowserProviderStates } from "../../src/lib/translation/browser-state.ts";

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
      await two.manage("ollama", "retry");
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
