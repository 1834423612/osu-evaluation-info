import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  officialEndpointPlan,
  OFFICIAL_ENDPOINTS,
} from "../../src/lib/catalog/official-endpoints.ts";
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
const filters = [
  {
    slug: "subject",
    title: "Subject",
    items: [
      "Art",
      "Computer Science",
      "Mathematics",
      "English",
      "History",
      "Biology",
      "Physics",
      "Chemistry",
      "Psychology",
    ].map((title, index) => ({ term: title, title, count: 120 - index * 10 })),
  },
  {
    slug: "instruction-mode",
    title: "Instruction mode",
    items: [
      "In Person",
      "Hybrid",
      "Distance Enhanced",
      "Distance Learning",
    ].map((title) => ({ term: title, title, count: 20 })),
  },
  {
    slug: "component",
    title: "Component",
    items: ["Lecture", "Recitation", "Laboratory", "Seminar"].map((title) => ({
      term: title,
      title,
      count: 20,
    })),
  },
];
try {
  for (const width of [390, 768, 1440]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      isMobile: width < 700,
      hasTouch: width < 700,
      reducedMotion: "reduce",
    });
    await context.addInitScript(() => {
      localStorage.setItem("course-atlas:locale:v1", "zh");
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === new URL(base).origin &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (["/api/build-info"].includes(url.pathname)) return route.continue();
      if (url.href === OFFICIAL_ENDPOINTS.terms)
        return route.fulfill({
          json: {
            data: {
              data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
            },
          },
        });
      if (url.origin === "https://content.osu.edu")
        return route.fulfill({
          json: {
            data: { courses: [], totalItems: 0, totalPages: 0, filters },
          },
        });
      const resource = {
        "/api/catalog": "catalog",
        "/api/catalog/facets": "facets",
        "/api/catalog/course": "course",
      }[url.pathname];
      return route.fulfill({
        json: resource ? officialEndpointPlan(resource) : {},
      });
    });
    await page.goto(`${base}/?term=1272`, { waitUntil: "networkidle" });
    if (width < 1100)
      await page.getByRole("button", { name: "筛选", exact: true }).click();
    const facet = page.locator('[data-filter-facet="subject"]:visible');
    await facet.waitFor();
    const borders = await facet.evaluate((node) =>
      [
        node,
        node.querySelector(".filter-chip-list"),
        node.querySelector(".filter-all-option"),
      ].map((element) => getComputedStyle(element).borderBottomStyle),
    );
    assert.deepEqual(borders, ["solid", "solid", "dashed"]);
    await facet.getByRole("button", { name: /Art/ }).click();
    await facet.getByRole("button", { name: /Art/, pressed: true }).waitFor();
    assert.equal(
      await facet
        .getByRole("button", { name: /Art/ })
        .getAttribute("aria-pressed"),
      "true",
    );
    await page.screenshot({
      path: `${output}/filters-${width}.png`,
      fullPage: true,
    });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.equal(errors.length, 0, errors.join("\n"));
    await context.close();
  }
  console.log(
    "Filters: distinct facet, all-option and detail-list borders; selection and three viewport screenshots passed",
  );
} finally {
  await browser.close();
}
