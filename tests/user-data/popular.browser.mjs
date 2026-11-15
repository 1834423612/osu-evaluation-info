import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { snapshot } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  output = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/popular-browser",
  );
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const errors = [];
try {
  for (const [width, locale] of [
    [1440, "en"],
    [390, "zh"],
    [320, "en"],
  ]) {
    const c = await browser.newContext({ viewport: { width, height: 950 } });
    await c.addInitScript(
      (locale) => localStorage.setItem("course-atlas:locale:v1", locale),
      locale,
    );
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname === "/api/popular") {
        const kind = u.searchParams.get("kind");
        return r.fulfill({
          json: {
            asOf: new Date().toISOString(),
            items:
              kind === "instructor"
                ? []
                : [
                    {
                      key: "course:" + snapshot.items[0].payload.id,
                      kind: "course",
                      label: "MATH 1151 · Calculus I",
                      context: "Autumn 2026 · Columbus",
                      href: "/",
                      course: snapshot.items[0].payload,
                    },
                  ],
          },
        });
      }
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({
          status: 503,
          json: { error: "QA source unavailable" },
        });
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
    await p.goto(new URL("/popular", base).href);
    await p.getByRole("button", { name: /MATH 1151/ }).waitFor();
    assert.equal(
      await p.locator('[data-nav-group="explore"]').getAttribute("data-active"),
      "true",
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: output + "/list-" + width + ".png",
      fullPage: true,
    });
    await p.getByRole("button", { name: /MATH 1151/ }).click();
    await p
      .locator(".course-detail-panel, .course-detail-drawer")
      .waitFor({ state: "visible" });
    assert.equal(new URL(p.url()).pathname, "/popular");
    assert.equal(await p.locator(".search-bar").count(), 0);
    await p.keyboard.press("Escape");
    await p
      .locator(".course-detail-panel, .course-detail-drawer")
      .waitFor({ state: "hidden" });
    await p
      .getByRole("tab", {
        name: locale === "zh" ? "教师" : "Instructors",
        exact: true,
      })
      .click();
    await p
      .getByText(
        locale === "zh"
          ? "该学科暂无推荐"
          : "No recommendations in this subject yet",
        { exact: true },
      )
      .waitFor();
    assert.equal(await p.locator("[data-empty-result] img").count(), 1);
    await p.screenshot({ path: output + "/empty-" + width + ".png" });
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Popular favorites: bilingual 320/390/1440px, active navigation, in-place course drawers and empty states passed (APIs mocked)",
  );
} finally {
  await browser.close();
}
