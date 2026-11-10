import assert from "node:assert/strict";
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
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3101";
const item = {
  course: {
    courseId: "151332",
    offeringNumber: "1",
    subject: "CSE",
    subjectName: "Computer Science",
    catalogNumber: "1100",
    title: "Computing Fundamentals",
    description:
      "Learn programming and computational thinking through practical exercises.",
    campusCode: "COL",
    minUnits: 3,
    maxUnits: 3,
  },
  sections: [
    {
      classNumber: "15047",
      section: "0040",
      termCode: "1272",
      sessionCode: "1",
      courseOfferingNumber: 1,
      enrollmentStatus: "Open",
      meetings: [
        {
          instructors: [
            { displayName: "Alex Teacher", email: "teacher.1@osu.edu" },
          ],
        },
      ],
    },
  ],
};
const filters = [
  {
    slug: "subject",
    title: "Subject",
    items: ["CSE", "MATH", "CSFRST"].map((term) => ({
      term,
      title: term,
      count: 1,
    })),
  },
];
let active;
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    locale: "zh-CN",
    isMobile: true,
    hasTouch: true,
  });
  await context.addInitScript(() => {
    localStorage.setItem("course-atlas:locale:v1", "zh");
    localStorage.setItem("course-atlas:translation-model:v1", "ollama");
    localStorage.setItem("course-atlas:translation-guide:v1", "done");
  });
  const page = await context.newPage();
  active = page;
  page.setDefaultTimeout(12000);
  const errors = [],
    requests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(base).origin &&
      !url.pathname.startsWith("/api/")
    )
      return route.continue();
    if (url.pathname.startsWith("/api/debug/")) return route.continue();
    requests.push(url);
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
      const q = url.searchParams.get("q"),
        subject = url.searchParams.get("subject");
      const found = !q || (subject === "cse" && q === "1100") || q === "CSE";
      return route.fulfill({
        json: {
          data: {
            courses: found ? [item] : [],
            totalItems: found ? 1 : 0,
            totalPages: found ? 1 : 0,
            filters,
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
    if (url.pathname === "/api/evaluations")
      return route.fulfill({ json: { summaries: {} } });
    if (url.pathname === "/api/rmp/summaries") {
      const { courses } = request.postDataJSON();
      return route.fulfill({
        json: {
          summaries: Object.fromEntries(
            courses.map((c) => [
              c.id,
              {
                status: "available",
                tags: [{ tag: "Caring", count: 6 }],
                difficulty: 3,
                difficultyCount: 6,
                difficultyPeriod: "recent",
                reviewCount: 6,
                matchedInstructorCount: 1,
                requestedInstructorCount: 1,
                recentSince: "2024-01-01",
              },
            ]),
          ),
        },
      });
    }
    if (url.pathname === "/api/translate") {
      const { items } = request.postDataJSON();
      return route.fulfill({
        json: {
          version: 1,
          results: items.map((i) => ({
            id: i.id,
            target: i.target,
            status: "translated",
            provider: "ollama",
            cache: "miss",
            durationMs: 5,
            translation:
              i.text === "Caring" ? "关心学生" : "通过实践学习编程与计算思维。",
          })),
        },
      });
    }
    return route.fulfill({ json: {} });
  });
  for (const query of ["CS1100", "CS 1100", "CSED1100", "CS"]) {
    requests.length = 0;
    await page.goto(`${base}/?q=${encodeURIComponent(query)}&term=1272`, {
      waitUntil: "networkidle",
    });
    await page.locator("[data-related-search]").waitFor();
    assert(
      (await page.locator("[data-related-search]").innerText()).includes(query),
    );
    assert(
      (await page.locator(".course-code").first().innerText()).includes(
        "CSE 1100",
      ),
    );
    assert.equal(
      new URL(page.url()).searchParams.get("q"),
      query === "CS" ? "CSE" : "CSE 1100",
    );
    const searches = requests.filter(
      (u) =>
        u.origin === "https://content.osu.edu" &&
        u.pathname.endsWith("/search") &&
        u.searchParams.get("q"),
    );
    assert.equal(searches.length, 2, "one exact and one corrected search only");
    requests.length = 0;
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("[data-related-search]").waitFor();
    assert.equal(
      requests.filter(
        (u) =>
          u.origin === "https://content.osu.edu" &&
          u.pathname.endsWith("/search") &&
          u.searchParams.get("q"),
      ).length,
      1,
      "reload uses corrected query once",
    );
  }
  const input = page.getByRole("searchbox");
  await input.fill("CSE 1100");
  await input.press("Enter");
  await page.waitForFunction(
    () => !new URL(location.href).searchParams.has("relatedFrom"),
  );
  assert.equal(await page.locator("[data-related-search]").count(), 0);
  console.log(
    "PASS search: CS / CSED codes, compact and spaced numbers, clear correction notice, bounded requests and canonical reload",
  );

  await page.keyboard.press("Control+Alt+KeyD");
  await page
    .getByLabel("维护密钥", { exact: false })
    .fill(process.env.DEBUG_TEST_KEY ?? "local-regression-debug-key");
  await page.getByRole("button", { name: "解锁", exact: true }).click();
  await page.getByLabel("课程与筛选项", { exact: true }).waitFor();
  await page.reload({ waitUntil: "networkidle" }); // capture the normalized, current tab responses after authorization
  const cloud = page.locator("[data-rmp-cloud]").first();
  await cloud.locator("button").click();
  await cloud.locator('[data-cloud-word][lang="zh-CN"]').waitFor();
  for (const label of [
    "课程与筛选项",
    "班次座位",
    "翻译与模型下载",
    "Rate My Professors",
    "课程历史评价",
    "教师检索与头像",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page.getByRole("button", { name: "DEV", exact: true }).click();
  requests.length = 0;
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".course-card").waitFor();
  assert.equal(
    requests.filter(
      (u) =>
        u.pathname.startsWith("/api/") ||
        u.origin === "https://content.osu.edu",
    ).length,
    0,
    "paused services do not discover endpoints or contact upstream after reload",
  );
  await page.locator("[data-rmp-cloud]").first().locator("button").click();
  await page.locator('[data-cloud-word][lang="zh-CN"]').waitFor();
  assert.equal(
    requests.filter((u) => u.pathname.startsWith("/api/")).length,
    0,
    "paused translation replays per-word results",
  );
  await page.getByRole("button", { name: "DEV", exact: true }).click();
  await page.getByLabel("任何查询都找不到课程").check();
  requests.length = 0;
  await page.goto(`${base}/?q=CS1100&term=1272`, { waitUntil: "networkidle" });
  await page.locator(".empty-results").waitFor();
  assert.equal(await page.locator(".course-card").count(), 0);
  assert.equal(await page.locator("[data-related-search]").count(), 0);
  assert.equal(
    requests.filter(
      (u) =>
        u.pathname.startsWith("/api/") ||
        u.origin === "https://content.osu.edu",
    ).length,
    0,
    "mock empty overrides snapshots and prevents fuzzy fallback traffic",
  );
  await page.getByLabel("任何查询都找不到课程").uncheck();
  requests.length = 0;
  await page.goto(`${base}/?q=UNKNOWN9999&term=1272`, {
    waitUntil: "networkidle",
  });
  await page.locator(".error-state").waitFor();
  assert.equal(
    requests.filter(
      (u) =>
        u.pathname.startsWith("/api/") ||
        u.origin === "https://content.osu.edu",
    ).length,
    0,
    "missing snapshot remains paused",
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS debug: independent pauses persist across reload, normalized response and translation replay, no upstream requests, empty simulation overrides cached data",
  );
  await context.close();
} catch (error) {
  if (active && !active.isClosed())
    await active.screenshot({ path: "/tmp/search-debug-failure.png" });
  throw error;
} finally {
  await browser.close();
}
