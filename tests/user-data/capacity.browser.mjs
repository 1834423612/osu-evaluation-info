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
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/capacity-browser",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  c = await browser.newContext({ viewport: { width: 390, height: 900 } });
try {
  await c.addInitScript((course) => {
    localStorage.setItem("course-atlas:locale:v1", "en");
    localStorage.setItem(
      "course-atlas:saved:v1",
      JSON.stringify(
        Array.from({ length: 100 }, (_, i) => ({
          ...course,
          id: course.id + "-qa-" + i,
          sections: [],
        })),
      ),
    );
  }, course);
  await c.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
      return r.abort();
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, json: { error: "QA isolated" } });
    return r.continue();
  });
  const p = await c.newPage();
  await p.goto(new URL("/saved", base).href);
  await p
    .getByRole("button", { name: "Unsave MATH 1151", exact: true })
    .first()
    .click();
  await p.getByRole("button", { name: "Undo", exact: true }).waitFor();
  await p.evaluate((course) => {
    const key = "course-atlas:saved-workspace:v1",
      legacy = "course-atlas:saved:v1",
      old = localStorage.getItem(key),
      state = JSON.parse(old);
    const courses = JSON.parse(state.records[legacy]);
    if (courses.length !== 99) throw Error("Removal not committed");
    courses.push({ ...course, id: course.id + "-intervening", sections: [] });
    state.records[legacy] = JSON.stringify(courses);
    const next = JSON.stringify(state);
    localStorage.setItem(key, next);
    window.dispatchEvent(
      new StorageEvent("storage", { key, oldValue: old, newValue: next }),
    );
  }, course);
  await p.getByRole("button", { name: "Undo", exact: true }).click();
  await p.getByText("Collection is full (100).", { exact: true }).waitFor();
  assert.equal(
    await p.getByRole("button", { name: "Undo", exact: true }).count(),
    0,
  );
  const ids = await p.evaluate(() =>
    JSON.parse(
      JSON.parse(localStorage.getItem("course-atlas:saved-workspace:v1"))
        .records["course-atlas:saved:v1"],
    ).map((x) => x.id),
  );
  assert.equal(ids.length, 100);
  assert.ok(ids.some((id) => id.endsWith("-intervening")));
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.screenshot({ path: out + "/capacity-390.png" });
  console.log(
    "Capacity: failed undo preserves all existing favorites and shows an actionable error",
  );
} finally {
  await c.close();
  await browser.close();
}
