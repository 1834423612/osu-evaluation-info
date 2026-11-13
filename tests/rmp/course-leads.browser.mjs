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
const base = process.env.RMP_TEST_BASE_URL ?? "http://localhost:3000",
  output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-leads-qa";
await mkdir(output, { recursive: true });
const course = {
  id: "1272-MATH-1131-MNS",
  courseId: "001234",
  subject: "MATH",
  subjectName: "Mathematics",
  catalogNumber: "1131",
  title: "Calculus for Business",
  description: "Business calculus.",
  creditsMin: 5,
  creditsMax: 5,
  campus: "Mansfield",
  campusCode: "MNS",
  term: "Spring 2027",
  termCode: "1272",
  academicCareer: "Undergraduate",
  attributes: [],
  sections: [],
  sectionsPartial: false,
};
let active;
try {
  for (const width of [320, 390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      isMobile: width < 700,
      hasTouch: width < 700,
      reducedMotion: "reduce",
    });
    await context.addInitScript((course) => {
      localStorage.setItem("course-atlas:locale:v1", "zh");
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
    }, course);
    const page = await context.newPage();
    active = page;
    page.setDefaultTimeout(30000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/**", (route) => {
      const url = new URL(route.request().url());
      if (
        url.pathname.startsWith("/api/rmp/") ||
        url.pathname === "/api/build-info"
      )
        return route.continue();
      if (url.pathname === "/api/catalog/course")
        return route.fulfill({
          json: {
            course,
            sourceMode: "official",
            complete: true,
            fetchedAt: new Date().toISOString(),
            source: "fixture",
          },
        });
      if (
        url.pathname === "/api/evaluations" &&
        route.request().method() === "POST"
      )
        return route.fulfill({ json: { summaries: {} } });
      if (url.pathname === "/api/syllabus")
        return route.fulfill({
          json: {
            data: [],
            source: "official-relay",
            fetchedAt: new Date().toISOString(),
          },
        });
      return route.fulfill({
        json: {
          status: "no-data",
          instructors: [],
          metrics: [],
          primary: null,
          source: {},
          results: [],
        },
      });
    });
    await page.goto(base + "/saved", { waitUntil: "networkidle" });
    await page.locator('[data-analytics-action="course_open"]').click();
    await page
      .getByRole("tab", { name: "教学评价与趋势", exact: true })
      .click();
    await page
      .getByRole("tab", { name: "RMP · 学生评论", exact: true })
      .click();
    const leads = page.locator('[data-analytics-area="rmp_reviews"]');
    const card = leads.locator('[data-professor-id="1117448"]');
    await card.waitFor();
    assert((await card.innerText()).includes("身份待确认"));
    assert.equal(await card.getAttribute("data-association"), "unconfirmed");
    await card
      .getByRole("button", { name: "查看 Pamela Foster 的评论", exact: true })
      .click();
    await card.locator("[data-rmp-review-content]").waitFor();
    assert((await card.innerText()).includes("课程评论"));
    const review = card.locator("[data-rmp-review]").first();
    await review.waitFor();
    assert((await review.innerText()).includes("帮助度"));
    assert((await review.innerText()).includes("清晰度"));
    const feedback = review.locator('[aria-label="RMP 原站反馈（只读）"]');
    assert.equal(await feedback.locator("button, a, input").count(), 0);
    const details = review.locator("summary");
    if (await details.count()) {
      await details.click();
      assert(await review.locator("details[open] dl").isVisible());
    }
    const link = card.getByRole("link", {
      name: "查看该教师全部课程评价",
      exact: true,
    });
    assert.equal(await link.getAttribute("href"), "/rmp/1117448");
    assert.equal(await link.getAttribute("target"), "_blank");
    await leads.scrollIntoViewIfNeeded();
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    const box = await leads.boundingBox();
    assert(box.x >= 0 && box.x + box.width <= width + 1);
    await page.screenshot({ path: `${output}/course-leads-${width}.png` });
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Inline RMP reviews: real Mansfield matches, unconfirmed identity, secondary profile links and 320/390/768/1440px layouts passed",
  );
} catch (error) {
  await active
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
