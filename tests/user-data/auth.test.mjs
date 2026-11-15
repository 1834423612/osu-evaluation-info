import { userDataSchema } from "../../src/lib/user-data/namespace.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import {
  authBaseURL,
  authConfigured,
  authTablePrefix,
  authSchema,
  otpDigest,
} from "../../src/lib/auth/config.ts";
import { sameOrigin, readJson } from "../../src/lib/user-data/http.ts";
test("production authentication pins a clean HTTPS origin and rejects unsafe table names", () => {
  assert.equal(
    authBaseURL({
      NODE_ENV: "production",
      AUTH_BASE_URL: "http://site.example",
    }),
    null,
  );
  assert.equal(
    authBaseURL({
      NODE_ENV: "production",
      AUTH_BASE_URL: "https://user:secret@site.example",
    }),
    null,
  );
  assert.equal(
    authBaseURL({
      NODE_ENV: "production",
      AUTH_BASE_URL: "https://site.example/?token=x",
    }),
    null,
  );
  assert.equal(
    authBaseURL({
      NODE_ENV: "production",
      AUTH_BASE_URL: "https://site.example",
    }),
    "https://site.example",
  );
  assert.equal(
    authConfigured({
      NODE_ENV: "production",
      AUTH_BASE_URL: "https://site.example",
      DATABASE_URL: "postgres://unused",
      BETTER_AUTH_SECRET: "short",
    }),
    false,
  );
  assert.throws(() =>
    authTablePrefix({ AUTH_TABLE_PREFIX: 'ca_";drop table user;--' }),
  );
  assert.notEqual(
    otpDigest("123456", "a".repeat(32)),
    otpDigest("123456", "b".repeat(32)),
  );
});
test("business mutations require the pinned origin and JSON rather than forged forwarding headers", () => {
  const origin = authBaseURL() ?? "http://localhost:3000";
  assert.throws(() =>
    sameOrigin(
      new Request(origin + "/api/test", {
        method: "POST",
        headers: {
          Origin: "https://evil.example",
          "Content-Type": "application/json",
          "X-Forwarded-Host": new URL(origin).host,
        },
      }),
    ),
  );
  assert.throws(() =>
    sameOrigin(
      new Request(origin + "/api/test", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "text/plain" },
      }),
    ),
  );
  sameOrigin(
    new Request(origin + "/api/test", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
    }),
  );
});
test("streaming JSON bodies are bounded even without Content-Length", async () => {
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(
        new TextEncoder().encode('{"value":"' + "x".repeat(2000) + '"}'),
      );
      c.close();
    },
  });
  const request = new Request("http://localhost", {
    method: "POST",
    body: stream,
    duplex: "half",
  });
  await assert.rejects(
    readJson(request, z.object({ value: z.string() }), 1024),
    (e) => e.status === 413,
  );
});

test("development identities and cloud data are isolated from production by default", () => {
  assert.equal(authTablePrefix({ NODE_ENV: "production" }), "");
  assert.equal(authTablePrefix({ NODE_ENV: "development" }), "");
  assert.equal(userDataSchema({ NODE_ENV: "production" }), "osu_identity");
  assert.equal(userDataSchema({ NODE_ENV: "development" }), "osu_identity_dev");
  assert.equal(
    userDataSchema({ NODE_ENV: "production", USER_DATA_SCHEMA: "isolated" }),
    "isolated",
  );
});

test("account schemas are explicit and validate identifiers", () => {
  assert.equal(authSchema({ NODE_ENV: "production" }), "osu_identity");
  assert.equal(authSchema({ NODE_ENV: "development" }), "osu_identity_dev");
  assert.throws(() => authSchema({ AUTH_SCHEMA: "unsafe;DROP" }));
});
