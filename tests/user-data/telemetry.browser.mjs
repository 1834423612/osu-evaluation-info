import assert from "node:assert/strict";
import { snapshot } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  });
const received = new Map(),
  batches = [];
let loseResponse = true;
try {
  const c = await browser.newContext({
    viewport: { width: 1440, height: 950 },
  });
  await c.addInitScript((course) => {
    localStorage.setItem("course-atlas:locale:v1", "en");
    if (!localStorage.getItem("qa-seeded")) {
      localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
      localStorage.setItem("qa-seeded", "1");
    }
  }, snapshot.items[0].payload);
  await c.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
      return route.abort();
    if (url.pathname === "/api/telemetry") {
      const body = route.request().postDataJSON();
      batches.push(body);
      for (const e of body.events) received.set(e.id, e);
      assert.ok(!JSON.stringify(body).includes("example.1@osu.edu"));
      assert.ok(!JSON.stringify(body).includes("password"));
      if (loseResponse) {
        loseResponse = false;
        return route.abort();
      }
      return route.fulfill({
        json: {
          accepted: body.events.length,
          receipts: body.events.map((e) => e.id),
        },
      });
    }
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        json: { error: "QA service unavailable" },
      });
    return route.continue();
  });
  const page = await c.newPage();
  await page.goto(new URL("/saved", base).href);
  async function until(test) {
    const until = Date.now() + 20000;
    while (!test()) {
      if (Date.now() > until) throw Error("Telemetry condition timed out");
      await page.waitForTimeout(100);
    }
  }
  await until(() => batches.length >= 2);
  assert.equal(
    received.size,
    1,
    "lost responses and Strict Mode must not duplicate the page-view event",
  );
  assert.equal(batches[0].events[0].id, batches[1].events[0].id);
  const second = await c.newPage();
  await second.goto(new URL("/saved", base).href);
  await second.getByRole("button", { name: "Manage", exact: true }).waitFor();
  await page.getByRole("button", { name: "Manage", exact: true }).click();
  await page.getByRole("button", { name: /Select results/ }).click();
  await page.getByRole("button", { name: "Remove (1)", exact: true }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await until(() =>
    [...received.values()].some((e) => e.type === "favorite_add"),
  );
  await page.waitForTimeout(1200);
  assert.equal(
    [...received.values()].filter((e) => e.type === "favorite_add").length,
    1,
  );
  assert.equal(
    [...received.values()].filter((e) => e.type === "favorite_remove").length,
    1,
    "storage events in the second tab must not count the same action twice",
  );
  await page.getByRole("button", { name: "Calculus I", exact: true }).click();
  await page.locator(".course-detail-panel").waitFor({ state: "visible" });
  await until(() =>
    [...received.values()].some((e) => e.type === "course_open"),
  );
  const before = received.size;
  await page.evaluate(() => {
    localStorage.setItem("course-atlas:analytics:v1", '{"enabled":false}');
    window.dispatchEvent(new Event("course-atlas:analytics-change"));
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(3500);
  assert.equal(received.size, before);
  console.log(
    "Durable telemetry retries, Strict Mode deduplication, cross-tab save accounting, actual course opens and explicit opt-out passed (collector mocked)",
  );
} finally {
  await browser.close();
}
