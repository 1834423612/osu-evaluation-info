import assert from "node:assert/strict";
import { test } from "node:test";
import vm from "node:vm";
import {
  analyticsAssetUrl,
  analyticsBeforeSend,
  captureLinkCapability,
  parseAnalyticsPreference,
  safeSearchTerm,
} from "../../src/lib/analytics/privacy.ts";

test("versioned collector URLs retain proxy parameters and reject script schemes", () => {
  assert.equal(
    analyticsAssetUrl("https://stats.example/script.js?proxy=1&v=old"),
    "https://stats.example/script.js?proxy=1&v=3.5.0",
  );
  assert.equal(analyticsAssetUrl("javascript:alert(1)"), "");
  for (const raw of [null, "{}", '{"enabled":true}', "invalid"])
    assert.equal(parseAnalyticsPreference(raw).replay, true);
  assert.equal(parseAnalyticsPreference('{"replay":false}').replay, false);
  assert.deepEqual(parseAnalyticsPreference(null), {
    enabled: true,
    replay: true,
  });
});
function send(payload, { path = "/", setting = null, dnt = "0" } = {}) {
  return vm.runInNewContext(
    `(${analyticsBeforeSend.toString()})("error", payload)`,
    {
      window: {},
      location: { pathname: path, origin: "https://site.example" },
      navigator: { doNotTrack: dnt },
      localStorage: { getItem: () => setting },
      URL,
      URLSearchParams,
      payload,
    },
  );
}
test("serialized bootstrap removes secrets from errors, URLs, hashes and nested tags", () => {
  const value = send({
    url: "https://site.example/?q=private&utm_source=test#token=secret",
    message: "student@example.com",
    tags: { token: "secret", feature: "search" },
    filename: "https://site.example/app.js?code=secret",
  });
  assert.equal(value.url, "https://site.example/?utm_source=test");
  assert.equal(value.message, "[email]");
  assert.equal(value.tags.token, undefined);
  assert.equal(value.tags.feature, "search");
  assert.equal(value.filename, "https://site.example/app.js");
  assert.ok(!JSON.stringify(value).includes("secret"));
});
test("all application routes allow collection while explicit opt-outs and DNT cancel it", () => {
  for (const path of [
    "/saved",
    "/account",
    "/share/abc",
    "/transfer",
    "/history",
    "/diagnostics",
  ])
    assert.notEqual(send({}, { path }), false);
  assert.equal(send({}, { setting: '{"enabled":false}' }), false);
  assert.equal(send({}, { dnt: "1" }), false);
});
test("search terms redact likely credentials and email rather than copying them", () => {
  assert.equal(safeSearchTerm("student@example.com"), "[redacted]");
  assert.equal(safeSearchTerm("token=secret"), "[redacted]");
  assert.equal(safeSearchTerm(" MATH   1151 "), "MATH 1151");
});

test("capability fragments are captured before collection and removed from the browser URL", () => {
  const captured = new Map(),
    location = {
      pathname: "/share/11111111-1111-4111-8111-111111111111",
      search: "",
      hash: "#k=" + "a".repeat(43),
    };
  let replaced = "";
  const window = {};
  vm.runInNewContext("(" + captureLinkCapability.toString() + ")()", {
    window,
    location,
    URLSearchParams,
    sessionStorage: { setItem: (k, v) => captured.set(k, v) },
    history: {
      state: null,
      replaceState: (_s, _t, url) => {
        replaced = url;
      },
    },
  });
  assert.equal(captured.size, 1);
  assert.equal(window.__WAHO_LINK_CAPABILITY__.capability, "a".repeat(43));
  assert.equal(replaced, location.pathname);
  assert.ok(!replaced.includes("#"));
});

test("startup events wait for one visit token, remain bounded, and honor opt-outs while waiting", async () => {
  let cache,
    setting = null;
  const callbacks = [],
    window = { umami: { getSession: () => ({ cache }) } },
    localStorage = { getItem: () => setting };
  const context = vm.createContext({
    window,
    localStorage,
    navigator: { doNotTrack: "0" },
    Date,
    setTimeout: (fn) => callbacks.push(fn),
    URL,
    URLSearchParams,
    location: { origin: "https://example.com" },
  });
  const send = vm.runInContext(
    "(" + analyticsBeforeSend.toString() + ")",
    context,
  );
  assert.equal(send("event", { name: "first" }).name, "first");
  const waiting = send("event", { name: "second" });
  assert.equal(typeof waiting.then, "function");
  assert.equal(window.__COURSE_ATLAS_UMAMI_STARTING__.waiting, 1);
  cache = "one-visit-token";
  callbacks.shift()();
  assert.equal((await waiting).name, "second");
  assert.equal(window.__COURSE_ATLAS_UMAMI_STARTING__.waiting, 0);
  cache = undefined;
  const pending = Array.from({ length: 100 }, () =>
    send("event", { name: "bounded" }),
  );
  assert.equal(send("event", { name: "overflow" }), false);
  setting = '{"enabled":false}';
  while (callbacks.length) callbacks.shift()();
  assert.ok((await Promise.all(pending)).every((x) => x === false));
  assert.equal(window.__COURSE_ATLAS_UMAMI_STARTING__.waiting, 0);
});

test("private planning suppresses all analytics payloads", () => {
  assert.equal(
    send({ message: "private PDF text" }, { path: "/planning" }),
    false,
  );
  assert.equal(send({ url: "private" }, { path: "/planning/review" }), false);
});
