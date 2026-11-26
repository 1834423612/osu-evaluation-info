import test from "node:test";
import assert from "node:assert/strict";
import { signIngressProof } from "../../scripts/rmp/dev-ingress-proof.mjs";
import { rmpAdminAccess } from "../../src/lib/rmp/admin-auth.ts";
import { signDebugSession, DEBUG_COOKIE } from "../../src/lib/debug/server.ts";

const secret = "f".repeat(64),
  now = Date.now();
function request(host = "localhost:3000", headers = {}) {
  return new Request("http://" + host + "/api/admin/rmp", { headers });
}
test("development bypass requires a signed socket proof; Host and forwarded headers have no authority", () => {
  const env = { NODE_ENV: "development", RMP_DEV_INGRESS_SECRET: secret };
  for (const headers of [
    {},
    { "x-forwarded-for": "127.0.0.1", "x-forwarded-host": "localhost:3000" },
    { "x-rmp-ingress": "forged" },
  ])
    assert.equal(
      rmpAdminAccess(request("localhost:3000", headers), null, env, now),
      null,
    );
  for (const ip of [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
  ])
    assert.equal(
      rmpAdminAccess(
        request("localhost:3000", {
          "x-rmp-ingress": signIngressProof(
            ip,
            "GET",
            "/api/admin/rmp",
            secret,
            now,
          ),
        }),
        null,
        env,
        now,
      )?.development,
      true,
    );
  for (const ip of [
    "10.0.0.1",
    "192.168.1.2",
    "100.63.255.255",
    "100.128.0.1",
    "8.8.8.8",
  ])
    assert.equal(
      rmpAdminAccess(
        request("localhost:3000", {
          "x-rmp-ingress": signIngressProof(
            ip,
            "GET",
            "/api/admin/rmp",
            secret,
            now,
          ),
        }),
        null,
        env,
        now,
      ),
      null,
    );
  const proof = signIngressProof(
    "127.0.0.1",
    "GET",
    "/api/admin/rmp",
    secret,
    now,
  );
  assert.equal(
    rmpAdminAccess(
      request("localhost:3000", { "x-rmp-ingress": proof }),
      null,
      { ...env, NODE_ENV: "production" },
      now,
    ),
    null,
  );
  assert.equal(
    rmpAdminAccess(
      request("localhost:3000", { "x-rmp-ingress": proof }),
      null,
      env,
      now + 60000,
    ),
    null,
  );
});
test("a database administrator role cannot bypass account freshness, verification or the second unlock", () => {
  const env = { NODE_ENV: "production", DEV_DEBUG_KEY: secret };
  const account = {
    user: {
      id: "admin",
      email: "any-verified-account@example.edu",
      emailVerified: true,
    },
    session: { createdAt: new Date(now) },
  };
  const req = request("example.edu", {
    cookie: DEBUG_COOKIE + "=" + signDebugSession(now + 10000, secret),
  });
  assert.equal(
    rmpAdminAccess(req, account, env, now, true)?.actor,
    "account:admin",
  );
  assert.equal(rmpAdminAccess(request(), account, env, now, true), null);
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, user: { ...account.user, emailVerified: false } },
      env,
      now,
      true,
    ),
    null,
  );
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, session: { createdAt: new Date(now - 1800001) } },
      env,
      now,
      true,
    ),
    null,
  );
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, session: { createdAt: new Date(now + 1001) } },
      env,
      now,
      true,
    ),
    null,
  );
});
test("machine research tokens cannot use human admin access even on a verified development socket", () => {
  const env = { NODE_ENV: "development", RMP_DEV_INGRESS_SECRET: secret };
  const req = request("localhost:3000", {
    "x-rmp-ingress": signIngressProof(
      "127.0.0.1",
      "GET",
      "/api/admin/rmp",
      secret,
      now,
    ),
    authorization: "Bearer other, Bearer waho-rmp-ai_" + "x".repeat(43),
  });
  assert.equal(rmpAdminAccess(req, null, env, now), null);
});
test("production requires a current role, verified recent account and the existing administrator unlock", () => {
  const env = {
    NODE_ENV: "production",
    DEV_DEBUG_KEY: secret,
  };
  const account = {
    user: { id: "admin-id", email: "admin@example.edu", emailVerified: true },
    session: { createdAt: new Date(now) },
  };
  const req = request("example.edu", {
    cookie: DEBUG_COOKIE + "=" + signDebugSession(now + 10000, secret),
  });
  assert.equal(
    rmpAdminAccess(req, account, env, now, true)?.actor,
    "account:admin-id",
  );
  assert.equal(rmpAdminAccess(request(), account, env, now), null);
  assert.equal(rmpAdminAccess(req, account, env, now, false), null);
  assert.equal(rmpAdminAccess(req, null, env, now), null);
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, user: { ...account.user, emailVerified: false } },
      env,
      now,
    ),
    null,
  );
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, user: { ...account.user, email: "other@example.edu" } },
      env,
      now,
    ),
    null,
  );
  assert.equal(
    rmpAdminAccess(
      req,
      { ...account, session: { createdAt: new Date(now - 1800001) } },
      env,
      now,
    ),
    null,
  );
});
