import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createDraftRegistry,
  installDraftNavigationGuard,
} from "../../src/lib/forms/navigation-guard.ts";
function target() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
  };
}
function event(extra = {}) {
  return {
    prevented: false,
    stopped: false,
    immediate: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
    stopImmediatePropagation() {
      this.immediate = true;
    },
    ...extra,
  };
}
test("draft registry follows current form values and forgets removed editors", () => {
  const registry = createDraftRegistry();
  let value = "before";
  registry.set("editor", () => value !== "before");
  assert.equal(registry.has(), false);
  value = "edited";
  assert.equal(registry.has(), true);
  value = "before";
  assert.equal(registry.has(), false);
  registry.set("job", () => true);
  registry.delete("job");
  assert.equal(registry.has(), false);
});
test("navigation guards cancel links, refresh, back and forward without trapping restored history", () => {
  const win = target(),
    doc = target(),
    go = [];
  let dirty = true,
    accepted = false,
    confirmations = 0;
  win.location = new URL("https://example.invalid/saved");
  win.history = {
    state: { __wahoDraftIndex: 7 },
    pushState(data) {
      this.state = data;
    },
    replaceState(data) {
      this.state = data;
    },
    go: (delta) => go.push(delta),
  };
  const cleanup = installDraftNavigationGuard(
    win,
    doc,
    () => dirty,
    () => {
      confirmations++;
      return accepted;
    },
  );
  const link = {
    href: "https://example.invalid/account",
    target: "",
    hasAttribute: () => false,
  };
  const click = event({ target: { closest: () => link }, button: 0 });
  doc.listeners.get("click")(click);
  assert.equal(click.prevented, true);
  assert.equal(click.stopped, true);
  const unload = event();
  win.listeners.get("beforeunload")(unload);
  assert.equal(unload.prevented, true);
  assert.equal(unload.returnValue, "");
  const back = event({ state: { __wahoDraftIndex: 6 } });
  win.listeners.get("popstate")(back);
  assert.deepEqual(go, [1]);
  assert.equal(back.immediate, true);
  const restore = event({ state: { __wahoDraftIndex: 7 } });
  win.listeners.get("popstate")(restore);
  assert.equal(restore.immediate, true);
  assert.equal(confirmations, 2);
  const forward = event({ state: { __wahoDraftIndex: 8 } });
  win.listeners.get("popstate")(forward);
  assert.deepEqual(go, [1, -1]);
  win.listeners.get("popstate")(event({ state: { __wahoDraftIndex: 7 } }));
  accepted = true;
  const allowed = event({ state: { __wahoDraftIndex: 6 } });
  win.listeners.get("popstate")(allowed);
  assert.equal(allowed.immediate, false);
  dirty = false;
  const count = confirmations;
  doc.listeners.get("click")(
    event({ target: { closest: () => link }, button: 0 }),
  );
  assert.equal(confirmations, count);
  cleanup();
  assert.equal(win.listeners.size, 0);
  assert.equal(doc.listeners.size, 0);
});
