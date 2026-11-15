import assert from "node:assert/strict";
import { test } from "node:test";
import { webcrypto } from "node:crypto";
import { browserUuid } from "../../src/lib/uuid.ts";
test("UUIDs remain secure v4 values when randomUUID is missing, with no weak random fallback", () => {
  const fallback = {
      getRandomValues: webcrypto.getRandomValues.bind(webcrypto),
    },
    ids = new Set(Array.from({ length: 1000 }, () => browserUuid(fallback)));
  assert.equal(ids.size, 1000);
  for (const id of ids)
    assert.match(
      id,
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,
    );
  assert.throws(() => browserUuid({}), /Secure random values are unavailable/);
  const source = {
    randomUUID() {
      assert.equal(this, source);
      return "provided-native-value";
    },
  };
  assert.equal(browserUuid(source), "provided-native-value");
});
