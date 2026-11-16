import assert from "node:assert/strict";
import { test } from "node:test";
import { accountStatus, accountView } from "../../src/lib/auth/status.ts";

test("missing account extensions do not hide a valid signed-in account", () => {
  const status = accountStatus([true, false, false, false], true);
  assert.deepEqual(status, {
    enabled: false,
    email: false,
    passkey: false,
    profile: false,
  });
  assert.equal(accountView(true, false, status), "account");
  assert.equal(accountView(false, false, status), "unavailable");
});
test("pending or failed status requests preserve the signed-in workspace", () => {
  assert.equal(accountView(true, false, null), "account");
  assert.equal(accountView(true, true, null), "loading");
  assert.equal(accountView(false, false, null), "loading");
  assert.equal(accountView(true, false, accountStatus([], false)), "account");
});
test("incomplete policy setup never enables sign-in or registration", () => {
  const status = accountStatus([true, false, true, true], true);
  assert.equal(status.enabled, false);
  assert.equal(status.profile, true);
  assert.equal(accountView(false, false, status), "unavailable");
});
test("complete setup enables account entry and respects mail configuration", () => {
  for (const mail of [true, false]) {
    const status = accountStatus([true, true, true, true], mail);
    assert.equal(status.email, mail);
    assert.equal(status.passkey, true);
    assert.equal(status.profile, true);
    assert.equal(accountView(false, false, status), "sign-in");
  }
});
test("short, empty, or false table checks fail closed", () => {
  for (const tables of [
    [],
    [true],
    [true, true, true],
    [false, true, true, true],
  ]) {
    assert.equal(accountStatus(tables, true).enabled, false);
  }
});
