import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { course } from "./fixtures.mjs";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/concurrent-saved",
  );
await mkdir(out, { recursive: true });
const courses = [
    { ...course, sections: [] },
    {
      ...course,
      id: "1268-MATH-1152-COL",
      catalogNumber: "1152",
      title: "Calculus II",
      sections: [],
    },
  ],
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  context = await browser.newContext();
try {
  await context.addInitScript((courses) => {
    const nativeSet = Storage.prototype.setItem,
      nativeGet = Storage.prototype.getItem,
      nativeRemove = Storage.prototype.removeItem;
    if (!nativeGet.call(localStorage, "qa:seeded")) {
      nativeSet.call(localStorage, "course-atlas:locale:v1", "en");
      nativeSet.call(
        localStorage,
        "course-atlas:saved:v1",
        JSON.stringify(courses),
      );
      nativeSet.call(localStorage, "qa:seeded", "1");
    }
    const tab = crypto.randomUUID(),
      seen = new WeakSet();
    let active = false;
    window.__qaSavedViolations = [];
    window.__qaSavedWrites = 0;
    const original = IDBObjectStore.prototype.get;
    const eventSetter = Object.getOwnPropertyDescriptor(
      IDBRequest.prototype,
      "onsuccess",
    ).set;
    IDBObjectStore.prototype.get = function (...args) {
      const req = original.apply(this, args),
        tx = this.transaction;
      if (this.name === "sync" && tx.mode === "readwrite" && !seen.has(tx)) {
        seen.add(tx);
        let handler;
        Object.defineProperty(req, "onsuccess", {
          configurable: true,
          get: () => handler,
          set: (fn) => {
            handler = fn;
            eventSetter.call(req, function (event) {
              const owner = nativeGet.call(
                localStorage,
                "qa:active-saved-writer",
              );
              if (owner && owner !== tab)
                window.__qaSavedViolations.push(
                  "overlapping saved transactions",
                );
              nativeSet.call(localStorage, "qa:active-saved-writer", tab);
              active = true;
              try {
                return fn.call(this, event);
              } finally {
                active = false;
                if (
                  nativeGet.call(localStorage, "qa:active-saved-writer") === tab
                )
                  nativeRemove.call(localStorage, "qa:active-saved-writer");
              }
            });
          },
        });
      }
      return req;
    };
    Storage.prototype.setItem = function (key, value) {
      if (
        this === localStorage &&
        (key.startsWith("course-atlas:saved-workspace:v1") ||
          [
            "course-atlas:saved:v1",
            "course-atlas:saved-sections:v1",
            "course-atlas:saved-instructors:v1",
            "course-atlas:saved-syllabi:v1",
          ].includes(key))
      ) {
        window.__qaSavedWrites++;
        if (!active)
          window.__qaSavedViolations.push("uncoordinated saved write");
      }
      return nativeSet.call(this, key, value);
    };
  }, courses);
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
      return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, json: { error: "QA isolated" } });
    return r.continue();
  });
  const a = await context.newPage(),
    b = await context.newPage(),
    errors = [];
  for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
  await a.setViewportSize({ width: 1440, height: 950 });
  await b.setViewportSize({ width: 390, height: 950 });
  await Promise.all([
    a.goto(new URL("/saved", base).href),
    b.goto(new URL("/saved", base).href),
  ]);
  const ids = () =>
    a.evaluate(() => {
      const w = JSON.parse(
        localStorage.getItem("course-atlas:saved-workspace:v1"),
      );
      return JSON.parse(w.records["course-atlas:saved:v1"])
        .map((x) => x.id)
        .sort();
    });
  for (let round = 0; round < 8; round++) {
    await Promise.all([
      a.getByRole("button", { name: "Unsave MATH 1151", exact: true }).click(),
      b.getByRole("button", { name: "Unsave MATH 1152", exact: true }).click(),
    ]);
    await Promise.all([
      a.getByRole("button", { name: "Undo", exact: true }).waitFor(),
      b.getByRole("button", { name: "Undo", exact: true }).waitFor(),
    ]);
    assert.deepEqual(await ids(), []);
    await Promise.all([
      a.getByRole("button", { name: "Undo", exact: true }).click(),
      b.getByRole("button", { name: "Undo", exact: true }).click(),
    ]);
    await Promise.all([
      a
        .getByRole("button", { name: "Unsave MATH 1151", exact: true })
        .waitFor(),
      b
        .getByRole("button", { name: "Unsave MATH 1152", exact: true })
        .waitFor(),
    ]);
    assert.deepEqual(await ids(), courses.map((c) => c.id).sort());
  }
  for (const p of [a, b]) {
    assert.deepEqual(await p.evaluate(() => window.__qaSavedViolations), []);
    assert.ok(await p.evaluate(() => window.__qaSavedWrites >= 16));
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  }
  assert.deepEqual(errors, []);
  await b.screenshot({ path: out + "/phone.png" });
  console.log(
    "Concurrent saves: 32 remove/undo commits across two tabs preserved both items; every write held the shared transaction",
  );
} finally {
  await context.close();
  await browser.close();
}
