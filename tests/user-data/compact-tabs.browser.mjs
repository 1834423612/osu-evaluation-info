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
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/collections-browser",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  for (const [width, locale] of [
    [1440, "en"],
    [768, "en"],
    [390, "en"],
    [320, "zh"],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      errors = [];
    await context.addInitScript(
      ({ course, locale }) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        if (!localStorage.getItem("qa-seeded")) {
          localStorage.setItem(
            "course-atlas:saved:v1",
            JSON.stringify([
              course,
              {
                ...course,
                id: course.id + "-second",
                title: "Second course",
                catalogNumber: "1152",
              },
            ]),
          );
          localStorage.setItem("qa-seeded", "true");
        }
      },
      { course, locale },
    );
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (m.type() === "error" && /hydration|maximum update/i.test(m.text()))
        errors.push(m.text());
    });
    const t = (en, zh) => (locale === "zh" ? zh : en);
    await p.goto(new URL("/saved", base).href);
    const manager = p.locator("[data-saved-manager]");
    const button = (name) => manager.getByRole("button", { name, exact: true });
    // Category navigation must precede compact results in DOM and visual order.
    const categories = p.getByRole("tablist", {
      name: t("Saved categories", "收藏分类"),
    });
    await categories.waitFor();
    await button(t("Manage", "管理")).click();
    await button(t("Compact list", "简略列表")).click();
    const compact = manager.locator('section[class*="compactPanel"]');
    await compact.waitFor();
    for (const name of [
      t("Courses", "课程"),
      t("Sections", "班次"),
      t("Instructors", "教师"),
      t("Syllabi", "大纲"),
    ]) {
      await categories.getByRole("tab", { name: new RegExp(name) }).click();
      const navigationBox = await categories.boundingBox();
      const resultsBox = await compact.boundingBox();
      assert.ok(navigationBox && resultsBox);
      assert.ok(navigationBox.y + navigationBox.height <= resultsBox.y);
      assert.equal(
        await p.evaluate(() => {
          const tabs = document.querySelector('[role="tablist"]');
          const results = document.querySelector(
            'section[class*="compactPanel"]',
          );
          return !!(
            tabs.compareDocumentPosition(results) &
            Node.DOCUMENT_POSITION_FOLLOWING
          );
        }),
        true,
      );
    }
    await categories
      .getByRole("tab", { name: new RegExp(t("Courses", "课程")) })
      .click();
    await button(t("Card view", "卡片视图")).click();
    await compact.waitFor({ state: "hidden" });
    await button(t("Done", "完成")).click();
    assert.equal(
      await manager
        .getByRole("button", { name: t("Manage", "管理"), exact: true })
        .count(),
      1,
    );
    assert.deepEqual(errors, []);
    await p.screenshot({
      path: resolve(out, `compact-tabs-${width}-${locale}.png`),
      fullPage: true,
    });
    await context.close();
    console.log(`Compact category tabs passed: ${width}px ${locale}`);
  }
} finally {
  await browser.close();
}
