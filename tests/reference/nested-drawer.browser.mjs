import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.GUIDE_TEST_OUTPUT ?? "/tmp/osu-reference-nested-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const section = {
  id: "12345",
  classNumber: "12345",
  section: "0010",
  component: "Lecture",
  instructionMode: "Distance Learning",
  enrollmentStatus: "",
  enrollmentTotal: null,
  waitlistTotal: null,
  session: "Full Term",
  sessionCode: "1",
  instructors: [],
  meetings: [],
};
const course = {
  id: "1272-CSE-2221-COL",
  courseId: "012345",
  subject: "CSE",
  subjectName: "Computer Science",
  catalogNumber: "2221",
  title: "Software I",
  description: "Software components.",
  creditsMin: 4,
  creditsMax: 4,
  campus: "Columbus",
  campusCode: "COL",
  term: "Spring 2027",
  termCode: "1272",
  academicCareer: "Undergraduate",
  attributes: [],
  sections: [section],
  sectionsPartial: false,
};
let active;
try {
  for (const locale of ["en", "zh"])
    for (const [width, height] of [
      [320, 700],
      [390, 844],
      [768, 1024],
      [1440, 900],
      [844, 390],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        reducedMotion: "reduce",
        isMobile: width < 700,
        hasTouch: width < 700,
      });
      await context.addInitScript(
        ({ course, locale }) => {
          localStorage.setItem("course-atlas:locale:v1", locale);
          localStorage.setItem("course-atlas:translation-guide:v1", "done");
          localStorage.setItem(
            "course-atlas:saved:v1",
            JSON.stringify([course]),
          );
        },
        { course, locale },
      );
      const page = await context.newPage();
      active = page;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/build-info") return route.continue();
        if (url.pathname === "/api/catalog/course")
          return route.fulfill({
            json: {
              course: {
                ...course,
                title: "Software I revised",
                description: "Updated software description.",
                archive: {
                  reason: "not-in-latest-snapshot",
                  snapshotAt: "2026-11-13T12:00:00Z",
                },
              },
              complete: true,
              sourceMode: "mirror",
              snapshotAt: "2026-11-13T12:00:00Z",
              fetchedAt: new Date().toISOString(),
              source: "fixture",
            },
          });
        if (
          url.pathname === "/api/rmp/summaries" ||
          (url.pathname === "/api/evaluations" &&
            route.request().method() === "POST")
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
            results: [],
            metrics: [],
            filters: [],
            primary: null,
            source: {},
          },
        });
      });
      await page.goto(`${base}/saved`, { waitUntil: "networkidle" });
      await page
        .locator('[data-analytics-action="course_open"]')
        .first()
        .click();
      await page
        .getByRole("tab", {
          name: locale === "zh" ? "开课班次" : "Class sections",
          exact: true,
        })
        .waitFor();
      await page
        .getByRole("heading", { name: "Software I revised", exact: true })
        .waitFor();
      await page
        .getByText(
          locale === "zh"
            ? "最近目录未收录 · 显示已保存课程"
            : "Not in the latest catalog · Showing the saved course",
          { exact: true },
        )
        .waitFor();
      for (const topic of ["components", "instruction-modes"]) {
        const trigger = page
          .locator(`[data-reference-info="${topic}"]`)
          .first();
        await trigger.click();
        const drawer = page.locator("[data-reference-drawer]");
        await drawer.waitFor();
        const rect = await drawer.boundingBox();
        assert(
          rect.x >= -1 &&
            rect.y >= -1 &&
            rect.x + rect.width <= width + 1 &&
            rect.y + rect.height <= height + 1,
          `${locale}/${width}/${height}: drawer inside viewport ${JSON.stringify(rect)}`,
        );
        assert(await drawer.getByRole("button").first().isVisible());
        const source = drawer.locator("[data-reference-content] a").last();
        await source.scrollIntoViewIfNeeded();
        assert(await source.isVisible());
        const sourceBox = await source.boundingBox();
        assert(
          sourceBox.y >= 0 && sourceBox.y + sourceBox.height < height - 30,
        );
        await drawer
          .locator("[data-reference-content]")
          .evaluate((e) => (e.parentElement.scrollTop = 0));
        assert(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        );
        await page.screenshot({
          path: `${output}/${locale}-${width}x${height}-${topic}.png`,
        });
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        assert(
          await trigger.isVisible(),
          "closing help preserves course panel",
        );
        await page.waitForFunction(
          (topic) =>
            document.activeElement?.matches(`[data-reference-info="${topic}"]`),
          topic,
          { timeout: 3000 },
        );
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log(
    "Nested reference panels: bilingual phone/tablet/desktop/landscape bounds, scrolling, Escape and focus passed",
  );
} catch (error) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
