import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.RMP_QA_DIR ?? "/tmp/osu-rmp-course-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const evidence = [];
let active;
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      localStorage.setItem("course-atlas:locale:v1", "zh");
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
    });
    const page = await context.newPage();
    active = page;
    page.setDefaultTimeout(60000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === new URL(base).origin ||
        url.origin === "https://content.osu.edu"
      )
        return route.continue();
      return route.fulfill({ body: "", contentType: "text/plain" });
    });
    for (const query of ["MATH1131", "MATH1151", "BIOLOGY1101"]) {
      await page.goto(
        `${base}/?${new URLSearchParams({ q: query, term: "1272", campus: "mns" })}`,
        { waitUntil: "domcontentloaded" },
      );
      const card = page.locator(".course-card").first();
      await card.waitFor();
      await card.getByRole("button", { name: "查看课程历史评价" }).click();
      const responsePromise = page.waitForResponse(
        (r) => new URL(r.url()).pathname === "/api/rmp/course" && r.ok(),
      );
      await page
        .getByRole("tab", { name: "RMP · 学生评论", exact: true })
        .click();
      const response = await responsePromise;
      const summary = await response.json();
      assert.equal(summary.status, "available", query);
      const panel = page.locator("[data-analytics-area=rmp_reviews]");
      await panel.locator("[data-rmp-card]").first().waitFor();
      const reviewCount = summary.instructors.reduce(
        (n, row) => n + row.reviewCount,
        0,
      );
      assert(reviewCount > 0);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await panel.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/${query}-${width}.png` });
      evidence.push({
        width,
        query,
        campus: "MNS",
        status: summary.status,
        instructors: summary.matchedInstructorCount,
        reviewCount,
        api: response.status(),
      });
      console.log(
        `${width}px ${query}: ${reviewCount} course-specific reviews`,
      );
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  await writeFile(
    `${output}/browser-evidence.json`,
    JSON.stringify(evidence, null, 2),
  );
} catch (error) {
  if (active && !active.isClosed()) {
    await active.screenshot({ path: `${output}/failure.png` });
    await writeFile(
      `${output}/failure.txt`,
      (await active.locator("body").innerText()).slice(0, 14000),
    );
  }
  throw error;
} finally {
  await browser.close();
}
