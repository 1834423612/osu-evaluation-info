import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const KEY = "course-atlas:translation-guide:v1";
let activePage;
const course = {
  id: "guide-course",
  subject: "CSE",
  subjectName: "Computer Science",
  catalogNumber: "2221",
  title: "Software I: Software Components",
  description:
    "Intellectual foundations of software engineering; design, implementation and testing of reusable software components. Learn the principles of modern software development through practical projects.",
  creditsMin: 4,
  creditsMax: 4,
  campus: "Columbus",
  campusCode: "col",
  term: "Spring 2027",
  termCode: "1272",
  academicCareer: "Undergraduate",
  attributes: [],
  sections: [],
  sectionsPartial: false,
};
const catalog = {
  courses: [
    course,
    {
      ...course,
      id: "guide-course-2",
      title: "Software II: Development and Design",
      catalogNumber: "2231",
      description:
        "Software development using design patterns, algorithms and data structures. Practice collaborative programming and learn how to build reliable software systems.",
    },
  ],
  page: 1,
  nextCursor: null,
  hasMore: false,
  totalItems: 2,
  matchedSections: 2,
  totalCourses: 2,
  totalPages: 1,
  capped: false,
  filters: [],
  terms: [{ code: "1272", label: "Spring 2027" }],
  source: "fixture",
  fetchedAt: new Date().toISOString(),
  evaluationStatus: "unavailable",
};

const evaluation = {
  status: "no-data",
  primary: null,
  metrics: [],
  instructors: [],
  source: { importedAt: null },
  methodologyVersion: "response-decay-v1",
};
const tags = [
  { tag: "Lots of homework", count: 18 },
  { tag: "Caring", count: 12 },
  { tag: "Tough grader", count: 9 },
  { tag: "Inspirational", count: 8 },
  { tag: "Clear grading criteria", count: 7 },
  { tag: "Accessible outside class", count: 6 },
  { tag: "Amazing lectures", count: 5 },
  { tag: "Respected", count: 4 },
  { tag: "Get ready to read", count: 2 },
  { tag: "Participation matters", count: 2 },
  { tag: "Test heavy", count: 1 },
  {
    tag: "A very long descriptive review tag that must stay completely readable without overflowing",
    count: 3,
  },
].sort((a, b) => b.count - a.count);
const insight = {
  status: "available",
  tags,
  difficulty: 3.4,
  difficultyCount: 120,
  difficultyPeriod: "recent",
  reviewCount: 245,
  matchedInstructorCount: 2,
  requestedInstructorCount: 2,
  recentSince: "2024-11-09",
};
const rmpSummary = {
  status: "available",
  recentSince: "2024-11-09",
  refreshedAt: "2026-11-09",
  matchedInstructorCount: 1,
  requestedInstructorCount: 2,
  instructors: [
    {
      professorId: "1",
      nameDotNumber: "teacher.1",
      name: "Alexandra Elizabeth Teacher",
      profileUrl: "https://www.ratemyprofessors.com/professor/1",
      reviewCount: 120,
      recentReviewCount: 80,
      recentQuality: 4.1,
      recentDifficulty: 3.4,
      recentDifficultyCount: 80,
      recentQualityCount: 80,
      latestReviewDate: "2026-11-09",
      topTags: tags,
      reviews: [],
    },
  ],
};
course.courseId = "012345";
course.courseIds = ["012345", "987654"];
course.evaluation = evaluation;
course.sections = [
  {
    id: "s1",
    classNumber: "12345",
    section: "0010",
    component: "Lecture",
    instructionMode: "In Person",
    enrollmentStatus: "",
    enrollmentTotal: null,
    waitlistTotal: null,
    session: "Regular Academic Session",
    sessionCode: "1",
    courseId: "012345",
    courseOfferingNumber: "1",
    termCode: "1272",
    campusCode: "COL",
    instructors: [
      { name: "Alexandra Elizabeth Teacher", email: "teacher.1@osu.edu" },
      {
        name: "Christopher Montgomery Instructor",
        email: "instructor.2@osu.edu",
      },
    ],
    meetings: [
      {
        days: [0, 2, 4],
        startTime: "09:10",
        endTime: "10:05",
        location: "Dreese Laboratories 0357",
        startDate: "2027-01-10",
        endDate: "2027-05-01",
      },
    ],
  },
  {
    id: "s2",
    classNumber: "12346",
    section: "0020",
    component: "Laboratory",
    instructionMode: "Hybrid Delivery",
    enrollmentStatus: "",
    enrollmentTotal: null,
    waitlistTotal: null,
    session: "Regular",
    sessionCode: "1",
    courseId: "012345",
    courseOfferingNumber: "1",
    termCode: "1272",
    campusCode: "COL",
    instructors: [
      { name: "Alexandra Elizabeth Teacher", email: "teacher.1@osu.edu" },
    ],
    meetings: [
      {
        days: [1, 3],
        startTime: "13:50",
        endTime: "15:05",
        location: "Caldwell Laboratory 0120",
        startDate: "2027-01-10",
        endDate: "2027-05-01",
      },
    ],
  },
];
catalog.courses[1].courseId = "056789";
catalog.courses[1].evaluation = evaluation;
catalog.courses[1].sections = course.sections;

