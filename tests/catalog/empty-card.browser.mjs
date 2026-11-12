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
const items = ["1000", "1001", "1002"].map((catalogNumber) => ({
  course: {
    courseId: catalogNumber,
    offeringNumber: "1",
    subject: "MATH",
    subjectName: "Mathematics",
    catalogNumber,
    title: `Mathematics ${catalogNumber}`,
    description: "Foundations and practical applications of mathematics.",
    campusCode: "COL",
    minUnits: 3,
    maxUnits: 3,
  },
  sections: [
    {
      classNumber: catalogNumber,
      section: "0010",
      termCode: "1272",
      sessionCode: "1",
      courseOfferingNumber: 1,
      component: "Lecture",
      instructionMode: "In Person",
      meetings: [
        {
          instructors: [
            { displayName: "Alex Teacher", email: "teacher.1@osu.edu" },
          ],
        },
      ],
    },
  ],
}));
try {
  for (const locale of ["zh", "en"])
    for (const width of [390, 1440]) {
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
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/*", async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (
          url.origin === new URL(base).origin &&
          !url.pathname.startsWith("/api/")
        )
          return route.continue();
        if (url.pathname === "/api/build-info") return route.continue();
        if (url.href === OFFICIAL_ENDPOINTS.terms)
          return route.fulfill({
            json: {
              data: {
                data: [
                  { classSearch: "Y", strm: "1272", descr: "Spring 2027" },
                ],
              },
            },
          });
        if (url.origin === "https://content.osu.edu")
          return route.fulfill({
            json: {
              data: {
                courses: url.searchParams.get("q") === "nothing" ? [] : items,
                totalItems: url.searchParams.get("q") === "nothing" ? 0 : 3,
                totalPages: 1,
                filters: [],
              },
            },
          });
        const resource = {
          "/api/catalog": "catalog",
          "/api/catalog/facets": "facets",
          "/api/catalog/course": "course",
          "/api/catalog/availability": "availability",
        }[url.pathname];
        if (resource)
          return route.fulfill({ json: officialEndpointPlan(resource) });
        if (url.pathname === "/api/evaluations") {
          const { courses } = request.postDataJSON();
          return route.fulfill({
            json: {
              summaries: Object.fromEntries(
                courses.map((course) => [
                  course.id,
                  {
                    status:
                      course.catalogNumber === "1002"
                        ? "unavailable"
                        : "no-data",
                    primary: null,
                    metrics: [],
                    instructors: [],
                    source: { importedAt: null },
                    methodologyVersion: "response-decay-v1",
                  },
                ]),
              ),
            },
          });
        }
        if (url.pathname === "/api/rmp/summaries") {
          const { courses } = request.postDataJSON();
          return route.fulfill({
            json: {
              summaries: Object.fromEntries(
                courses.map((course) => [
                  course.id,
                  {
                    status:
                      course.catalogNumber === "1001"
                        ? "available"
                        : course.catalogNumber === "1002"
                          ? "unavailable"
                          : "no-data",
                    tags: [],
                    quality: null,
                    qualityCount: 0,
                    difficulty: null,
                    difficultyCount: 0,
                    difficultyPeriod: "none",
                    reviewCount: 0,
                    matchedInstructorCount: 0,
                    requestedInstructorCount: 1,
                    recentSince: "2024-11-12",
                  },
                ]),
              ),
            },
          });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto(`${base}/?term=1272`, { waitUntil: "networkidle" });
      const cards = page.locator(".course-card");
      await cards.nth(2).waitFor();
      for (const [index, message] of (locale === "zh"
        ? ["暂无匹配的课程评价", "暂无评价标签", "RMP 评价暂不可用"]
        : [
            "No matched course reviews yet",
            "No review tags yet",
            "RMP reviews are temporarily unavailable",
          ]
      ).entries()) {
        const card = cards.nth(index);
        await card.scrollIntoViewIfNeeded();
        await card.getByText(message, { exact: true }).waitFor();
        assert.equal(
          await card.locator(".brand-mascot").count(),
          0,
          "Empty course-card regions use text only",
        );
        assert(
          await card
            .getByText(
              locale === "zh"
                ? index === 2
                  ? "评分暂不可用"
                  : "暂无匹配评价"
                : index === 2
                  ? "Ratings unavailable"
                  : "No matched ratings",
              { exact: true },
            )
            .isVisible(),
        );
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `${output}/text-only-cards-${locale}-${width}.png`,
        fullPage: true,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.goto(`${base}/?term=1272&q=nothing`, {
        waitUntil: "networkidle",
      });
      await page.locator(".empty-results .brand-mascot").waitFor();
      assert.equal(errors.length, 0, errors.join("\n"));
      await context.close();
    }
  console.log(
    "Course cards: no data, unavailable ratings and missing tags use text only in both languages on mobile and desktop; page-level empty artwork remains",
  );
} finally {
  await browser.close();
}
