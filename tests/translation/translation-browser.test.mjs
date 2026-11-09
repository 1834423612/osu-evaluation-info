import assert from "node:assert/strict";
import test from "node:test";
import {
  browserTranslationAvailability,
  downloadBrowserTranslationModel,
  modelDownloadProgress,
  translateInBrowser,
} from "../../src/lib/translation/browser.ts";

const translator = (availability = "available", overrides = {}) => ({
  availability: async () => availability,
  create: async () => ({ translate: async () => "你好" }),
  ...overrides,
});

test("feature and language-pair probes never create a translator or download a model", async () => {
  assert.equal(
    await browserTranslationAvailability("en", "zh-CN", undefined),
    "unsupported",
  );
  for (const state of [
    "available",
    "downloadable",
    "downloading",
    "unavailable",
  ]) {
    let creates = 0;
    const result = await browserTranslationAvailability(
      "en",
      "zh-CN",
      translator(state, {
        create: () => {
          creates++;
          throw Error("must not create");
        },
      }),
    );
    assert.equal(result, state);
    assert.equal(creates, 0);
  }
  assert.equal(
    await browserTranslationAvailability("en", "zh-CN", translator("invalid")),
    "unavailable",
  );
  assert.equal(
    await browserTranslationAvailability(
      "en",
      "zh-CN",
      translator("available", {
        availability: async () => {
          throw Error("policy denied");
        },
      }),
    ),
    "unavailable",
  );
});

test("ready Chrome model translates, normalizes the language code, and releases resources", async () => {
  let destroyed = false;
  let language;
  const result = await translateInBrowser(
    "Hello",
    "en",
    "zh-CN",
    translator("available", {
      create: async (options) => {
        language = options.targetLanguage;
        return {
          translate: async () => "你好",
          destroy: () => {
            destroyed = true;
          },
        };
      },
    }),
  );
  assert.equal(result, "你好");
  assert.equal(language, "zh");
  assert.equal(destroyed, true);
});

test("ordinary translation never creates a missing or downloading model", async () => {
  for (const state of ["unavailable", "downloadable", "downloading"]) {
    let creates = 0;
    const result = await translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      translator(state, {
        create: async () => {
          creates++;
          throw Error("Unconfirmed download");
        },
      }),
    );
    assert.equal(result, null);
    assert.equal(creates, 0);
  }
});

test("confirmed downloads create synchronously in the confirmation gesture and release the prepared session", async () => {
  let created = false;
  let destroyed = false;
  let language;
  const progress = [];
  const result = downloadBrowserTranslationModel(
    "zh",
    "en",
    (value) => progress.push(value),
    new AbortController().signal,
    translator("downloadable", {
      create: (options) => {
        created = true;
        language = options.targetLanguage;
        const monitor = new EventTarget();
        options.monitor(monitor);
        monitor.dispatchEvent(
          Object.assign(new Event("downloadprogress"), {
            loaded: 0.5,
            total: 1,
          }),
        );
        return Promise.resolve({
          translate: async () => "Hello",
          destroy: () => {
            destroyed = true;
          },
        });
      },
    }),
  );
  assert.equal(created, true);
  await result;
  assert.equal(language, "en");
  assert.equal(destroyed, true);
  assert.deepEqual(progress, [
    { fraction: 0.5, totalBytes: null, loadedBytes: null },
  ]);
});

test("normalized download progress is never presented as a one-byte model", () => {
  const event = (loaded, total) =>
    Object.assign(new Event("downloadprogress"), { loaded, total });
  assert.deepEqual(modelDownloadProgress(event(0.25, 1)), {
    fraction: 0.25,
    loadedBytes: null,
    totalBytes: null,
  });
  assert.deepEqual(modelDownloadProgress(event(1024, 4096)), {
    fraction: 0.25,
    loadedBytes: 1024,
    totalBytes: 4096,
  });
  assert.deepEqual(modelDownloadProgress(event(NaN, 0)), {
    fraction: null,
    loadedBytes: null,
    totalBytes: null,
  });
});

test("cancelling or timing out a download releases late translators and ignores late progress", async () => {
  for (const cancel of [false, true]) {
    let release;
    let destroyed = false;
    let monitor;
    let progress = 0;
    const controller = new AbortController();
    const result = downloadBrowserTranslationModel(
      "en",
      "zh-CN",
      () => progress++,
      controller.signal,
      translator("downloadable", {
        create: (options) => {
          monitor = new EventTarget();
          options.monitor(monitor);
          return new Promise((resolve) => {
            release = resolve;
          });
        },
      }),
      cancel ? 1000 : 5,
    );
    if (cancel) controller.abort();
    await assert.rejects(result, cancel ? /cancelled/ : /timed out/);
    monitor.dispatchEvent(
      Object.assign(new Event("downloadprogress"), { loaded: 0.5 }),
    );
    release({
      translate: async () => "你好",
      destroy: () => {
        destroyed = true;
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(destroyed, true);
    assert.equal(progress, 0);
  }
});

test("already-cancelled confirmations cannot initiate downloads", async () => {
  let creates = 0;
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    downloadBrowserTranslationModel(
      "en",
      "zh-CN",
      () => {},
      controller.signal,
      translator("downloadable", {
        create: () => {
          creates++;
        },
      }),
    ),
    { name: "AbortError" },
  );
  assert.equal(creates, 0);
});

test("translation timeouts release late instances and invalid results fall back", async () => {
  let release;
  let destroyed = false;
  await assert.rejects(
    translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      translator("available", {
        create: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      }),
      5,
    ),
    /timed out/,
  );
  release({
    translate: async () => "你好",
    destroy: () => {
      destroyed = true;
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(destroyed, true);
  assert.equal(
    await translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      translator("available", {
        create: async () => ({ translate: async () => "Hello" }),
      }),
    ),
    null,
  );
});
