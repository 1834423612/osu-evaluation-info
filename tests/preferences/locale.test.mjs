import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createLocalePreferenceStore,
  detectLocale,
} from "../../src/lib/preferences/locale.ts";

describe("first-visit language detection", () => {
  it("uses the first supported browser language, including Chinese variants", () => {
    for (const language of ["zh-CN", "zh-TW", "zh-Hant-HK", "zh_Hans", "ZH"]) {
      assert.equal(detectLocale({ languages: [language, "en-US"] }), "zh");
    }
    assert.equal(detectLocale({ languages: ["en-GB", "zh-CN"] }), "en");
    assert.equal(detectLocale({ languages: ["fr-FR", "zh-CN", "en"] }), "zh");
  });
  it("falls back to system language, legacy UA locale, then English", () => {
    assert.equal(detectLocale({ languages: [], systemLocale: "zh-TW" }), "zh");
    assert.equal(
      detectLocale({ languages: [], userAgent: "Mozilla/5.0 (Linux; zh-CN)" }),
      "zh",
    );
    assert.equal(
      detectLocale({ languages: [], userAgent: "Mozilla/5.0 (iPhone; CN)" }),
      "en",
    );
    assert.equal(detectLocale({ languages: ["fr-FR"] }), "en");
    assert.equal(
      detectLocale({ languages: ["en-US"], systemLocale: "zh-CN" }),
      "en",
    );
  });
});

function environment(initial = null, blocked = false) {
  let stored = initial;
  let changes = 0;
  let detections = 0;
  let applied;
  const store = createLocalePreferenceStore({
    read: () => {
      if (blocked) throw Error("Storage blocked");
      return stored;
    },
    write: (locale) => {
      if (blocked) throw Error("Storage blocked");
      stored = locale;
    },
    detect: () => {
      detections++;
      return "zh";
    },
    changed: () => {
      changes++;
    },
    apply: (locale) => {
      applied = locale;
    },
  });
  return {
    store,
    get stored() {
      return stored;
    },
    get changes() {
      return changes;
    },
    get detections() {
      return detections;
    },
    get applied() {
      return applied;
    },
  };
}

it("detects and persists once, shares the notice, and switches explicitly", () => {
  const env = environment();
  env.store.initialize();
  env.store.initialize();
  assert.equal(env.detections, 1);
  assert.equal(env.changes, 1);
  assert.equal(env.store.getLocale(), "zh");
  assert.deepEqual(env.store.getNotice(), { kind: "suggestion", locale: "zh" });
  assert.equal(env.stored, "zh");
  env.store.setLocale("en");
  assert.equal(env.store.getLocale(), "en");
  assert.equal(env.stored, "en");
  assert.equal(env.applied, "en");
  assert.deepEqual(env.store.getNotice(), {
    kind: "changed",
    locale: "en",
    previousLocale: "zh",
  });
  env.store.initialize();
  assert.equal(env.detections, 1);
});

it("preserves either stored preference with no automatic notice", () => {
  for (const locale of ["en", "zh"]) {
    const env = environment(locale);
    env.store.initialize();
    assert.equal(env.store.getLocale(), locale);
    assert.equal(env.store.getNotice(), null);
    assert.equal(env.detections, 0);
  }
});

it("replaces invalid preferences and dismisses without changing the language", () => {
  const env = environment("invalid");
  env.store.initialize();
  env.store.dismissNotice();
  assert.equal(env.store.getNotice(), null);
  assert.equal(env.stored, "zh");
  assert.equal(env.store.getLocale(), "zh");
});

it("keeps detection and manual switching usable when storage is blocked", () => {
  const env = environment(null, true);
  env.store.initialize();
  assert.equal(env.store.getLocale(), "zh");
  env.store.setLocale("en");
  assert.equal(env.store.getLocale(), "en");
  assert.deepEqual(env.store.getNotice(), {
    kind: "changed",
    locale: "en",
    previousLocale: "zh",
  });
});

it("keeps a successful switch available across page initialization and allows switching back", () => {
  const env = environment("en");
  env.store.initialize();
  env.store.setLocale("zh");
  const notice = env.store.getNotice();
  assert.deepEqual(notice, {
    kind: "changed",
    locale: "zh",
    previousLocale: "en",
  });
  env.store.initialize();
  assert.equal(
    env.store.getNotice(),
    notice,
    "the notice snapshot remains stable",
  );
  env.store.setLocale(notice.previousLocale);
  assert.equal(env.store.getLocale(), "en");
  assert.equal(env.stored, "en");
  assert.deepEqual(env.store.getNotice(), {
    kind: "changed",
    locale: "en",
    previousLocale: "zh",
  });
  env.store.dismissNotice();
  assert.equal(env.store.getNotice(), null);
  assert.equal(env.store.getLocale(), "en");
});

it("does not replace a success notice or send another change for the same locale", () => {
  const env = environment("en");
  env.store.initialize();
  env.store.setLocale("zh");
  const notice = env.store.getNotice();
  const changes = env.changes;
  env.store.setLocale("zh");
  assert.equal(env.store.getNotice(), notice);
  assert.equal(env.changes, changes);
});

it("persists an explicit initial choice even when it matches the default locale", () => {
  const env = environment();
  env.store.setLocale("en");
  env.store.initialize();
  assert.equal(env.store.getLocale(), "en");
  assert.equal(env.stored, "en");
  assert.equal(env.detections, 0);
  assert.equal(env.store.getNotice(), null);
});
