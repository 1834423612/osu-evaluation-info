import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryTranslationState } from "../../src/lib/translation/state-store.ts";

const policy = { timeoutMs: 100, slowMs: 50, cooldownMs: 1000, concurrency: 3 };
async function fixture() {
  let time = 1000;
  const store = createMemoryTranslationState(() => time);
  await store.register({
    id: "ollama",
    configured: true,
    configHash: "initial",
    policy,
  });
  return {
    store,
    advance: (ms) => {
      time += ms;
    },
  };
}
const success = {
  success: true,
  reason: "success",
  durationMs: 10,
  httpStatus: 200,
};
const failure = { success: false, reason: "network", durationMs: 10 };

test("manual slow-node admission keeps capacity limits, real failure cooldowns and operator disable", async () => {
  const { store } = await fixture();
  await store.claim("ollama", "initial", "en", 10);
  await store.finish("ollama", "initial", { ...success, durationMs: 60 }, true);
  assert.equal(
    (await store.claim("ollama", "auto", "en", 10)).availability,
    "waiting_retry",
  );
  assert.equal(
    (await store.claim("ollama", "manual", "en", 10, undefined, true)).allowed,
    true,
  );
  assert.equal(
    (await store.claim("ollama", "sibling", "en", 10, undefined, true))
      .availability,
    "busy",
  );
  await store.finish("ollama", "manual", { ...failure, reason: "auth" }, true);
  assert.equal(
    (await store.claim("ollama", "failed", "en", 10, undefined, true))
      .availability,
    "waiting_retry",
  );
  store.reset("ollama", false);
  assert.equal(
    (await store.claim("ollama", "disabled", "en", 10, undefined, true))
      .availability,
    "disabled",
  );
});

test("unknown → single recovering probe → healthy; historical failures survive only as history", async () => {
  const { store, advance } = await fixture();
  assert.equal(store.snapshot("ollama").health.phase, "unknown");
  assert.equal((await store.claim("ollama", "first", "en", 10)).allowed, true);
  assert.equal(
    (await store.claim("ollama", "sibling", "en", 10)).allowed,
    false,
  );
  await store.finish("ollama", "first", failure, true);
  const failed = store.snapshot("ollama").health;
  assert.equal(failed.phase, "cooldown");
  assert.equal(failed.nextRetryAt, 2000);
  assert.equal((await store.claim("ollama", "early", "en", 10)).allowed, false);
  advance(1001);
  assert.equal(
    (await store.claim("ollama", "recover", "en", 10)).allowed,
    true,
  );
  assert.equal(store.snapshot("ollama").health.phase, "recovering");
  await store.finish("ollama", "recover", success, true);
  const healthy = store.snapshot("ollama").health;
  assert.equal(healthy.phase, "healthy");
  assert.equal(healthy.consecutiveFailures, 0);
  assert.equal(healthy.nextRetryAt, null);
  assert.equal(healthy.reason, "success");
  assert.equal(healthy.lastFailureKind, "network");
  assert.ok(healthy.lastSuccessAt > healthy.lastFailureAt);
});

test("healthy capacity is explicit and a busy skip does not count as failure", async () => {
  const { store } = await fixture();
  await store.claim("ollama", "warm", "en", 10);
  await store.finish("ollama", "warm", success, true);
  for (const id of ["one", "two", "three"])
    assert.equal((await store.claim("ollama", id, "en", 10)).allowed, true);
  assert.equal(
    (await store.claim("ollama", "overflow", "en", 10)).availability,
    "busy",
  );
  assert.equal(store.snapshot("ollama").health.consecutiveFailures, 0);
});

test("repeated failures have finite retry times and eventually recover", async () => {
  const { store, advance } = await fixture();
  for (let i = 0; i < 12; i++) {
    assert.equal(
      (await store.claim("ollama", String(i), "en", 10)).allowed,
      true,
    );
    await store.finish("ollama", String(i), failure, true);
    const state = store.snapshot("ollama").health;
    assert.ok(state.nextRetryAt - state.updatedAt <= 300000);
    advance(state.nextRetryAt - state.updatedAt + 1);
  }
  await store.claim("ollama", "healthy", "en", 10);
  await store.finish("ollama", "healthy", success, true);
  assert.equal(store.snapshot("ollama").health.phase, "healthy");
});

test("expired worker leases are auditable and a late result cannot overwrite a newer probe", async () => {
  const { store, advance } = await fixture();
  await store.claim("ollama", "lost", "en", 10);
  advance(1101);
  assert.equal((await store.claim("ollama", "new", "en", 10)).allowed, true);
  assert.equal(await store.finish("ollama", "lost", failure, true), false);
  await store.finish("ollama", "new", success, true);
  const record = store.snapshot("ollama");
  assert.equal(record.health.phase, "healthy");
  assert.equal(
    record.attempts.find((attempt) => attempt.id === "lost").status,
    "expired",
  );
  assert.ok(
    record.transitions.some((event) => event.reason === "lease_expired"),
  );
});

