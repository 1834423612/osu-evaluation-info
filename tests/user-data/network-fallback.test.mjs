import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupPublicNetwork,
  publicNetworkSchema,
} from "../../src/lib/telemetry/network.ts";
test("public network fallback rejects invalid responses and never sends credentials or retains precise coordinates", async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    return Response.json(
      calls.length === 1
        ? { ip: "not an IP", latitude: 12 }
        : {
            ip: "203.0.113.8",
            country_name: "Test",
            city: "City",
            latitude: 12,
            longitude: 34,
          },
    );
  };
  const result = await lookupPublicNetwork(fetcher);
  assert.equal(calls.length, 2);
  assert.equal(result.source, "ipapi");
  assert.equal(result.ip, "203.0.113.8");
  assert.equal(result.latitude, undefined);
  assert.ok(
    calls.every(
      ([, o]) =>
        o.credentials === "omit" &&
        o.referrerPolicy === "no-referrer" &&
        o.redirect === "error",
    ),
  );
  assert.equal(
    publicNetworkSchema.safeParse({ ...result, latitude: 12 }).success,
    false,
  );
});
test("network fallback remains bounded and supports the IP-only final provider", async () => {
  const calls = [];
  const result = await lookupPublicNetwork(async (url) => {
    calls.push(url);
    if (calls.length < 3) throw Error("unavailable");
    return Response.json({ ip: "2001:db8::1" });
  });
  assert.equal(result.source, "ipify");
  assert.equal(calls.length, 3);
  assert.equal(
    await lookupPublicNetwork(
      async () => new Response("unavailable", { status: 503 }),
    ),
    null,
  );
  const c = new AbortController();
  c.abort();
  assert.equal(
    await lookupPublicNetwork(() => {
      throw Error("must not fetch");
    }, c.signal),
    null,
  );
});

test("private and documentation addresses are never sent to a location provider", async () => {
  const { networkLocation } =
    await import("../../src/lib/user-data/location.ts");
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error("must not fetch");
  };
  try {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "192.168.1.2",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1",
      "203.0.113.1",
      "2001:db8::1",
    ])
      assert.equal(await networkLocation(ip), null);
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
  }
});
