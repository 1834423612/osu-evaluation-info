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
await mkdir("/tmp/osu-reference-qa", { recursive: true });
try {
  for (const locale of ["en", "zh"])
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        reducedMotion: "reduce",
      });
      await context.addInitScript((locale) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
      }, locale);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/methodology`, { waitUntil: "networkidle" });
      await page
        .getByRole("heading", {
          name: locale === "zh" ? "数据与方法" : "Behind the data",
          exact: true,
        })
        .waitFor();
      assert.equal(await page.locator("main article section").count(), 5);
      assert.equal(await page.locator("main > ol > li").count(), 3);
      await page.screenshot({
        path: `/tmp/osu-reference-qa/methodology-${locale}-${width}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "No horizontal page overflow",
      );
      const toc = page.getByRole("navigation", {
        name: locale === "zh" ? "本页内容" : "On this page",
      });
      await toc.getByRole("link").last().click();
      assert(new URL(page.url()).hash === "#syllabi");
      await page
        .getByRole("button", {
          name: locale === "zh" ? "切换到英文" : "Switch to Chinese",
          exact: true,
        })
        .click();
      await page
        .getByRole("heading", {
          name: locale === "zh" ? "Behind the data" : "数据与方法",
          exact: true,
        })
        .waitFor();
      assert.equal(errors.length, 0, errors.join("\n"));
      await context.close();
    }
  console.log(
    "Methodology: both language articles, anchor navigation, locale switching and six screenshots passed",
  );
} finally {
  await browser.close();
}
