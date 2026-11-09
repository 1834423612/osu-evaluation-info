import assert from "node:assert/strict";
import test from "node:test";
import {
  executeManagement,
  managementErrorMessage,
  parseManagementArgs,
} from "../../scripts/translation/manage.mjs";
import { createMemoryTranslationState } from "../../src/lib/translation/state-store.ts";

test("inspection and ordinary management never replace live registration with shell configuration", async () => {
  const store = createMemoryTranslationState();
  await store.register({
    id: "ollama",
    configured: true,
    configHash: "website",
    policy: {
      timeoutMs: 6000,
      slowMs: 2500,
      cooldownMs: 30000,
      concurrency: 1,
    },
  });
  await store.claim("ollama", "live", "en", 10, "website");
  const before = store.snapshot("ollama");
  const managed = [];
  const cliStore = {
    ...store,
    register: async () => {
      throw Error("CLI must not register implicitly");
    },
    refresh: async () => {
      throw Error("Inspection must not mutate state");
    },
    status: async () => [store.snapshot("ollama")],
    history: async () => [],
    attempts: async () => [],
    manage: async (...args) => managed.push(args),
  };
  for (const command of [
    "status",
    "history",
    "attempts",
    "retry",
    "enable",
    "disable",
    "configure",
  ])
    await executeManagement(
      parseManagementArgs(
        command === "configure" ? [command, "--timeout-ms", "6000"] : [command],
      ),
      cliStore,
      {},
    );
  assert.deepEqual(store.snapshot("ollama"), before);
  assert.deepEqual(
    managed.map(([, command]) => command),
    ["retry", "enable", "disable", "configure"],
  );
  assert.equal(
    await store.finish(
      "ollama",
      "live",
      { success: true, reason: "success", durationMs: 10 },
      true,
    ),
    true,
  );
});

test("configuration registration is explicit and unconfigured probes fail before changing state", async () => {
  const calls = [];
  const store = {
    register: async (value) => calls.push(value),
    manage: async () => {
      throw Error("Probe must validate local configuration first");
    },
    status: async () => [],
  };
  await assert.rejects(
    executeManagement(parseManagementArgs(["probe"]), store, {}),
    /valid local NAS/,
  );
  assert.deepEqual(calls, []);
  await executeManagement(parseManagementArgs(["sync-config"]), store, {});
  assert.equal(calls.length, 1);
  assert.equal(calls[0].configured, false);
});

test("CLI validates missing, blank, non-finite and duplicate operands by flag name", () => {
  for (const flag of [
    "--timeout-ms",
    "--slow-ms",
    "--cooldown-ms",
    "--concurrency",
  ])
    for (const raw of [undefined, "", " ", "abc", "Infinity", "NaN", "--json"])
      assert.throws(
        () =>
          parseManagementArgs([
            "configure",
            flag,
            ...(raw === undefined ? [] : [raw]),
          ]),
        new RegExp(`${flag} requires a numeric value`),
      );
  assert.equal(
    parseManagementArgs(["configure", "--concurrency", "-1"]).policy
      .concurrency,
    -1,
  );
  assert.throws(
    () =>
      parseManagementArgs([
        "configure",
        "--concurrency",
        "1",
        "--concurrency",
        "2",
      ]),
    /only be specified once/,
  );
  assert.equal(parseManagementArgs(["--json"]).json, true);
  assert.equal(
    parseManagementArgs(["configure", "--timeout-ms", "6000", "ollama"]).policy
      .timeoutMs,
    6000,
  );
  for (const args of [
    ["status", "6000"],
    ["retry", "missing"],
    ["status", "--unknown"],
    ["history", "ollama", "extra"],
    ["retry", "--concurrency", "1"],
  ])
    assert.throws(() => parseManagementArgs(args));
});

test("CLI distinguishes missing schemas from other coded errors and redacts unsafe messages", () => {
  assert.match(
    managementErrorMessage({ code: "42P01" }),
    /db:translation:init/,
  );
  for (const code of ["ECONNREFUSED", "ERR_MODULE_NOT_FOUND", "28P01"])
    assert.equal(
      managementErrorMessage({ code, message: "postgres://secret" }).includes(
        "secret",
      ),
      false,
    );
  assert.doesNotMatch(
    managementErrorMessage({ code: "ERR_MODULE_NOT_FOUND" }),
    /db:translation:init/,
  );
  assert.equal(
    managementErrorMessage(Error("--concurrency requires a numeric value.")),
    "--concurrency requires a numeric value.",
  );
});
