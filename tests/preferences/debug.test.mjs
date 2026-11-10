import assert from "node:assert/strict";
import test from "node:test";
import { createLogoTapSequence } from "../../src/lib/debug/flags.ts";
import {
  equalDebugKey,
  signDebugSession,
  validDebugSession,
  debugBypassRequest,
  DEBUG_COOKIE,
} from "../../src/lib/debug/server.ts";
import { localizedDocumentTitle } from "../../src/lib/brand.ts";

test("logo taps require seven quick presses and reset after an accidental pause", () => {
  const tap = createLogoTapSequence();
  assert.equal(tap(0), 1);
  assert.equal(tap(100), 2);
  assert.equal(tap(200), 3);
  assert.equal(tap(1500), 1);
  for (let index = 2; index <= 7; index++)
    assert.equal(tap(1500 + index * 100), index);
  assert.equal(tap(2300), 0);
});
test("debug sessions require the correct key, a valid signature, and an unexpired bounded lifetime", () => {
  const now = Date.now(),
    secret = "private-test-only-key";
  const token = signDebugSession(now + 1000, secret);
  assert(equalDebugKey(secret, secret));
  assert(!equalDebugKey("wrong", secret));
  assert(!equalDebugKey("", ""));
  assert(validDebugSession(token, secret, now));
  assert(!validDebugSession(token, "other", now));
  assert(!validDebugSession(token, secret, now + 2000));
  assert(!validDebugSession(token + ".junk", secret, now));
  assert(
    !validDebugSession(
      signDebugSession(now + 10 * 3_600_000, secret),
      secret,
      now,
    ),
  );
  const previousEnvironment = process.env.NODE_ENV,
    previousKey = process.env.DEV_DEBUG_KEY;
  process.env.NODE_ENV = "production";
  process.env.DEV_DEBUG_KEY = secret;
  assert(
    !debugBypassRequest(
      new Request("https://site.test/api", {
        headers: { "x-course-atlas-debug": "bypass" },
      }),
    ),
  );
  assert(
    debugBypassRequest(
      new Request("https://site.test/api", {
        headers: {
          "x-course-atlas-debug": "bypass",
          cookie: `${DEBUG_COOKIE}=${token}`,
        },
      }),
    ),
  );
  if (previousEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = previousEnvironment;
  if (previousKey === undefined) delete process.env.DEV_DEBUG_KEY;
  else process.env.DEV_DEBUG_KEY = previousKey;
});
test("document titles stay monolingual and follow route and language", () => {
  assert.equal(localizedDocumentTitle("en", "/"), "WahO! | OSU Course Atlas");
  assert.equal(localizedDocumentTitle("zh", "/"), "蛙O！ | OSU 课程信息汇总");
  assert.match(localizedDocumentTitle("en", "/saved"), /^Saved courses/);
  assert.match(localizedDocumentTitle("zh", "/methodology"), /^数据与方法/);
});
