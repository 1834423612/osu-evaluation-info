import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000";
const output = "/tmp/osu-reference-qa";
await mkdir(output, { recursive: true });
let active;
try {
  for (const locale of ["en", "zh"])
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
        isMobile: width < 700,
        hasTouch: width < 700,
      });
      await context.addInitScript((locale) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
      }, locale);
      const page = await context.newPage();
      active = page;
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/reference#ssle`, { waitUntil: "networkidle" });
      const content = page.locator('[data-reference-content="ssle"]');
      await content.waitFor();
      assert.equal(
        await content.locator("section").first().locator("ol > li").count(),
        7,
      );
      assert.equal(
        await content.locator("section").last().locator("ol > li").count(),
        3,
      );
      assert.equal(
        await content.locator("section").nth(1).locator("ol > li").count(),
        5,
      );
      await page.screenshot({
        path: `${output}/reference-${locale}-${width}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${locale} ${width}: no horizontal overflow`,
      );
      const nav = page.getByRole("navigation", {
        name: locale === "zh" ? "浏览说明" : "Explore the guide",
      });
      await nav.locator('a[href="#sei"]').click();
      await page.locator('[data-reference-content="sei"]').waitFor();
      assert.equal(
        await page
          .locator('[data-reference-content="sei"] section')
          .first()
          .locator("ol > li")
          .count(),
        10,
      );
      await nav.locator('a[href="#scoring"]').click();
      await page.locator("details > summary").click();
      assert(await page.getByRole("math").isVisible());
      await page.screenshot({
        path: `${output}/formula-${locale}-${width}.png`,
        fullPage: true,
      });
      await page.goBack();
      await page.locator('[data-reference-content="sei"]').waitFor();
      await page
        .getByRole("button", {
          name: locale === "zh" ? "课程说明与数据方法" : "Guides and data",
          exact: true,
        })
        .click();
      assert.equal(await page.getByRole("menuitem").count(), 2);
      await page.screenshot({
        path: `${output}/resources-${locale}-${width}.png`,
      });
      await page
        .getByRole("menuitem", {
          name: locale === "zh" ? /数据与方法/ : /Behind the data/,
        })
        .click();
      await page.waitForURL("**/methodology");
      assert.equal(errors.length, 0, errors.join("\n"));
      await context.close();
    }
  console.log(
    "Reference: bilingual questionnaires and scales, deep links, back navigation, collapsible formula, menu and 320/390/768/1440px layouts passed",
  );
} catch (error) {
  await active
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