test("manual reset and changed configuration fence old attempts; only deliberate disable stays disabled", async () => {
  const { store, advance } = await fixture();
  await store.claim("ollama", "old", "en", 10);
  store.reset("ollama");
  assert.equal(await store.finish("ollama", "old", failure, true), false);
  assert.equal(store.snapshot("ollama").health.phase, "unknown");
  await store.register({
    id: "ollama",
    configured: true,
    configHash: "new",
    policy,
  });
  assert.equal(
    (await store.claim("ollama", "obsolete-worker", "en", 10, "initial"))
      .allowed,
    false,
  );
  store.reset("ollama", false);
  advance(86400000);
  assert.equal(
    (await store.claim("ollama", "disabled", "en", 10)).availability,
    "disabled",
  );
  store.reset("ollama", true);
  assert.equal(
    (await store.claim("ollama", "enabled", "en", 10)).allowed,
    true,
  );
});

test("old health becomes unknown and is revalidated instead of claiming indefinite availability", async () => {
  const { store, advance } = await fixture();
  await store.claim("ollama", "warm", "en", 10);
  await store.finish("ollama", "warm", success, true);
  advance(300001);
  const decision = await store.claim("ollama", "fresh", "en", 10);
  assert.equal(decision.attempt.isProbe, true);
  assert.ok(
    store
      .snapshot("ollama")
      .transitions.some((event) => event.reason === "stale"),
  );
});

test("resets fence outcomes while old inferences retain capacity until settlement or expiry", async () => {
  for (const change of ["retry", "configuration", "disable-enable"]) {
    const { store, advance } = await fixture();
    await store.claim("ollama", "old", "en", 10);
    if (change === "configuration")
      await store.register({
        id: "ollama",
        configured: true,
        configHash: "new",
        policy,
      });
    else {
      store.reset("ollama", change !== "disable-enable");
      if (change === "disable-enable") store.reset("ollama", true);
    }
    const old = store.snapshot("ollama").attempts[0];
    assert.equal(old.status, "cancelled");
    assert.equal(old.releasedAt, null);
    assert.equal(
      (await store.claim("ollama", "overlap", "en", 10)).availability,
      "busy",
    );
    assert.equal(await store.finish("ollama", "old", success, true), false);
    assert.equal(store.snapshot("ollama").health.phase, "unknown");
    assert.equal((await store.claim("ollama", "new", "en", 10)).allowed, true);
    store.reset("ollama");
    advance(1101);
    assert.equal(
      (await store.claim("ollama", "after-expiry", "en", 10)).allowed,
      true,
    );
    assert.equal(store.snapshot("ollama").health.consecutiveFailures, 0);
  }
});

test("reset keeps timed-out but unsettled inferences draining", async () => {
  const { store } = await fixture();
  await store.claim("ollama", "hanging", "en", 10);
  await store.finish(
    "ollama",
    "hanging",
    { ...failure, reason: "timeout" },
    false,
  );
  store.reset("ollama");
  assert.equal(
    (await store.claim("ollama", "overlap", "en", 10)).availability,
    "busy",
  );
  await store.release("ollama", "hanging");
  assert.equal(
    (await store.claim("ollama", "after-settlement", "en", 10)).allowed,
    true,
  );
});

test("concurrent successes and shorter failures preserve the latest cooldown until a recovery probe", async () => {
  const { store, advance } = await fixture();
  await store.claim("ollama", "warm", "en", 10);
  await store.finish("ollama", "warm", success, true);
  for (const id of ["rate-limited", "successful", "failed"])
    assert.equal((await store.claim("ollama", id, "en", 10)).allowed, true);
  await store.finish(
    "ollama",
    "rate-limited",
    { ...failure, reason: "rate_limit", retryAfterMs: 70000 },
    true,
  );
  const cooldown = store.snapshot("ollama").health.nextRetryAt;
  advance(1);
  await store.finish("ollama", "successful", success, true);
  assert.equal(store.snapshot("ollama").health.phase, "cooldown");
  assert.equal(store.snapshot("ollama").health.consecutiveFailures, 1);
  await store.finish("ollama", "failed", failure, true);
  assert.equal(store.snapshot("ollama").health.nextRetryAt, cooldown);
  assert.equal(
    (await store.claim("ollama", "early", "en", 10)).availability,
    "waiting_retry",
  );
  advance(70000);
  const probe = await store.claim("ollama", "recovery", "en", 10);
  assert.equal(probe.attempt.isProbe, true);
  await store.finish("ollama", "recovery", success, true);
  assert.equal(store.snapshot("ollama").health.phase, "healthy");
  assert.equal(store.snapshot("ollama").health.nextRetryAt, null);
});

test("an expiring sibling cannot shorten a more recent rate-limit cooldown", async () => {
  const { store, advance } = await fixture();
  await store.claim("ollama", "warm", "en", 10);
  await store.finish("ollama", "warm", success, true);
  await store.claim("ollama", "lost", "en", 10);
  await store.claim("ollama", "limited", "en", 10);
  await store.finish(
    "ollama",
    "limited",
    { ...failure, reason: "rate_limit", retryAfterMs: 70000 },
    true,
  );
  const cooldown = store.snapshot("ollama").health.nextRetryAt;
  advance(1101);
  assert.equal(
    (await store.claim("ollama", "early", "en", 10)).availability,
    "waiting_retry",
  );
  assert.equal(store.snapshot("ollama").health.nextRetryAt, cooldown);
});
