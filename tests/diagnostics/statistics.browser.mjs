import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/statistics-browser",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  errors = [];
try {
  for (const [width, locale, authorized] of [
    [1440, "en", true],
    [768, "zh", true],
    [390, "zh", true],
    [320, "en", true],
    [390, "en", false],
  ]) {
    const c = await browser.newContext({ viewport: { width, height: 950 } });
    await c.addInitScript(
      (locale) => localStorage.setItem("course-atlas:locale:v1", locale),
      locale,
    );
    let calls = 0;
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname === "/api/debug/session")
        return r.fulfill({
          json: {
            authorized,
            configured: true,
            expiresAt: Date.now() + 3600000,
          },
        });
      if (u.pathname.startsWith("/api/admin/")) {
        calls++;
        if (!authorized)
          return r.fulfill({ status: 403, json: { error: "forbidden" } });
        if (u.pathname === "/api/admin/analytics")
          return r.fulfill({
            json: {
              asOf: new Date().toISOString(),
              totals: [
                { type: "page_view", count: "123" },
                { type: "search", count: "42" },
              ],
              searches: [{ query: "calclus 1151", submissions: "10" }],
              outcomes: [
                { status: "matches", count: "40" },
                { status: "no_matches", count: "2" },
              ],
              paths: [{ path: "/", views: "123" }],
              contexts: [
                {
                  id: "test",
                  user_agent: "Test browser " + "LongValue".repeat(100),
                  accept_language: "en-US,en;q=0.9",
                  language: "en-US",
                  languages: ["en-US", "en"],
                  time_zone: "America/New_York",
                  viewport: "small",
                  ip: "192.0.2.10",
                  network_source: "trusted-proxy:x-real-ip",
                  created_at: new Date().toISOString(),
                  environment: "production",
                },
              ],
              pageLinks: { links: "2", previews: "3", opens: "4" },
            },
          });
        if (u.pathname === "/api/admin/diagnostics/detail")
          return r.fulfill({
            json: {
              verification: "browser_reported",
              payload: { results: [{ id: "tz", value: "UTC" }] },
              observed_context: [],
            },
          });
        return r.fulfill({
          json: {
            items: [
              {
                id: "c48bea16-0f68-454c-8a24-057a11d41b25",
                captured_at: new Date().toISOString(),
                readings: 12,
                created_at: new Date().toISOString(),
              },
            ],
            next: null,
          },
        });
      }
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" &&
        !m.text().startsWith("Failed to load resource")
      )
        errors.push(m.text());
    });
    await p.goto(new URL("/admin/statistics", base).href);
    if (!authorized) {
      await p
        .getByRole("button", { name: "Unlock developer tools", exact: true })
        .waitFor();
      assert.equal(calls, 0);
      await c.close();
      continue;
    }
    await p.getByText("calclus 1151", { exact: true }).waitFor();
    await p.getByText("en-US · America/New_York", { exact: true }).click();
    await p.getByText("192.0.2.10", { exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: out + "/overview-" + width + ".png",
      fullPage: true,
    });
    await p.getByRole("button", { name: /12 (readings|项数据)/ }).click();
    await p.getByRole("dialog").waitFor();
    await p
      .getByRole("dialog")
      .getByText(/browser_reported/)
      .waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({ path: out + "/report-" + width + ".png" });
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Statistics: guarded loading, long request metadata, report preview, 1440/768/390/320 layouts passed",
  );
} finally {
  await browser.close();
}
