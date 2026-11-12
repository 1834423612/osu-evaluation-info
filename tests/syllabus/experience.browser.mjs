import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { normalizeDocument } from "../../src/lib/syllabus/normalize.ts";
import {
  createSavedSyllabus,
  syllabusHasUpdate,
} from "../../src/lib/syllabus/saved.ts";
import { documentFixture, componentId, snapshotId } from "./fixtures.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.SYLLABUS_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.SYLLABUS_TEST_OUTPUT ?? "/tmp/osu-syllabus-qa";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const document = normalizeDocument(
  documentFixture({
    components: Array.from({ length: 14 }, (_, index) => ({
      component_id:
        index === 0
          ? componentId
          : `c69b8e20-e448-435d-bc41-${String(index).padStart(12, "0")}`,
      snapshot_id: snapshotId,
      is_public: true,
      locale: "en-US",
      sort_order: index,
      component_type: "content",
      html: `<div class="component" style="padding:0 24px"><h2 class="component-name app-name-view">${index === 0 ? "Syllabus - Grading" : index === 1 ? "Syllabus - Materials" : index === 2 ? "Syllabus - Schedule" : `Chapter ${index + 1}`}</h2><div class="fr-view">${index < 2 ? "<p>Short single-line information.</p>" : index === 2 ? `<table style="width:100%"><tr><th style="width:20%">Week</th><th>Topic</th></tr>${Array.from({ length: 16 }, (_, week) => `<tr><td>${week + 1}</td><td>Course topic ${week + 1}</td></tr>`).join("")}</table>` : Array.from({ length: 5 }, () => "<p>Full-width course content reaches across the document container, preserving balanced margins and readable typography in every section.</p>").join("")}</div></div>`,
    })),
  }),
  "example123",
);
document.components[0].html +=
  '<p><a href="https://osu.edu/">Official linked resource</a></p>';
