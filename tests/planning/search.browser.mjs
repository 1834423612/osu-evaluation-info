import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { emptyPlan, PLAN_STORAGE_KEY } from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { course } from "../user-data/fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.PLANNING_TEST_BASE_URL ?? "http://127.0.0.1:3000";
let plan = addPlanningCourse(
  emptyPlan(),
  { subject: "CSE", number: "2200" },
  "Spring2027",
  () => "search-family",
);
plan.semesters
  .find((s) => s.term === "Spring2027")
  .courses.push({
    ...plan.semesters.find((s) => s.term === "Spring2027").courses[0],
    id: "category-placeholder",
    subject: null,
    number: null,
    title: "Historical and Cultural Studies",
    kind: "placeholder",
  });
const variants = Array.from({ length: 8 }, (_, i) => ({
  ...course,
  id: `1272-CSE-2200.0${i + 1}-COL`,
  subject: "CSE",
  catalogNumber: `2200.0${i + 1}`,
  title: `Published variant ${i + 1}`,
  termCode: "1272",
  term: "Spring 2027",
  description: "Software methods. Prereq: MATH 1151.01.",
  sections: [],
}));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
await mkdir(".cache/search-browser", { recursive: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
        viewport: { width, height: 950 },
      }),
      errors = [],
      queries = [];
    await context.addInitScript(
      ({ plan, key }) => {
        localStorage.setItem(key, JSON.stringify(plan));
        localStorage.setItem("course-atlas:locale:v1", "en");
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
      },
      { plan, key: PLAN_STORAGE_KEY },
    );
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      if (u.origin !== new URL(base).origin) return route.abort();
      if (u.pathname === "/api/auth/get-session")
        return route.fulfill({ json: null });
      if (u.pathname === "/api/catalog/course") {
        const found = variants.find(
          (c) => c.catalogNumber === u.searchParams.get("catalog"),
        );
        return route.fulfill({
          status: found ? 200 : 404,
          json: { course: found ?? null },
        });
      }
      if (u.pathname === "/api/catalog/search") {
        queries.push(u.searchParams.get("q"));
        return route.fulfill({
          json: {
            sourceMode: "index",
            courses: variants,
            searchInfo: {
              engine: "bm25-2",
              query: u.searchParams.get("q"),
              kind: "course",
              suggestions: [],
              complete: true,
            },
            hasMore: false,
            nextCursor: null,
            terms: [],
            filters: [],
            totalCourses: 8,
            totalItems: 8,
            totalPages: 1,
            page: 1,
            evaluationStatus: "unavailable",
          },
        });
      }
      if (u.pathname === "/api/evaluations")
        return route.fulfill({ json: { summaries: {} } });
      if (u.pathname.startsWith("/api/"))
        return route.fulfill({
          status: 503,
          json: { error: "Isolated course search fixture" },
        });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.stack ?? e.message));
    await page.goto(base + "/planning");
    await page
      .locator('[data-analytics-area="planning_board"]')
      .getByRole("button", { name: "CSE 2200", exact: true })
      .first()
      .click();
    const details = page.locator(
      '[data-analytics-area="planning_course_details"]',
    );
    const family = details.getByRole("region", {
      name: "Available course variants",
    });
    await family.waitFor();
    assert.equal(await family.getByRole("button").count(), 8);
    await family.getByRole("button", { name: /CSE 2200.02/ }).click();
    await details
      .getByRole("heading", { name: "Published variant 2" })
      .waitFor();
    assert.ok(queries.includes("CSE 2200"));
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: `.cache/search-browser/family-${width}.png`,
    });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await page
      .getByRole("button", {
        name: "Select a course to fulfill this requirement",
      })
      .click();
    const search = page.locator('[data-analytics-area="planning_search"]');
    await search
      .getByRole("navigation", { name: "Search path" })
      .getByRole("button", { name: "All courses" })
      .click();
    assert.equal(
      await search.getByRole("navigation", { name: "Search path" }).count(),
      0,
    );
    const field = search.getByRole("searchbox", {
      name: "Course code or keyword",
    });
    await field.fill('prereq:"MATH 1151.01"');
    await search
      .locator("form")
      .getByRole("button", { name: "Search", exact: true })
      .click();
    await search.getByRole("button", { name: /^CSE 2200.01/ }).waitFor();
    assert.ok(queries.includes('prereq:"MATH 1151.01"'));
    await search.locator("[data-course-search-help] summary").click();
    await page.screenshot({
      path: `.cache/search-browser/advanced-${width}.png`,
    });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `Course family ${width}px: all eight decimal variants and exact selection passed`,
    );
  }
} finally {
  await browser.close();
}
