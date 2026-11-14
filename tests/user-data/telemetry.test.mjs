import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import {
  productEventSchema,
  telemetryBatchSchema,
  telemetryPath,
  stableFavoriteKey,
} from "../../src/lib/telemetry/protocol.ts";
import { requestNetwork } from "../../src/lib/user-data/network.ts";
test("events retain only their typed fields and never copy query credentials or email search input", () => {
  const event = productEventSchema.parse({
    id: randomUUID(),
    type: "search",
    path: "/share/private#k=secret",
    term: "student@example.test",
    capturedAt: new Date().toISOString(),
    cookie: "secret",
    password: "secret",
  });
  assert.equal(event.path, "/share");
  assert.equal(event.term, "[redacted]");
  assert.equal(event.password, undefined);
  assert.equal(event.cookie, undefined);
  assert.equal(telemetryPath("/?q=token&key=secret"), "/");
  assert.equal(telemetryPath("/unknown/secret"), "/other");
  assert.throws(() =>
    telemetryBatchSchema.parse({ events: new Array(21).fill(event) }),
  );
});
test("ambiguous instructor names never become a cross-profile popularity identity", () => {
  assert.equal(stableFavoriteKey("instructor:Alex Smith"), null);
  assert.equal(
    stableFavoriteKey("instructor:smith.123"),
    "instructor:smith.123",
  );
  assert.equal(
    stableFavoriteKey("instructor:rmp:12345"),
    "instructor:rmp:12345",
  );
  assert.equal(
    stableFavoriteKey("course:1268-MATH-1151-COL"),
    "course:1268-MATH-1151-COL",
  );
});
test("network addresses require an explicitly trusted proxy header; arbitrary forwarding and lists are rejected", () => {
  const headers = new Headers({
    "x-forwarded-for": "203.0.113.1",
    "cf-connecting-ip": "2001:db8::1",
  });
  assert.equal(requestNetwork(headers, {}).address, null);
  assert.equal(
    requestNetwork(headers, {
      USER_DATA_TRUSTED_PROXY_HEADER: "cf-connecting-ip",
    }).address,
    "2001:db8::1",
  );
  headers.set("cf-connecting-ip", "203.0.113.1, 203.0.113.2");
  assert.equal(
    requestNetwork(headers, {
      USER_DATA_TRUSTED_PROXY_HEADER: "cf-connecting-ip",
    }).address,
    null,
  );
});