const section = {
  id: "15115",
  classNumber: "15115",
  section: "0010",
  component: "Lecture",
  instructionMode: "In Person",
  enrollmentStatus: "",
  enrollmentTotal: null,
  waitlistTotal: null,
  session: "Full Term",
  sessionCode: "1",
  instructors: [
    { name: "Miranda Holmes", email: "holmes.1@osu.edu" },
    { name: "Alex Teacher", email: "teacher.1@osu.edu" },
  ],
  meetings: [
    {
      days: [0, 2],
      startTime: "10:20",
      endTime: "11:15",
      startDate: null,
      endDate: null,
      location: "Classroom",
    },
  ],
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
  sections: [
    section,
    {
      ...section,
      id: "25478",
      classNumber: "25478",
      section: "0020",
      instructors: [section.instructors[0]],
    },
  ],
  sectionsPartial: false,
};
const secondEntry = {
  ...document.entry,
  code: "example124",
  entityId: "bd9e24c8-393c-4c09-a1ef-a72db1b4e2e3",
  classNumber: "25478",
  sectionIdentifier: "25478",
};
const catalog = {
  courses: [course],
  page: 1,
  nextCursor: null,
  hasMore: false,
  totalItems: 1,
  matchedSections: 2,
  totalCourses: 1,
  totalPages: 1,
  capped: false,
  filters: [],
  terms: [{ code: "1268", label: "Autumn 2026" }],
  source: "fixture",
  fetchedAt: new Date().toISOString(),
  evaluationStatus: "unavailable",
};
let activePage;
async function setup(width = 1440, seed = false, locale = "zh") {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
    locale: locale === "zh" ? "zh-CN" : "en-US",
    timezoneId: "Asia/Shanghai",
    hasTouch: width < 700,
    isMobile: width < 700,
    reducedMotion: "reduce",
  });
  const original = {
    data: document,
    source: "official-relay",
    fetchedAt: "2026-11-01T12:00:00Z",
  };
  const saved = createSavedSyllabus(course, section, document.entry, original);
  await context.addInitScript(
    ({ course, seed, saved, locale }) => {
      Object.defineProperty(window, "showSaveFilePicker", {
        value: undefined,
        configurable: true,
      });
      if (sessionStorage.getItem("syllabus-fixture")) return;
      sessionStorage.setItem("syllabus-fixture", "1");
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
      if (seed)
        localStorage.setItem(
          "course-atlas:saved-syllabi:v1",
          JSON.stringify([saved]),
        );
    },
    { course, seed, saved, locale },
  );
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let currentDocument = structuredClone(document);
  if (seed) currentDocument.snapshotId = "6edc5037-bd43-4e05-8f95-d08385a3976a";
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin === new URL(base).origin ||
      url.hostname === "bux-fonts.s3.us-east-1.amazonaws.com" ||
      url.pathname.includes("/ui/account-image/")
      ? route.continue()
      : route.abort();
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/debug/"))
      return route.fulfill({
        json: {
          authorized: true,
          configured: true,
          expiresAt: Date.now() + 3600000,
        },
      });
    if (
      url.pathname === "/api/build-info" ||
      url.pathname === "/api/syllabus/assets"
    )
      return route.continue();
    if (url.pathname === "/api/syllabus") {
      const resource = url.searchParams.get("resource");
      return route.fulfill({
        json: {
          data:
            resource === "entries"
              ? [document.entry, secondEntry]
              : resource === "terms"
                ? []
                : url.searchParams.get("code") === secondEntry.code
                  ? { ...currentDocument, entry: secondEntry }
                  : currentDocument,
          source: "official-relay",
          fetchedAt: new Date().toISOString(),
        },
      });
    }
    if (url.pathname === "/api/catalog")
      return route.fulfill({ json: catalog });
    if (url.pathname === "/api/catalog/course")
      return route.fulfill({
        json: {
          course,
          sourceMode: "official",
          source: "fixture",
          fetchedAt: new Date().toISOString(),
        },
      });
    if (url.pathname === "/api/catalog/facets")
      return route.fulfill({ json: { filters: [] } });
    if (url.pathname === "/api/rmp/summaries") {
      const { courses } = route.request().postDataJSON();
      return route.fulfill({
        json: {
          summaries: Object.fromEntries(
            courses.map((item) => [
              item.id,
              {
                status: "available",
                tags: [
                  {
                    tag:
                      item.usernames?.[0] === "holmes.1"
                        ? "Caring"
                        : "Tough grader",
                    count: 3,
                  },
                ],
                difficulty: 3,
                difficultyCount: 3,
                reviewCount: 3,
                matchedInstructorCount: 1,
                requestedInstructorCount: 1,
              },
            ]),
          ),
        },
      });
    }
    if (url.pathname === "/api/evaluations")
      return route.fulfill({ json: { summaries: {} } });
    return route.fulfill({ json: {} });
  });
  return {
    context,
    page,
    errors,
    setDocument: (value) => {
      currentDocument = value;
    },
  };
}
async function openCourse(page) {
  await page.goto(`${base}/saved`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "教学大纲", exact: true }).click();
  await page
    .getByRole("radio", { name: "阅读大纲 #15115", exact: true })
    .waitFor();
  await page.locator("[data-syllabus-viewer] iframe").waitFor();
}
async function savedData(page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("course-atlas:saved-syllabi:v1") ?? "[]"),
  );
}
try {
  const desktop = await setup();
  const { page } = desktop;
  await openCourse(page);
  await page.locator('[data-syllabus-card="example123"] time').waitFor();
  assert.match(
    await page.locator('[data-syllabus-card="example123"] time').innerText(),
    /05:00/,
  ); // fixed OSU time despite Asia/Shanghai
  const first = page.locator('[data-syllabus-card="example123"]');
  await first
    .getByLabel("Miranda Holmes 的 RMP 评价标签")
    .getByText("Caring", { exact: true })
    .waitFor();
  await first
    .getByLabel("Alex Teacher 的 RMP 评价标签")
    .getByText("Tough grader", { exact: true })
    .waitFor();
  await first
    .getByRole("button", { name: "收藏教师 Miranda Holmes", exact: true })
    .click();
  assert.match(
    await first.locator('[data-syllabus-teacher="Miranda Holmes"]').innerText(),
    /已收藏教师/,
  );
  await first
    .getByRole("button", { name: "收藏大纲 #15115", exact: true })
    .click();
  assert.equal((await savedData(page)).length, 1);
  const tabs = page.getByRole("tablist", { name: "大纲重点", exact: true });
  assert(
    await tabs.evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
  );
  const panel = page.locator(".course-detail-panel");
  const highlights = page.getByRole("region", {
    name: "大纲速览",
    exact: true,
  });
  const short = highlights
    .locator('[data-slot="tabs-content"][data-state="active"] > div')
    .first();
  await short.hover();
  const before = await panel.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, 180);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".course-detail-panel").scrollTop > previous + 50,
    before,
  );
  const iframe = page.locator("[data-syllabus-viewer] iframe");
  await iframe.scrollIntoViewIfNeeded();
  const frame = await iframe
    .elementHandle()
    .then((handle) => handle.contentFrame());
  await frame.evaluate(() => {
    document.scrollingElement.scrollTop =
      document.scrollingElement.scrollHeight;
  });
  const box = await iframe.boundingBox();
  await page.mouse.move(box.x + box.width / 2, Math.min(850, box.y + 160));
  const atBoundary = await panel.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, 140);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".course-detail-panel").scrollTop > previous + 20,
    atBoundary,
  );
  await page.getByRole("button", { name: "清爽阅读", exact: true }).click();
  const reading = page.getByRole("region", {
    name: "清爽阅读正文",
    exact: true,
  });
  await reading.hover();
  await reading.evaluate((node) => {
    node.scrollTop = 0;
  });
  const readingBefore = await panel.evaluate((node) => node.scrollTop);
  await page.mouse.wheel(0, -100);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".course-detail-panel").scrollTop < previous - 20,
    readingBefore,
  );
  await page.getByRole("button", { name: "官方版式", exact: true }).click();
  // Dev tools must stay clickable and keyboard-focusable while the course modal is open.
  await page
    .locator("[data-debug-tools]")
    .getByRole("button", { name: "DEV", exact: true })
    .click();
  await page
    .locator("[data-debug-tools]")
    .getByText("教学大纲与滚动", { exact: true })
    .waitFor();
  const diagnostic = page
    .locator("[data-debug-tools]")
    .getByRole("button", { name: "导出滚动诊断", exact: true });
  await diagnostic.focus();
  assert(await diagnostic.evaluate((node) => document.activeElement === node));
  const diagnosticDownload = page.waitForEvent("download");
  await diagnostic.click();
  await (await diagnosticDownload).saveAs(`${output}/scroll.json`);
  await page
    .locator("[data-debug-tools]")
    .getByRole("button", { name: "DEV", exact: true })
    .click();
  await panel.evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: `${output}/desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "关闭课程详情", exact: true }).click();
  await page.goto(`${base}/saved`, { waitUntil: "networkidle" });
  await page.getByRole("tab", { name: /大纲/ }).click();
  await page.locator('[data-open-syllabus="example123"]').click();
  assert.equal(new URL(page.url()).pathname, "/saved");
  await page.locator("[data-syllabus-viewer]").waitFor();
  const download = page.waitForEvent("download", { timeout: 90000 });
  await page.getByRole("button", { name: "下载 PDF", exact: true }).click();
  await (await download).saveAs(`${output}/fixture.pdf`);
  assert.equal(desktop.errors.length, 0, desktop.errors.join("\n"));
  console.log(
    "Desktop: native/iframe scroll chaining, tab geometry, teacher attribution, favorites, direct reading, dev tools and PDF passed",
  );
  await desktop.context.close();

  for (const width of [390, 1440]) {
    const mobile = await setup(width, true);
    const { page } = mobile;
    await page.goto(`${base}/saved`, { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /大纲/ }).click();
    await page
      .locator('[data-saved-syllabus="example123"]')
      .getByText("有更新", { exact: true })
      .waitFor();
    assert(syllabusHasUpdate((await savedData(page))[0]));
    const card = page.locator('[data-saved-syllabus="example123"]');
    assert.match(
      await card
        .getByRole("link", { name: /班次 #15115/ })
        .getAttribute("href"),
      /focusSection=15115/,
    );
    assert.match(
      await card.getByRole("link", { name: "课程详情" }).getAttribute("href"),
      new RegExp(`course=${course.id}`),
    );
    await page.locator('[data-open-syllabus="example123"]').click();
    await page
      .getByRole("button", { name: "暂时保留提醒", exact: true })
      .click();
    await page.getByRole("button", { name: "Close", exact: true }).click();
    assert(syllabusHasUpdate((await savedData(page))[0]));
    await page.reload({ waitUntil: "networkidle" });
    await page.getByRole("tab", { name: /大纲/ }).click();
    await page.locator('[data-open-syllabus="example123"]').click();
    await page.getByRole("button", { name: "标为已读", exact: true }).click();
    assert.equal(syllabusHasUpdate((await savedData(page))[0]), false);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `${output}/saved-${width}.png`,
      fullPage: true,
    });
    if (width === 390) {
      await page.getByRole("button", { name: "Close", exact: true }).click();
      await page.getByRole("tab", { name: /^课程/ }).click();
      await page.getByRole("button", { name: "教学大纲", exact: true }).click();
      const outer = page.locator(".course-detail-drawer > .course-details");
      const iframe = page.locator("[data-syllabus-viewer] iframe");
      await iframe.scrollIntoViewIfNeeded();
      const frame = await iframe
        .elementHandle()
        .then((handle) => handle.contentFrame());
      await frame.evaluate(() => {
        document.scrollingElement.scrollTop = 0;
      });
      const box = await iframe.boundingBox();
      const x = box.x + box.width / 2,
        y = Math.max(box.y + 30, Math.min(800, box.y + box.height / 2));
      const before = await outer.evaluate((node) => node.scrollTop);
      const touch = await mobile.context.newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x, y }],
      });
      for (let offset = 10; offset <= 90; offset += 10)
        await touch.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: y + offset }],
        });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      await page.waitForFunction(
        (previous) =>
          document.querySelector(".course-detail-drawer > .course-details")
            .scrollTop <
          previous - 20,
        before,
      );
      await touch.detach();
      await page.goto(base, { waitUntil: "networkidle" });
      await page.getByRole("button", { name: "筛选", exact: true }).click();
      await page
        .locator("[data-debug-tools]")
        .getByRole("button", { name: "DEV", exact: true })
        .click();
      const layoutSwitch = page
        .locator("[data-debug-tools]")
        .getByRole("checkbox", { name: "显示布局边界", exact: true });
      await layoutSwitch.focus();
      assert(
        await layoutSwitch.evaluate((node) => document.activeElement === node),
      );
      await page
        .locator("[data-debug-tools]")
        .getByRole("button", { name: "DEV", exact: true })
        .click();
      await page.goto(`${base}/methodology`, { waitUntil: "networkidle" });
      await page
        .locator("[data-debug-tools]")
        .getByRole("button", { name: "DEV", exact: true })
        .click();
      await page
        .locator("[data-debug-tools]")
        .getByText("教学大纲与滚动", { exact: true })
        .waitFor();
      console.log(
        "390px: real touch gestures chain from the iframe into the mobile course drawer",
      );
    }
    assert.equal(mobile.errors.length, 0, mobile.errors.join("\n"));
    console.log(
      `${width}px: update alert survives open/close/reload, explicit acknowledgement and destinations passed`,
    );
    await mobile.context.close();
  }
  if (process.env.SYLLABUS_DOCUMENT_FILE) {
    const live = await setup(1440, true);
    const official = JSON.parse(
      await readFile(process.env.SYLLABUS_DOCUMENT_FILE, "utf8"),
    );
    live.setDocument({ ...(official.data ?? official), entry: document.entry });
    await live.page.goto(`${base}/saved`, { waitUntil: "networkidle" });
    await live.page.getByRole("tab", { name: /大纲/ }).click();
    await live.page.locator('[data-open-syllabus="example123"]').click();
    await live.page.locator("[data-syllabus-viewer]").waitFor();
    const downloaded = live.page.waitForEvent("download", { timeout: 90000 });
    await live.page
      .getByRole("button", { name: "下载 PDF", exact: true })
      .click();
    const file = await Promise.race([
      downloaded,
      live.page
        .getByRole("alert")
        .waitFor({ timeout: 90000 })
        .then(async () => {
          throw new Error(await live.page.getByRole("alert").innerText());
        }),
    ]);
    await file.saveAs(`${output}/official-content.pdf`);
    await live.page.locator("[data-syllabus-viewer]").scrollIntoViewIfNeeded();
    await live.page.screenshot({
      path: `${output}/official-preview.png`,
      fullPage: true,
    });
    assert.equal(live.errors.length, 0, live.errors.join("\n"));
    await live.context.close();
    console.log(
      "Official content: published HTML, fonts, image and tables exported successfully",
    );
  }
  console.log(`Screenshots and PDF: ${output}`);
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: `${output}/failure.png`, fullPage: true })
      .catch(() => {});
    console.error((await activePage.locator("body").innerText()).slice(-4000));
  }
  throw error;
} finally {
  await browser.close();
}