async function setup({
  width = 1440,
  height = 1000,
  locale = "zh",
  fail = false,
  touch = false,
  reduced = false,
  loading = false,
  paging = false,
  timeZone = "America/New_York",
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: timeZone,
    locale: locale === "zh" ? "zh-CN" : "en-US",
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ({ locale, KEY, fixtureCourse }) => {
      if (sessionStorage.getItem("fixture:seeded")) return;
      sessionStorage.setItem("fixture:seeded", "1");
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-model:v1", "ollama");
      localStorage.setItem("course-atlas:translation-mode:v1", "bilingual");
      localStorage.setItem(KEY, "done");
      localStorage.setItem(
        "course-atlas:saved:v1",
        JSON.stringify([{ ...fixtureCourse, id: "real-saved-course" }]),
      );
    },
    { locale, KEY, fixtureCourse: course },
  );
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let shouldFail = fail;
  const requests = [];
  let bypassRequests = 0;
  const summaryBatches = [];
  // Fixture tests never send traffic to analytics or other third-party services.
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin ===
    new URL(process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3101").origin
      ? route.continue()
      : route.abort(),
  );
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/debug/")) return route.continue();
    if (route.request().headers()["x-course-atlas-debug"] === "bypass")
      bypassRequests++;
    if (url.pathname === "/api/rmp/summaries") {
      const { courses } = route.request().postDataJSON();
      summaryBatches.push(courses);
      return route.fulfill({
        json: {
          summaries: Object.fromEntries(
            courses.map((item) => [
              item.id,
              item.catalogNumber === "2231"
                ? {
                    ...insight,
                    difficultyPeriod: "historical",
                    difficulty: 2.8,
                    difficultyCount: 45,
                  }
                : insight,
            ]),
          ),
        },
      });
    }
    if (url.pathname === "/api/rmp/course")
      return route.fulfill({ json: rmpSummary });
    if (url.pathname === "/api/evaluations")
      return route.fulfill({
        json: {
          summaries: Object.fromEntries(
            catalog.courses.map((course) => [course.id, evaluation]),
          ),
        },
      });
    if (url.pathname === "/api/catalog/course")
      return route.fulfill({
        json: {
          course,
          sourceMode: "official",
          source: "https://classes.osu.edu",
          fetchedAt: new Date().toISOString(),
        },
      });
    if (url.pathname === "/api/catalog") {
      if (loading) await new Promise((resolve) => setTimeout(resolve, 900));
      return route.fulfill({
        json: paging
          ? {
              ...catalog,
              page: url.searchParams.has("cursor") ? 2 : 1,
              hasMore: !url.searchParams.has("cursor"),
              nextCursor: url.searchParams.has("cursor")
                ? null
                : "fixture-next",
              totalPages: 2,
            }
          : catalog,
      });
    }
    if (url.pathname === "/api/catalog/facets")
      return route.fulfill({ json: { filters: [] } });
    if (url.pathname === "/api/translate") {
      const request = route.request().postDataJSON();
      requests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 300));
      if (shouldFail)
        return route.fulfill({ status: 503, json: { error: "unavailable" } });
      return route.fulfill({
        json: {
          version: 1,
          results: request.items.map((item) => ({
            id: item.id,
            target: item.target,
            status: "translated",
            provider: "ollama",
            cache: "miss",
            durationMs: 8,
            translation:
              {
                "Lots of homework": "作业很多",
                Caring: "关心学生",
                "Tough grader": "评分严格",
                Inspirational: "富有启发",
                "Clear grading criteria": "评分标准明确",
                "Accessible outside class": "课外答疑",
                "Amazing lectures": "讲课精彩",
                Respected: "受人尊敬",
                "Get ready to read": "阅读量大",
                "Participation matters": "重视参与",
                "Test heavy": "考试较多",
              }[item.text] ??
              "一条很长的学生评价标签，完整保留译文内容，检查词云在窄屏上重新排列后没有溢出。",
          })),
        },
      });
    }
    if (url.pathname.includes("/sections"))
      return route.fulfill({ json: { course, sections: [], totalItems: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto(process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3101", {
    waitUntil: loading ? "domcontentloaded" : "networkidle",
  });
  if (!loading) {
    await page.locator("[data-translation-action]").first().waitFor();
    await page
      .locator("[data-translation-action]")
      .first()
      .scrollIntoViewIfNeeded();
  }
  return {
    context,
    page,
    errors,
    requests,
    getBypassRequests: () => bypassRequests,
    summaryBatches,
    succeed: () => {
      shouldFail = false;
    },
  };
}

async function noOverflow(page, selector) {
  const results = await page.locator(selector).evaluateAll((elements) =>
    elements.map((element) => ({
      width: element.scrollWidth,
      client: element.clientWidth,
      page: document.documentElement.scrollWidth,
      viewport: document.documentElement.clientWidth,
    })),
  );
  assert(results.length > 0);
  for (const result of results)
    assert(
      result.page <= result.viewport + 1 && result.width <= result.client + 1,
      JSON.stringify(result),
    );
}
try {
  for (const [width, locale] of [
    [1440, "zh"],
    [768, "en"],
    [390, "zh"],
    [320, "en"],
  ]) {
    const { context, page, errors, summaryBatches, requests } = await setup({
      width,
      height: 950,
      locale,
      touch: width < 600,
      timeZone: width === 768 ? "Asia/Tokyo" : "America/New_York",
    });
    await page.locator("[data-rmp-preview] li").first().waitFor();
    assert(summaryBatches.length > 0);
    assert.equal(
      await page.locator("[data-debug-tools]").count(),
      0,
      "production toolbar starts hidden",
    );
    await noOverflow(page, ".course-card");
    const code = await page.locator(".course-code").first().boundingBox();
    assert(code.height < 26, "course number must fit on one line");
    const rating = await page.locator(".rating-trigger").first().boundingBox();
    const caption = await page.locator(".rating-caption").first().boundingBox();
    assert(Math.abs(rating.x - caption.x) < (width < 640 ? 2 : 23));
    assert(await page.locator(".offerings-label small").isVisible());
    assert.equal(await page.locator(".results-footer").count(), 0);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({
      path: `/tmp/hero-experience-${width}-${locale}.png`,
    });
    assert(await page.locator("[data-build-stamp]").isVisible());
    const release = page.locator("main [data-build-stamp]");
    assert.equal(await release.getAttribute("aria-expanded"), "false");
    await release.click();
    const details = page.locator("[data-update-details]");
    await details.waitFor();
    assert((await details.locator("p").innerText()).length > 0);
    assert.equal(
      await details.getByRole("link").last().getAttribute("href"),
      "https://github.com/1834423612/osu-evaluation-info/tree/master",
    );
    await noOverflow(page, "[data-update-details]");
    await page.keyboard.press("Escape");
    await details.waitFor({ state: "hidden" });
    assert(await release.locator("time").getAttribute("datetime"));
    assert(
      await release.locator("time").evaluate((element) => {
        const date = new Date(element.dateTime);
        return element.textContent.includes(
          `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
        );
      }),
      "release timestamp uses browser timezone",
    );
    const identityBox = await page
      .locator("footer .footer-identity")
      .boundingBox();
    const releaseBox = await page
      .locator("footer [data-open-source]")
      .boundingBox();
    if (width > 350)
      assert(
        releaseBox.x >= identityBox.x + identityBox.width - 1 &&
          Math.abs(
            releaseBox.y +
              releaseBox.height / 2 -
              identityBox.y -
              identityBox.height / 2,
          ) < 3,
        "footer identity and repository share one row",
      );
    const footerLinks = await page
      .locator("footer .footer-links")
      .boundingBox();
    assert(
      footerLinks.y >=
        Math.max(
          identityBox.y + identityBox.height,
          releaseBox.y + releaseBox.height,
        ),
    );
    const disclaimerWidth = await page
      .locator("footer .footer-disclaimer")
      .evaluate((element) => ({
        width: element.clientWidth,
        text: element.querySelector("p").clientWidth,
      }));
    assert.equal(disclaimerWidth.width, disclaimerWidth.text);
    assert.equal(
      await page
        .locator("footer")
        .getByRole("link", { name: "kjch", exact: true })
        .locator("svg")
        .count(),
      1,
    );
    assert.equal(await page.locator("[data-open-source]").count(), 2);
    const topRepository = page.locator("main [data-open-source]");
    const topRepoBox = await topRepository.boundingBox();
    assert(topRepoBox.height <= 50, "repository introduction stays compact");
    assert(topRepoBox.width <= (width <= 640 ? 153 : 221));
    const eyebrowBox = await page
      .getByText(
        locale === "zh"
          ? "OHIO STATE · 课程与教授评价"
          : "OHIO STATE · COURSES & PROFESSOR RATINGS",
        { exact: true },
      )
      .boundingBox();
    const termBox = await page.locator(".term-control").boundingBox();
    const descriptionBox = await page
      .getByText(
        locale === "zh"
          ? "查课程、看课表、了解教授，为下一学期做好准备。"
          : "Explore Ohio State courses, compare schedules, and get to know your professors.",
        { exact: true },
      )
      .boundingBox();
    if (width > 640)
      assert(
        Math.abs(
          termBox.y + termBox.height - descriptionBox.y - descriptionBox.height,
        ) < 2,
        "desktop term selector bottom aligns with the introductory description",
      );
    else
      assert(
        termBox.y >= descriptionBox.y + descriptionBox.height + 8,
        "mobile description and term selector retain separate rows",
      );
    assert(
      Math.abs(topRepoBox.y - eyebrowBox.y) < 2,
      "repository aligns with the top of the Ohio State context",
    );
    if (width <= 640) {
      const titleBox = await page.locator(".page-heading h1").boundingBox();
      assert(
        topRepoBox.y + topRepoBox.height < titleBox.y &&
          titleBox.y + titleBox.height < termBox.y,
        "mobile repository precedes the title and stays separate from the term selector",
      );
    }
    assert(
      (await page.locator("footer [data-open-source]").boundingBox()).height <=
        42,
      "footer repository remains a compact black strip",
    );
    const headingBox = await page.locator(".page-heading").boundingBox();
    assert(
      Math.abs(
        topRepoBox.x + topRepoBox.width - headingBox.x - headingBox.width,
      ) < 2,
      "repository aligns with heading right edge",
    );
    assert(
      topRepoBox.y >= headingBox.y &&
        topRepoBox.y + topRepoBox.height <= headingBox.y + headingBox.height,
      "repository belongs inside the heading",
    );
    const infoPosition = await page
      .locator(".official-disclaimer")
      .evaluate((element) => ({
        notice: element.getBoundingClientRect().top,
        card: document.querySelector(".course-card").getBoundingClientRect()
          .top,
      }));
    assert(
      infoPosition.notice < infoPosition.card,
      "official-data notice belongs above results",
    );
    assert((await release.boundingBox()).width <= 261);
    assert.equal(
      await topRepository.getAttribute("href"),
      "https://github.com/1834423612/osu-evaluation-info",
    );
    assert.equal(
      await page
        .locator("footer")
        .getByRole("link", { name: "kjch", exact: true })
        .getAttribute("href"),
      "https://github.com/1834423612",
    );
    assert.equal(
      await page.locator('footer a[href="https://www.kjch.net"]').count(),
      1,
    );
    const expected =
      locale === "zh" ? "蛙O！ | OSU 课程信息汇总" : "WahO! | OSU Course Atlas";
    assert.equal(await page.title(), expected);
    assert.equal(
      await page.locator('meta[property="og:title"]').getAttribute("content"),
      "WahO! | OSU Course Atlas",
      "social metadata remains English even with a Chinese tab title",
    );
    if (width === 1440) {
      const html = await (
        await page.request.get(new URL("/", page.url()).href)
      ).text();
      assert(html.includes("<title>WahO! | OSU Course Atlas</title>"));
    }
    const cloud = page.locator("[data-rmp-cloud]").first();
    await cloud.locator("[data-cloud-word]").first().waitFor();
    assert.equal(await cloud.locator("button").count(), 1);
    assert.equal(await cloud.locator("li button").count(), 0);
    const styles = await cloud
      .locator("[data-cloud-word]")
      .evaluateAll((words) =>
        words.map((word) => ({
          count: Number(word.dataset.count),
          size: parseFloat(getComputedStyle(word).fontSize),
          color: getComputedStyle(word).color,
        })),
      );
    assert.equal(new Set(styles.map((word) => word.color)).size, styles.length);
    assert(styles[0].size > styles.at(-1).size + (width <= 640 ? 11 : 15));
    await cloud.locator("button").evaluate((button) => {
      button.click();
      button.click();
    });
    await cloud.locator('[data-cloud-word][lang="zh-CN"]').first().waitFor();
    assert.equal(
      requests
        .flatMap((request) => request.items)
        .filter((item) => tags.some((tag) => tag.tag === item.text)).length,
      tags.length,
      "rapid taps share one request per tag",
    );
    assert.equal(
      await cloud.locator("[data-cloud-word]").first().innerText(),
      "作业很多",
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-mode:v1"),
      ),
      "bilingual",
    );
    await page.waitForTimeout(350);
    const rectangles = await cloud
      .locator("[data-cloud-word]")
      .evaluateAll((words) =>
        words.map((word) => word.getBoundingClientRect().toJSON()),
      );
    for (let i = 0; i < rectangles.length; i++)
      for (let j = i + 1; j < rectangles.length; j++) {
        const a = rectangles[i],
          b = rectangles[j];
        assert(
          a.right <= b.left ||
            b.right <= a.left ||
            a.bottom <= b.top ||
            b.bottom <= a.top,
          "translated words cannot overlap",
        );
      }
    await noOverflow(page, "[data-rmp-preview] ul");
    await page.locator("[data-rmp-preview]").first().scrollIntoViewIfNeeded();
    await page.locator(".course-card").nth(1).scrollIntoViewIfNeeded();
    await page.locator('[data-period="historical"]').waitFor();
    assert(
      await page
        .locator('[data-period="historical"]')
        .getByText(/May be outdated|可能过时/)
        .isVisible(),
    );
    await page.locator("[data-rmp-preview]").first().scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/course-experience-${width}-${locale}.png`,
      fullPage: false,
    });
    await page.getByRole("button", { name: course.title, exact: true }).click();
    await page.getByRole("dialog").waitFor();
    const dialog = page.getByRole("dialog");
    await dialog.locator('[data-class-number="12345"]').waitFor();
    // Vaul finishes opening after its contents become visible.
    await page.waitForTimeout(400);
    const bounds = await dialog.boundingBox();
    assert(bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
    const teacher = dialog
      .locator('[data-analytics-action="instructor_course_favorite"]')
      .first();
    const section = dialog
      .locator('[data-analytics-action="section_favorite"]')
      .first();
    assert(
      (await teacher.innerText()).includes(
        locale === "zh" ? "教师" : "Instructor",
      ),
    );
    assert(
      (await section.innerText()).includes(
        locale === "zh" ? "班次" : "Section",
      ),
    );
    if (width < 640) {
      const a = await teacher.boundingBox(),
        b = await section.boundingBox();
      assert(
        a.y > b.y + 20,
        "teacher and section save controls belong on separate rows",
      );
    }
    await noOverflow(page, '[role="dialog"]');
    await noOverflow(page, ".course-details");
    await dialog
      .locator('[data-class-number="12345"]')
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `/tmp/section-experience-${width}-${locale}.png`,
    });
    await page
      .getByRole("tab", {
        name: locale === "zh" ? "教学评价与趋势" : "Evaluations & trends",
        exact: true,
      })
      .click();
    const official = dialog.locator('[data-source="official"]');
    await official.waitFor();
    const officialRect = await official.boundingBox();
    await page
      .getByRole("tab", {
        name: locale === "zh" ? "RMP · 学生评论" : "RMP · student reviews",
        exact: true,
      })
      .click();
    await page
      .getByRole("heading", { name: "Rate My Professors", exact: true })
      .waitFor();
    const title = await page
      .getByRole("heading", { name: "Rate My Professors", exact: true })
      .boundingBox();
    const sync = await dialog
      .getByText(locale === "zh" ? "定期同步" : "Synced", { exact: true })
      .boundingBox();
    const unofficial = await dialog
      .locator('[data-source="unofficial"]')
      .boundingBox();
    assert(
      sync.x >= title.x + title.width - 1 &&
        Math.abs(sync.y + sync.height / 2 - title.y - title.height / 2) < 5,
      "sync note stays beside the heading",
    );
    assert(
      sync.x + sync.width <= unofficial.x + 1,
      "sync text cannot overlap the source badge",
    );
    assert(
      Math.abs(
        unofficial.x + unofficial.width - officialRect.x - officialRect.width,
      ) < 2,
      `source badges share the same right edge: ${JSON.stringify({ officialRect, unofficial, title, sync })}`,
    );
    await noOverflow(page, '[role="dialog"]');
    await noOverflow(page, '[data-analytics-area="rmp_reviews"]');
    await noOverflow(page, ".course-details");
    await page.waitForTimeout(400);
    await page.screenshot({
      path: `/tmp/rmp-experience-${width}-${locale}.png`,
    });
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", {
        name: locale === "zh" ? "切换到英文" : "Switch to Chinese",
        exact: true,
      })
      .click();
    await page.waitForTimeout(100);
    assert.equal(
      await page.title(),
      locale === "zh" ? "WahO! | OSU Course Atlas" : "蛙O！ | OSU 课程信息汇总",
    );
    if (width === 1440) {
      await page.locator('header a[href="/saved"]').click();
      await page.waitForURL("**/saved");
      await page.waitForFunction(() =>
        document.title.startsWith("Saved courses · WahO!"),
      );
      await page.locator("header .brand").click();
      await page.waitForURL((url) => url.pathname === "/");
      await page.waitForFunction(
        () => document.title === "WahO! | OSU Course Atlas",
      );
    }
    assert.deepEqual(errors, []);
    await page.locator(".site-footer").scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.locator(".site-footer").scrollIntoViewIfNeeded();
    await noOverflow(page, ".site-footer");
    await page.waitForFunction(() => {
      const control = document
        .querySelector("[data-scroll-top]")
        ?.getBoundingClientRect();
      if (!control) return true;
      return [
        ...document.querySelectorAll("footer a, .footer-disclaimer"),
      ].every((element) => {
        const link = element.getBoundingClientRect();
        return (
          control.right <= link.left ||
          link.right <= control.left ||
          control.bottom <= link.top ||
          link.bottom <= control.top
        );
      });
    });
    await page.screenshot({
      path: `/tmp/footer-experience-${width}-${locale}.png`,
    });
    console.log(
      `PASS ${width}px ${locale}: compact facts, alignment, RMP cloud translation, section actions, source badges, live title and footer`,
    );
    await context.close();
  }
  {
    const { context, page, errors } = await setup({
      width: 390,
      height: 900,
      touch: true,
      paging: true,
      reduced: true,
    });
    await page.locator(".site-footer").scrollIntoViewIfNeeded();
    await page.locator("[data-scroll-top]").waitFor();
    await page.evaluate(() => {
      const widget = document.createElement("div");
      widget.id = "foreign-widget";
      widget.style.cssText =
        "position:fixed;right:16px;bottom:16px;width:220px;height:110px;z-index:220;background:#eee";
      document.body.append(widget);
    });
    const avoids = () => {
      const control = document
        .querySelector("[data-scroll-top]")
        ?.getBoundingClientRect();
      const widget = document
        .querySelector("#foreign-widget")
        ?.getBoundingClientRect();
      return (
        control &&
        widget &&
        (control.right <= widget.left ||
          widget.right <= control.left ||
          control.bottom <= widget.top ||
          widget.bottom <= control.top)
      );
    };
    await page.waitForFunction(avoids);
    await page.evaluate(
      () => (document.querySelector("#foreign-widget").style.height = "240px"),
    );
    await page.waitForFunction(avoids);
    await page.evaluate(() =>
      document.querySelector("#foreign-widget").remove(),
    );
    await page.evaluate(() => {
      const mask = document.createElement("div");
      mask.id = "foreign-mask";
      mask.style.cssText =
        "position:fixed;inset:0;z-index:220;background:rgba(0,0,0,.1)";
      document.body.append(mask);
    });
    await page.waitForFunction(
      () => !document.querySelector("[data-scroll-top]"),
    );
    await page.evaluate(() => document.querySelector("#foreign-mask").remove());
    await page.locator("[data-scroll-top]").waitFor();
    await page.locator("[data-scroll-top]").click();
    await page.waitForFunction(() => scrollY < 3);
    await page.waitForFunction(
      () => !document.querySelector("[data-scroll-top]"),
    );
    for (const [direction, label] of [
      ["next", "第 2 页"],
      ["previous", "第 1 页"],
    ]) {
      await page.locator(".course-pagination").scrollIntoViewIfNeeded();
      await page
        .locator(".course-pagination")
        .getByRole("button", {
          name: direction === "next" ? "下一页" : "上一页",
          exact: true,
        })
        .click();
      await page
        .locator(".course-pagination")
        .getByText(label, { exact: true })
        .waitFor();
      await page.waitForFunction(() => scrollY < 3);
    }
    assert.deepEqual(errors, []);
    console.log(
      "PASS floating navigation: detect unknown widget, resize avoidance, backdrop hiding/restoration, return to top and both pagination directions",
    );
    await context.close();
  }
  {
    const { context, page, succeed, errors } = await setup({
      width: 390,
      height: 900,
      touch: true,
      fail: true,
    });
    const cloud = page.locator("[data-rmp-cloud]").first();
    await cloud.locator("[data-cloud-word]").first().waitFor();
    await cloud.locator("button").click();
    await cloud.getByRole("status").waitFor();
    assert.equal(
      await cloud.locator("[data-cloud-word]").first().innerText(),
      "Lots of homework",
    );
    assert.equal(await cloud.getAttribute("data-translated"), null);
    succeed();
    await cloud.locator("button").click();
    await cloud.locator('[data-cloud-word][lang="zh-CN"]').first().waitFor();
    await cloud.locator("button").click();
    assert.equal(
      await cloud.locator("[data-cloud-word]").first().innerText(),
      "Lots of homework",
    );
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-mode:v1"),
      ),
      "bilingual",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS cloud recovery: failure preserves original words, retry replaces in place, original toggle preserves global preferences",
    );
    await context.close();
  }
  {
    const { context, page, errors, getBypassRequests } = await setup({
      width: 390,
      height: 900,
      touch: true,
    });
    const logo = page.locator("header [data-debug-logo]");
    for (let index = 0; index < 7; index++) {
      await logo.click();
      await page.waitForTimeout(80);
    }
    await page.getByRole("button", { name: "解锁", exact: true }).waitFor();
    assert.equal(
      await page.locator('[data-debug-tools] input[type="checkbox"]').count(),
      0,
    );
    await page
      .locator('[data-debug-tools] input[type="password"]')
      .fill("wrong");
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    await page.getByRole("alert").waitFor();
    await page
      .locator('[data-debug-tools] input[type="password"]')
      .fill(process.env.GUIDE_TEST_DEBUG_KEY ?? "local-regression-debug-key");
    await page.getByRole("button", { name: "解锁", exact: true }).click();
    await page.getByLabel("出厂预览 · 临时数据层").waitFor();
    await page.getByRole("button", { name: "DEV", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("button", { name: "DEV", exact: true }).waitFor();
    assert.equal(
      await page
        .getByRole("button", { name: "DEV", exact: true })
        .getAttribute("aria-expanded"),
      "false",
    );
    assert.equal(await page.getByLabel("出厂预览 · 临时数据层").count(), 0);
    await page.getByRole("button", { name: "DEV", exact: true }).click();
    await page.reload({ waitUntil: "networkidle" });
    await page.getByLabel("出厂预览 · 临时数据层").waitFor();
    const original = await page.evaluate(() =>
      localStorage.getItem("course-atlas:saved:v1"),
    );
    await page.getByLabel("出厂预览 · 临时数据层").check();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("出厂预览 · 临时数据层").waitFor();
    assert(await page.getByLabel("出厂预览 · 临时数据层").isChecked());
    assert.equal(
      await page.evaluate(() => localStorage.getItem("course-atlas:saved:v1")),
      original,
    );
    await page.getByRole("button", { name: "DEV", exact: true }).click();
    await page
      .locator('.course-card [data-analytics-action="course_favorite"]')
      .first()
      .click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("course-atlas:saved:v1")),
      original,
    );
    await page.getByRole("button", { name: "DEV", exact: true }).click();
    await page.getByLabel("出厂预览 · 临时数据层").uncheck();
    await page.waitForLoadState("networkidle");
    await page.getByLabel("重复翻译引导").check();
    await page.waitForLoadState("networkidle");
    await page.getByRole("heading", { name: "试试一键翻译" }).waitFor();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-guide:v1"),
      ),
      "done",
    );
    await page.getByLabel("重复翻译引导").uncheck();
    await page.waitForLoadState("networkidle");
    assert.equal(await page.locator("[data-translation-guide]").count(), 0);
    await page.getByLabel("绕过应用 / HTTP 缓存").check();
    await page.waitForLoadState("networkidle");
    await page.locator("[data-rmp-preview] li").first().waitFor();
    assert(getBypassRequests() > 0, "cache bypass reaches requests");
    await page.getByLabel("本会话不上传 Umami").check();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("umami.disabled")),
      "1",
    );
    assert.equal(
      await page.evaluate(() => window.umamiBeforeSend("event", {})),
      false,
    );
    await page.getByLabel("本会话不上传 Umami").uncheck();
    await page.waitForLoadState("networkidle");
    assert.equal(
      await page.evaluate(() => localStorage.getItem("umami.disabled")),
      null,
    );
    await page.getByRole("button", { name: "隐藏调试工具" }).click();
    assert.equal(await page.locator("[data-debug-tools]").count(), 0);
    for (let index = 0; index < 7; index++) {
      await logo.click();
      await page.waitForTimeout(80);
    }
    await page.getByLabel("出厂预览 · 临时数据层").waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS production debug: seven taps, locked tools, wrong and correct keys, isolated factory state, guide replay, cache bypass, Umami opt-out and hide/reopen",
    );
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(
      await activePage.evaluate(() => ({
        text: document.body.innerText.slice(-1600),
        title: document.title,
      })),
    );
    await activePage.screenshot({ path: "/tmp/course-experience-failure.png" });
  }
  throw error;
} finally {
  await browser.close();
}
