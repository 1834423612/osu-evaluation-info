import assert from "node:assert/strict";
import test from "node:test";
import {
  createGuideExitGuard,
  createTranslationGuideStore,
} from "../../src/lib/translation/onboarding.ts";

function device(initial = null) {
  let value = initial;
  return {
    read: () => value,
    write: (next) => {
      value = next;
    },
  };
}

test("only a non-English page activates the guide, with no server-side storage access", () => {
  let reads = 0;
  const store = createTranslationGuideStore({
    read: () => {
      reads++;
      return null;
    },
    write() {},
  });
  assert.equal(store.getServerSnapshot(), null);
  assert.equal(reads, 0);
  store.activate("en-US");
  assert.equal(store.getSnapshot(), null);
  store.activate("zh-CN");
  assert.deepEqual(store.getSnapshot(), { step: "translate", contentId: null });
  store.activate("en");
  assert.equal(store.getSnapshot(), null);
  store.activate("zh");
  assert.equal(store.getSnapshot().step, "translate");
});

test("settings cannot skip the first translation; only manual translation success advances", () => {
  const storage = device();
  const store = createTranslationGuideStore(storage);
  store.activate("zh");
  store.openSettings("course-a");
  assert.equal(store.getSnapshot().step, "translate");
  store.translated("course-a", false);
  assert.equal(store.getSnapshot().step, "translate");
  assert.equal(storage.read(), null);
  store.translated("course-b", true);
  assert.deepEqual(store.getSnapshot(), {
    step: "settings",
    contentId: "course-b",
  });
  assert.equal(storage.read(), "settings");
  store.translated("course-c", true);
  assert.equal(store.getSnapshot().contentId, "course-b");
});

test("closing a guided menu preserves progress; only explicit completion finishes it", () => {
  const storage = device("settings");
  const store = createTranslationGuideStore(storage);
  store.activate("zh");
  assert.equal(store.getSnapshot().step, "settings");
  store.openSettings("review");
  assert.deepEqual(store.getSnapshot(), {
    step: "preferences",
    contentId: "review",
  });
  store.closeSettings("other-course");
  assert.equal(store.getSnapshot().step, "preferences");
  store.closeSettings("review");
  assert.deepEqual(store.getSnapshot(), {
    step: "settings",
    contentId: "review",
  });
  assert.equal(storage.read(), "settings");
  store.completeSettings("review");
  assert.equal(store.getSnapshot().step, "settings");
  store.openSettings("review");
  store.completeSettings("other-course");
  assert.equal(store.getSnapshot().step, "preferences");
  store.completeSettings("review");
  assert.equal(store.getSnapshot(), null);
  const reloaded = createTranslationGuideStore(storage);
  reloaded.activate("zh");
  assert.equal(reloaded.getSnapshot(), null);
});

test("rapid toggles, outside dismissals, unmounts and late close callbacks cannot complete the guide", () => {
  const storage = device("settings");
  const store = createTranslationGuideStore(storage);
  store.activate("zh");
  for (let index = 0; index < 30; index++) {
    store.openSettings("course");
    assert.equal(store.isSettingsGuided("course"), true);
    store.closeSettings("course");
    store.closeSettings("course");
    store.completeSettings("course");
    assert.equal(storage.read(), "settings");
    assert.equal(store.getSnapshot().step, "settings");
  }
  store.openSettings("course");
  store.completeSettings("course");
  store.closeSettings("course");
  store.openSettings("course");
  assert.equal(store.getSnapshot(), null);
  assert.equal(storage.read(), "done");
});

test("exit guards reject carried clicks, repeated clicks and stale steps without blocking a later deliberate click", () => {
  let time = 0;
  const guard = createGuideExitGuard(() => time);
  guard.arm("translate");
  assert.equal(guard.accepts("translate", 1), false);
  time = 400;
  assert.equal(guard.accepts("translate", 2), false);
  guard.arm("settings");
  assert.equal(guard.accepts("translate", 1), false);
  assert.equal(guard.accepts("settings", 1), false);
  time = 800;
  guard.arm("settings");
  assert.equal(guard.accepts("settings", 1), true);
  assert.equal(guard.accepts("settings", 1), false);
  guard.arm("preferences");
  time = 1200;
  assert.equal(guard.accepts("preferences", 0), true);
});

test("skipping is permanent and cannot be undone by locale changes or late requests", () => {
  const storage = device();
  const store = createTranslationGuideStore(storage);
  store.activate("zh");
  store.dismiss();
  store.activate("en");
  store.activate("zh");
  store.translated("course", true);
  store.openSettings("course");
  assert.equal(store.getSnapshot(), null);
  assert.equal(storage.read(), "done");
});

test("blocked localStorage preserves completion for the current session", () => {
  const store = createTranslationGuideStore({
    read() {
      throw new Error("blocked");
    },
    write() {
      throw new Error("blocked");
    },
  });
  store.activate("zh");
  store.translated("course", true);
  store.activate("en");
  store.activate("zh");
  assert.equal(store.getSnapshot().step, "settings");
  store.dismiss();
  store.activate("zh");
  assert.equal(store.getSnapshot(), null);
});

test("completion and successful progress synchronize between tabs", () => {
  const storage = device();
  const first = createTranslationGuideStore(storage);
  const second = createTranslationGuideStore(storage);
  first.activate("zh");
  second.activate("zh");
  first.translated("course", true);
  second.sync();
  assert.equal(second.getSnapshot().step, "settings");
  first.dismiss();
  second.sync();
  assert.equal(second.getSnapshot(), null);
  second.activate("zh");
  assert.equal(second.getSnapshot(), null);
});

test("English pages ignore translation events and observers receive only changed snapshots", () => {
  const store = createTranslationGuideStore(device());
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);
  store.activate("en");
  store.translated("course", true);
  assert.equal(changes, 0);
  store.activate("zh");
  store.activate("zh");
  assert.equal(changes, 1);
  unsubscribe();
  store.dismiss();
  assert.equal(changes, 1);
});
