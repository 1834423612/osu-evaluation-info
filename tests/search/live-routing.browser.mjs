import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  officialEndpointPlan,
  OFFICIAL_ENDPOINTS,
} from "../../src/lib/catalog/official-endpoints.ts";
import { normalizeOfficialCourse } from "../../src/lib/catalog/official-client.ts";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.SEARCH_TEST_BASE_URL ?? "http://localhost:3000",
  output = process.env.SEARCH_TEST_OUTPUT ?? "/tmp/osu-search-routing";
await mkdir(output, { recursive: true });
const raw = (number, title) => ({
  course: {
    courseId: "001234",
    offeringNumber: "1",
    subject: "CSE",
    subjectDesc: "Computer Science and Engineering",
    catalogNumber: number,
    title,
    description: "Course description.",
    campusCode: "COL",
    minUnits: 3,
    maxUnits: 3,
  },
  sections: [
    {
      classNumber: "12345",
      section: "0010",
      termCode: "1272",
      sessionCode: "1",
      courseOfferingNumber: 1,
      campus: "Columbus",
      component: "Lecture",
      meetings: [{ instructors: [] }],
    },
  ],
});
const official = raw("2221", "Official live Software I"),
  indexed = normalizeOfficialCourse(
    raw("1110", "Indexed close spelling"),
    "1272",
  );
const terms = [{ code: "1272", label: "Spring 2027" }];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let active;
try {
  for (const width of [390, 1440]) {
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
    page.setDefaultTimeout(20000);
    const calls = [],
      indexCalls = [],
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === new URL(base).origin &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.href === OFFICIAL_ENDPOINTS.terms)
        return route.fulfill({
          json: {
            data: {
              data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
            },
          },
        });
      if (
        url.origin === "https://content.osu.edu" &&
        url.pathname.endsWith("/search")
      ) {
        const q = url.searchParams.get("q");
        calls.push({ q, subject: url.searchParams.get("subject") });
        const found =
          q === "2221" && url.searchParams.get("subject") === "cse"
            ? [official]
            : [];
        return route.fulfill({
          json: {
            data: {
              courses: found,
              totalItems: found.length,
              totalPages: found.length ? 3 : 0,
              filters: [],
            },
          },
        });
      }
      if (url.origin !== new URL(base).origin)
        return route.fulfill({
          body: "",
          contentType: "application/javascript",
        });
      if (url.pathname === "/api/catalog/subjects")
        return route.fulfill({
          json: {
            filters: [
              {
                slug: "subject",
                items: [
                  { value: "CSE", label: "Computer Science and Engineering" },
                ],
              },
            ],
          },
        });
      if (url.pathname === "/api/catalog/search") {
        indexCalls.push(url.searchParams.get("q"));
        return route.fulfill({
          json: {
            courses: [indexed],
            sourceMode: "index",
            snapshotAt: "2026-11-13T12:00:00Z",
            fetchedAt: new Date().toISOString(),
            source: "snapshot",
            terms,
            filters: [],
            page: 1,
            nextCursor: null,
            hasMore: false,
            capped: false,
            totalCourses: 1,
            totalItems: 1,
            totalPages: 1,
            matchedSections: 1,
            evaluationStatus: "unavailable",
            searchInfo: {
              engine: "bm25-1",
              kind: "course",
              query: url.searchParams.get("q"),
              complete: true,
              suggestions: [],
            },
          },
        });
      }
      const resource = {
        "/api/catalog": "catalog",
        "/api/catalog/facets": "facets",
        "/api/catalog/course": "course",
        "/api/catalog/availability": "availability",
      }[url.pathname];
      if (resource)
        return route.fulfill({ json: officialEndpointPlan(resource) });
      if (
        url.pathname === "/api/evaluations" ||
        url.pathname === "/api/rmp/summaries"
      )
        return route.fulfill({ json: { summaries: {} } });
      if (url.pathname === "/api/build-info") return route.continue();
      return route.fulfill({
        json: { status: "no-data", instructors: [], results: [], data: [] },
      });
    });
    await page.goto(`${base}/?q=CS2221&term=1272&campus=col`, {
      waitUntil: "networkidle",
    });
    await page
      .locator(".course-card")
      .getByText("Official live Software I", { exact: true })
      .waitFor();
    assert.equal(
      indexCalls.length,
      0,
      "Fresh exact codes must not load the full index",
    );
    assert.equal(calls.filter((c) => c.q === "2221").length, 1);
    await page.screenshot({ path: `${output}/official-${width}.png` });
    await page.goto(`${base}/?q=CS1100&term=1272&campus=col`, {
      waitUntil: "networkidle",
    });
    await page
      .locator(".course-card")
      .getByText("Indexed close spelling", { exact: true })
      .waitFor();
    assert.deepEqual(indexCalls, ["CS1100"]);
    assert.equal(calls.filter((c) => c.q === "1100").length, 1);
    assert.equal(
      calls.filter((c) => c.q === "1110").length,
      0,
      "No official fanout for fuzzy alternatives",
    );
    assert.equal(new URL(page.url()).searchParams.get("q"), "CS1100");
    await page.screenshot({ path: `${output}/fallback-${width}.png` });
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log(
    "Live routing: CS -> CSE from metadata, one official exact request, empty-to-index fallback, no alternative fanout and 390/1440px passed",
  );
} catch (error) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
