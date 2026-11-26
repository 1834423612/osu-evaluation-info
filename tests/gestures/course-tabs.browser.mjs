import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.BASE_URL ?? "http://127.0.0.1:3102";
const output = process.env.COURSE_TABS_OUTPUT ?? ".cache/course-tabs-browser";
await mkdir(output, { recursive: true });
const metric = {
  instrument: "SSLE",
  score: 4.2,
  unadjustedScore: 4.2,
  responseCount: 123,
  invitedCount: 180,
  responseRate: 68,
  sectionCount: 4,
  termCount: 2,
  firstTerm: "Autumn 2025",
  lastTerm: "Spring 2026",
  lastTermSortKey: 1262,
  weightedResponseCount: 100,
  confidence: "high",
  recommendation: "positive",
  trend: [],
};
const course = {
  id: "1268-ART-2000-COL",
  courseId: "001234",
  subject: "ART",
  subjectName: "Art",
  catalogNumber: "2000",
  title: "Encountering Contemporary Art",
  description: "Course description.",
  creditsMin: 3,
  creditsMax: 3,
  campus: "Columbus",
  campusCode: "COL",
  term: "Autumn 2026",
  termCode: "1268",
  academicCareer: "Undergraduate",
  attributes: [],
  sections: [],
  sectionsPartial: false,
  evaluation: {
    status: "available",
    primary: metric,
    metrics: [metric],
    instructors: [],
    source: {
      provider: "fixture",
      url: "https://osu.edu/",
      mode: "postgres",
      importedAt: null,
    },
    methodologyVersion: "response-decay-v1",
  },
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});

async function swipe(page, locator, direction) {
  const box = await locator.boundingBox();
  assert.ok(box);
  const x = box.x + box.width * (direction === "left" ? 0.8 : 0.2);
  const y = box.y + Math.min(box.height / 2, 25);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  for (let index = 1; index <= 8; index++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: x + (direction === "left" ? -1 : 1) * index * 12, y }],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await cdp.detach();
}

try {
  for (const width of (process.env.COURSE_TABS_WIDTHS ?? "1440,768,390,320")
    .split(",")
    .map(Number)) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: true,
      isMobile: width < 700,
      timezoneId: "Asia/Shanghai",
      reducedMotion: "reduce",
    });
    await context.addInitScript((course) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
    }, course);
    await context.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/catalog/course")
        return route.fulfill({
          json: {
            course,
            sourceMode: "official",
            source: "fixture",
            fetchedAt: new Date().toISOString(),
          },
        });
      if (url.pathname === "/api/rmp/summaries") {
        const body = route.request().postDataJSON();
        return route.fulfill({
          json: {
            summaries: Object.fromEntries(
              body.courses.map((item) => [
                item.id,
                {
                  status: "available",
                  identityBasis: "verified",
                  profileCount: 2,
                  tags: [],
                  difficulty: 3,
                  quality: 4,
                  qualityCount: 42,
                  difficultyCount: 42,
                  difficultyPeriod: "recent",
                  reviewCount: 42,
                  matchedInstructorCount: 2,
                  requestedInstructorCount: 2,
                  recentSince: "2024-01-01",
                },
              ]),
            ),
          },
        });
      }
      if (url.pathname === "/api/syllabus")
        return route.fulfill({
          json: {
            data: [],
            source: "fixture",
            fetchedAt: new Date().toISOString(),
          },
        });
      if (url.pathname === "/api/build-info") return route.continue();
      return route.fulfill({
        status: 503,
        json: { error: "Isolated browser fixture" },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/saved`, { waitUntil: "domcontentloaded" });
    await page.locator(".course-card").waitFor();
    await page
      .getByRole("button", {
        name: "Show historical course evaluations",
        exact: true,
      })
      .click();
    const details = page.locator(".course-details");
    await details.waitFor();
    const tabs = details.locator(".detail-tabs");
    await swipe(page, details.locator(".detail-note").first(), "left");
    await page.waitForFunction(
      () =>
        new URLSearchParams(location.search).get("detailTab") === "syllabus",
    );
    await page.waitForFunction(
      () =>
        document.querySelector('.detail-tabs [data-tab-value="syllabus"]')
          ?.dataset.state === "active",
    );
    assert.equal(
      await tabs
        .getByRole("tab", { name: "Syllabus", exact: true })
        .getAttribute("data-state"),
      "active",
    );
    await details.locator("[data-syllabus-reader]").waitFor();
    await swipe(
      page,
      details.locator('[data-state="active"][role="tabpanel"]').last(),
      "right",
    );
    await page.waitForFunction(
      () => new URLSearchParams(location.search).get("detailTab") === "ratings",
    );
    const sources = details.getByRole("tablist", {
      name: "Evaluation source",
      exact: true,
    });
    assert.match(await sources.innerText(), /123.*responses/s);
    await page.waitForFunction(() =>
      document
        .querySelector('.rating-source-tabs [role="tablist"]')
        ?.textContent.includes("42 reviews"),
    );
    for (const button of await sources.getByRole("tab").all()) {
      const box = await button.boundingBox();
      assert.ok(box.height >= 44 && box.width > 90);
    }
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      true,
    );
    await page.screenshot({
      path: `${output}/sources-${width}.png`,
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        width,
        sources: await sources.innerText(),
        swipedThroughSyllabus: true,
      }),
    );
    await context.close();
  }
} finally {
  await browser.close();
}
