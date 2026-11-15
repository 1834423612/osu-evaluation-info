import { test } from "node:test";
import assert from "node:assert/strict";
import { setAuthenticatedAccount } from "../../src/lib/saved/scope.ts";
import {
  rememberShare,
  readShareLinks,
} from "../../src/lib/saved/share-links.ts";
test("share capabilities do not survive an account-to-guest or account-to-account switch", () => {
  const data = new Map();
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i] ?? null,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    clear: () => data.clear(),
  };
  const win = Object.assign(new EventTarget(), {
    localStorage: storage,
    sessionStorage: storage,
  });
  globalThis.window = win;
  globalThis.localStorage = storage;
  globalThis.sessionStorage = storage;
  const share = (id) => ({
    id,
    url: "https://example.invalid/share/" + id,
    management: "private-" + id,
    title: id,
    expiresAt: "2030-01-01",
  });
  setAuthenticatedAccount("account-a");
  rememberShare(share("a"));
  assert.equal(readShareLinks().length, 1);
  setAuthenticatedAccount(null);
  assert.deepEqual(readShareLinks(), []);
  rememberShare(share("guest"));
  setAuthenticatedAccount("account-b");
  assert.deepEqual(readShareLinks(), []);
  setAuthenticatedAccount("account-a");
  assert.deepEqual(
    readShareLinks().map((x) => x.id),
    ["a"],
  );
  setAuthenticatedAccount(null);
  assert.deepEqual(
    readShareLinks().map((x) => x.id),
    ["guest"],
  );
});
