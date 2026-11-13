import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.SYLLABUS_TEST_BASE_URL ?? "http://localhost:3000";
const output =
  process.env.SYLLABUS_TEST_OUTPUT ?? "/tmp/osu-syllabus-source-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let active;
try {
  for (const width of [320, 390, 768, 1440]) {
    for (const [subject, catalog] of [
      ["MATH", "1151"],
      ["HISTORY", "2231"],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        isMobile: width < 700,
        hasTouch: width < 700,
        reducedMotion: "reduce",
      });
      const result = await context.request.get(
        `${base}/api/catalog/course?mode=snapshot&subject=${subject}&catalog=${catalog}&term=1268&campus=COL`,
      );
      assert(result.ok());
      const payload = await result.json();
      const { course } = payload;
      const entries = await (
        await context.request.get(
          `${base}/api/syllabus?resource=entries&subject=${subject}&catalog=${catalog}&term=1268`,
        )
      ).json();
      const matched = entries.data.filter((e) =>
        course.sections.some((s) => s.classNumber === e.classNumber),
      );
      assert(matched.length > 0);
      let firstReadable;
      for (const entry of matched) {
        const response = await context.request.get(
          `${base}/api/syllabus?resource=document&code=${entry.code}`,
        );
        if (response.ok() && (await response.json()).data.components.length) {
          firstReadable = entry;
          break;
        }
      }
      assert(firstReadable);
      if (subject === "MATH")
        assert.notEqual(
          firstReadable.code,
          matched[0].code,
          "Regression course has an unreadable first index entry",
        );
      await context.addInitScript((course) => {
        localStorage.setItem("course-atlas:locale:v1", "zh");
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
        localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
      }, course);
      const page = await context.newPage();
      active = page;
      page.setDefaultTimeout(45000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://osu.simplesyllabus.com/**", (route) =>
        route.abort(),
      );
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (
          url.pathname === "/api/syllabus" ||
          url.pathname === "/api/build-info"
        )
          return route.continue();
        if (url.pathname === "/api/catalog/course")
          return route.fulfill({ json: payload });
        if (
          url.pathname === "/api/evaluations" ||
          url.pathname === "/api/rmp/preview"
        )
          return route.fulfill({ json: { summaries: {} } });
        return route.fulfill({
          json: {
            status: "no-data",
            instructors: [],
            metrics: [],
            primary: null,
            results: [],
            source: {},
          },
        });
      });
      await page.goto(base + "/saved", { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "教学大纲", exact: true }).click();
      await page
        .locator(
          `[data-syllabus-card="${firstReadable.code}"][data-selected="true"]`,
        )
        .waitFor();
      await page.locator("[data-syllabus-viewer] iframe").waitFor();
      const highlights = page.getByRole("region", { name: "大纲速览" });
      await highlights
        .getByRole("tab", { name: "课程安排", exact: true })
        .click();
      await highlights.scrollIntoViewIfNeeded();
      if (subject === "HISTORY") {
        const firstWeek = highlights.locator("ol > li").first();
        assert.equal(
          await firstWeek.locator(":scope > div > p").first().innerText(),
          "Introduction, Geography, and Sources",
        );
        assert((await firstWeek.innerText()).includes("August 25th"));
        assert((await firstWeek.innerText()).includes("August 27th"));
        await highlights.screenshot({
          path: `${output}/history-overview-${width}.png`,
        });
        await firstWeek.locator("summary").click();
        const link = firstWeek.getByRole("link", {
          name: "https://sourcebooks.fordham.edu/source/leo4-ind850.asp",
          exact: true,
        });
        assert.equal(
          await link.getAttribute("href"),
          "https://sourcebooks.fordham.edu/source/leo4-ind850.asp",
        );
        assert((await firstWeek.innerText()).includes("Jan Assmann"));
        await highlights.screenshot({
          path: `${output}/history-readings-${width}.png`,
        });
      } else {
        const missing = page.locator(
          `[data-syllabus-card="${matched[0].code}"]`,
        );
        assert.equal(await missing.getAttribute("data-available"), "false");
        assert.equal(
          await missing.locator('[role="radio"]').isDisabled(),
          true,
        );
        await highlights.screenshot({
          path: `${output}/math-schedule-${width}.png`,
        });
      }
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const box = await highlights.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      await page.screenshot({
        path: `${output}/${subject.toLowerCase()}-panel-${width}.png`,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log(
    "Real COL AU2026 MATH1151/HISTORY2231: first readable selection, dated readings/links and 320/390/768/1440px layouts passed",
  );
} catch (error) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
