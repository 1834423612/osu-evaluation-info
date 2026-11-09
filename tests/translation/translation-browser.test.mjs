import assert from "node:assert/strict";
import test from "node:test";
import { translateInBrowser } from "../../src/lib/translation/browser.ts";

test("ready Chrome model translates and releases local resources", async () => {
  let destroyed = false;
  let language;
  const result = await translateInBrowser(
    "Hello",
    "en",
    "zh-CN",
    () => {},
    false,
    {
      availability: async () => "available",
      create: async (options) => {
        language = options.targetLanguage;
        return {
          translate: async () => "你好",
          destroy: () => {
            destroyed = true;
          },
        };
      },
    },
  );
  assert.equal(result, "你好");
  assert.equal(language, "zh");
  assert.equal(destroyed, true);
});

test("automatic mode never triggers a model download", async () => {
  for (const availability of ["unavailable", "downloadable", "downloading"]) {
    const result = await translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      () => {},
      false,
      {
        availability: async () => availability,
        create: async () => {
          throw Error("Automatic mode must not create a missing model");
        },
      },
    );
    assert.equal(result, null);
  }
});

test("direct clicks create a model synchronously while user activation is present", async () => {
  let created = false;
  const result = translateInBrowser("你好", "zh", "en", () => {}, true, {
    availability: async () => "downloadable",
    create: async () => {
      created = true;
      return { translate: async () => "Hello" };
    },
  });
  assert.equal(created, true);
  assert.equal(await result, "Hello");
});

test("local timeout releases late model instances and invalid results fall back", async () => {
  let release;
  let destroyed = false;
  await assert.rejects(
    translateInBrowser(
      "Hello",
      "en",
      "zh-CN",
      () => {},
      true,
      {
        availability: async () => "available",
        create: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
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
    await translateInBrowser("Hello", "en", "zh-CN", () => {}, false, {
      availability: async () => "available",
      create: async () => ({ translate: async () => "Hello" }),
    }),
    null,
  );
});
