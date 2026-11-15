import assert from "node:assert/strict";
import { test } from "node:test";
import { rmpFavorite } from "../../src/lib/saved/rmp-profile.ts";
import {
  exchangeItemSchema,
  itemKey,
  itemHref,
  publicSnapshot,
} from "../../src/lib/saved/exchange.ts";
test("RMP favorites retain source IDs and ratings without merging equal names or inventing official course relations", () => {
  const profile = {
    id: "12345",
    name: "Same Name",
    username: null,
    department: "Math",
    campuses: ["MNS"],
    quality: 4.3,
    difficulty: 2.7,
    storedReviewCount: 19,
  };
  const a = exchangeItemSchema.parse({
      kind: "instructor",
      payload: rmpFavorite(profile),
    }),
    b = exchangeItemSchema.parse({
      kind: "instructor",
      payload: rmpFavorite({ ...profile, id: "98765", username: "name.1" }),
    });
  assert.notEqual(itemKey(a), itemKey(b));
  assert.equal(itemHref(a), "/rmp/12345");
  assert.deepEqual(a.payload.courses, []);
  assert.equal(a.payload.email, null);
  assert.equal(a.payload.rmp.quality, 4.3);
  assert.equal(a.payload.rmp.username, null);
  assert.equal(
    exchangeItemSchema.safeParse({
      ...a,
      payload: { ...a.payload, id: "name.1" },
    }).success,
    false,
  );
  const published = publicSnapshot({
    version: 1,
    title: "Teachers",
    createdAt: new Date().toISOString(),
    items: [a, b],
  });
  assert.equal(published.items[0].payload.rmp.id, "12345");
});
