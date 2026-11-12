import test from "node:test";
import assert from "node:assert/strict";
import {
  WORD_CLOUD_AUTO_KEY,
  readWordCloudAuto,
} from "../../src/lib/translation/word-cloud-preference.ts";

test("new and legacy users keep cloud auto-translation off until a dedicated explicit opt-in", () => {
  for (const value of [null, "false", "1", "TRUE", "broken"]) {
    const storage = {
      getItem: (key) => (key === WORD_CLOUD_AUTO_KEY ? value : "true"),
    };
    assert.equal(readWordCloudAuto(storage), false);
  }
  assert.equal(
    readWordCloudAuto({
      getItem: (key) => (key === WORD_CLOUD_AUTO_KEY ? "true" : "false"),
    }),
    true,
  );
  assert.equal(
    readWordCloudAuto({
      getItem: () => {
        throw Error("blocked");
      },
    }),
    false,
  );
});
