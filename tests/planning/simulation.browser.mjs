import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyPlan,
  planSchema,
  PLAN_STORAGE_KEY,
} from "../../src/lib/planning/model.ts";
import { addPlanningCourse } from "../../src/lib/planning/workspace.ts";
import { easternMinutes } from "../../src/lib/calendar/week.ts";
import { officialEndpointPlan } from "../../src/lib/catalog/official-endpoints.ts";
import { course, section } from "../user-data/fixtures.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.PLANNING_TEST_BASE_URL ?? "http://localhost:3000",
);
const out = resolve(
  process.env.PLANNING_SCREENSHOT_DIR ?? ".cache/simulation-browser",
);
await mkdir(out, { recursive: true });
const term = "Spring2027";
let sequence = 0;
let plan = emptyPlan();
for (const number of ["1111", "2222", "3333", "4444"])
  plan = addPlanningCourse(
    plan,
    { subject: "CSE", number },
    term,
    () => `simulation-${++sequence}`,
  );
// An imported section must not silently pin the simulation's automatic choice.
plan.semesters[0].courses[1].section = "LATE";
plan = planSchema.parse(plan);
const timed = (id, start, end, days = [0, 2]) => ({
  ...section,
  classNumber: id,
  section: id.toUpperCase(),
  courseOfferingNumber: "1",
  termCode: "1272",
  meetings: [
    {
      ...section.meetings[0],
      days,
      startTime: start,
      endTime: end,
      startDate: "2027-01-11",
      endDate: "2027-04-26",
    },
  ],
});
const catalog = [
  ["1111", [timed("fixed", "09:00", "10:00")]],
  ["2222", [timed("near", "10:10", "11:00"), timed("late", "12:00", "13:00")]],
  [
    "3333",
    [
      {
        ...section,
        classNumber: "online",
        section: "online",
        courseOfferingNumber: "1",
        termCode: "1272",
        instructionMode: "Distance Learning",
        meetings: [],
      },
    ],
  ],
  [
    "4444",
    [
      {
        ...timed("session2", "17:00", "18:00"),
        session: "Session 2",
        meetings: [
          {
            ...section.meetings[0],
            days: [4],
            startTime: "17:00",
            endTime: "18:00",
            startDate: "2027-03-01",
            endDate: "2027-04-26",
          },
        ],
      },
      // Keep the added component on a separate day so Near/Late ranking stays unchanged.
      { ...timed("lab", "14:00", "15:00", [1]), component: "Laboratory" },
    ],
  ],
].map(([number, sections]) => ({
  ...course,
  id: `1272-CSE-${number}-COL`,
  subject: "CSE",
  subjectName: "Computer Science and Engineering",
  catalogNumber: number,
  courseId: number,
  title: `Course ${number} with a long, readable title`,
  termCode: "1272",
  term: "Spring 2027",
  sections,
}));
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  for (const [width, height, locale] of [
    [1440, 900, "en"],
    [768, 1024, "en"],
    [390, 844, "zh"],
    [320, 740, "en"],
  ]) {
    console.log(`simulation ${width}px ${locale}: loading isolated workspace`);
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "reduce",
    });
    const errors = [];
    const consoleErrors = [];
    const workerUrls = [],
      failedAssets = [];
    let availabilityRound = 0;
    const availabilityReads = [];
    let unavailableMetadata = width === 1440;
    const courseReads = [];
    await context.addInitScript(
      ({ plan, key, locale }) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
        if (!localStorage.getItem("simulation-qa-seeded")) {
          localStorage.setItem(key, JSON.stringify(plan));
          localStorage.setItem("simulation-qa-seeded", "1");
        }
      },
      { plan, key: PLAN_STORAGE_KEY, locale },
    );
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        url.href.startsWith("https://content.osu.edu/v2/classes/availability?")
      ) {
        const selected = url.searchParams.get("classSection");
        availabilityReads.push({ round: availabilityRound, section: selected });
        if (availabilityRound === 1 && selected === "LATE")
          return route.fulfill({
            status: 503,
            json: { error: "Live read failed" },
          });
        const full = availabilityRound === 1 && selected === "FIXED";
        const waitlist = availabilityRound === 1 && selected === "online";
        return route.fulfill({
          json: {
            status: "success",
            data: {
              availability: {
                isOpen: !full && !waitlist,
                enrollmentStatus: waitlist
                  ? "Wait List"
                  : full
                    ? "Closed"
                    : "Open",
                enrollmentCapacity: 30,
                enrollmentTotal: full || waitlist ? 30 : 22,
                availableSeats: full || waitlist ? 0 : 8,
                waitlistCapacity: 10,
                waitlistTotal: waitlist ? 3 : 0,
              },
            },
          },
        });
      }
      if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
        return route.abort();
      if (url.pathname === "/api/catalog/course") {
        const number = url.searchParams.get("catalog");
        if (number) courseReads.push(number);
        if (unavailableMetadata && number === "4444")
          return route.fulfill({
            status: 503,
            json: { error: "Course metadata temporarily unavailable" },
          });
        return route.fulfill({
          json: { course: catalog.find((c) => c.catalogNumber === number) },
        });
      }
      if (url.pathname === "/api/catalog/availability")
        return route.fulfill({ json: officialEndpointPlan("availability") });
      if (url.pathname === "/api/calendar/academic")
        return route.fulfill({ json: { days: [] } });
      if (url.pathname.startsWith("/api/"))
        return route.fulfill({
          status: 503,
          json: { error: "Isolated simulation fixture" },
        });
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("worker", (worker) => workerUrls.push(worker.url()));
    page.on("requestfailed", (request) => {
      if (request.url().includes("/_next/"))
        failedAssets.push({
          url: request.url(),
          failure: request.failure()?.errorText,
        });
    });
    const t = (en, zh) => (locale === "zh" ? zh : en);
    await page.goto(new URL("/planning", base).href, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    console.log(`simulation ${width}px: loaded planning page`);
    await page
      .locator('[data-analytics-area="planning_board"]')
      .getByRole("button", { name: "CSE 2222", exact: true })
      .first()
      .waitFor();
    await page
      .getByRole("region", { name: t("Spring 2027", "2027 春季"), exact: true })
      .getByRole("button", {
        name: t("Simulate schedule", "模拟排课"),
        exact: true,
      })
      .click({ timeout: 20_000 })
      .catch(async (error) => {
        await page.screenshot({
          path: resolve(out, `planning-failure-${width}.png`),
        });
        console.error(
          (await page.locator("body").innerText()).slice(-6000),
          errors,
        );
        throw error;
      });
    const dialog = page.getByRole("dialog").filter({
      has: page.getByRole("heading", {
        name: t("Schedule simulation", "模拟排课"),
        exact: true,
      }),
    });
    const run = dialog.getByRole("button", {
      name: t("Fetch sections & simulate", "获取班次并模拟排课"),
      exact: true,
    });
    await run.waitFor({ timeout: 20_000 }).catch(async (error) => {
      await page.screenshot({ path: resolve(out, `failure-${width}.png`) });
      console.error(
        (await page.locator("body").innerText()).slice(-5000),
        errors,
      );
      throw error;
    });
    const close = dialog
      .getByRole("button", {
        name: t("Close", "关闭"),
        exact: true,
      })
      .last();
    if (width > 600)
      assert.equal(
        await close.evaluate((element) => document.activeElement === element),
        true,
        "main simulation initially focuses its Close button",
      );
    const runBackground = await run.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    await run.hover();
    await run.evaluate(async (element) => {
      await new Promise(requestAnimationFrame);
      await Promise.all(
        element
          .getAnimations()
          .filter((animation) =>
            Number.isFinite(animation.effect?.getComputedTiming().endTime),
          )
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const hovered = await run.evaluate((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      const channel = (value) => {
        const x = value / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (color) => {
        const values = color
          .match(/[\d.]+/g)
          .slice(0, 3)
          .map(Number)
          .map((value) =>
            color.startsWith("color(srgb") ? value * 255 : value,
          )
          .map(channel);
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
      };
      const light = luminance(style.color),
        dark = luminance(style.backgroundColor);
      return {
        background: style.backgroundColor,
        contrast:
          (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05),
        visible:
          box.width > 0 &&
          box.height > 0 &&
          style.visibility === "visible" &&
          Number(style.opacity) > 0,
        hit: element.contains(
          document.elementFromPoint(
            box.x + box.width / 2,
            box.y + box.height / 2,
          ),
        ),
      };
    });
    assert.ok(
      hovered.visible && hovered.hit && hovered.contrast >= 4.5,
      `simulate action remains visible and readable on hover: ${JSON.stringify({ runBackground, ...hovered })}`,
    );
    assert.equal(await dialog.isVisible(), true);
    await run.click();
    const options = dialog.getByRole("navigation", {
      name: t("Timetable alternatives", "可选时间表"),
    });
    await options
      .getByText(t("Schedule 1 / 2", "方案 1 / 2"), { exact: true })
      .waitFor()
      .catch(async (error) => {
        await page.screenshot({
          path: resolve(out, `simulation-result-failure-${width}.png`),
        });
        console.error(
          JSON.stringify(
            {
              dialog: await dialog.innerText(),
              errors,
              consoleErrors,
              workerUrls,
              failedAssets,
            },
            null,
            2,
          ),
        );
        throw error;
      });
    if (unavailableMetadata) {
      assert.match(
        await dialog.innerText(),
        /This semester's sections are unavailable for.*CSE 4444/,
      );
      assert.equal(await dialog.getByLabel(/CSE 4444.*17:00–18:00/).count(), 0);
      const failedReads = courseReads.filter(
        (number) => number === "4444",
      ).length;
      const successfulReads = courseReads.filter((number) => number !== "4444");
      unavailableMetadata = false;
      availabilityReads.length = 0;
      await run.click();
      await dialog.getByLabel(/CSE 4444.*17:00–18:00/).waitFor();
      assert.ok(
        courseReads.filter((number) => number === "4444").length > failedReads,
        "a second run retries failed course metadata in the same semester scope",
      );
      assert.deepEqual(
        courseReads.filter((number) => number !== "4444"),
        successfulReads,
        "successful course metadata stays cached while failed courses retry",
      );
      await options
        .getByText(t("Schedule 1 / 2", "方案 1 / 2"), { exact: true })
        .waitFor();
    }
    await close.focus();
    await page.keyboard.press("ArrowRight");
    await options
      .getByText(t("Schedule 2 / 2", "方案 2 / 2"), { exact: true })
      .waitFor();
    await close.focus();
    await page.keyboard.press("ArrowLeft");
    await options
      .getByText(t("Schedule 1 / 2", "方案 1 / 2"), { exact: true })
      .waitFor();
    assert.deepEqual(
      availabilityReads
        .filter((read) => read.round === 0)
        .map((read) => read.section)
        .sort(),
      ["FIXED", "LAB", "LATE", "NEAR", "SESSION2", "online"],
      "first simulation refreshes every section including fixed and asynchronous courses",
    );
    const frame = dialog.locator("[data-simulation-timetable]");
    const initialFrame = await frame.evaluate((element) => [
      element.dataset.timeStart,
      element.dataset.timeEnd,
    ]);
    assert.equal(await dialog.getByLabel(/CSE 4444.*17:00–18:00/).count(), 1);
    await frame.locator("summary").click();
    await frame
      .getByRole("button", {
        name: t("Choose a week", "查看某一周"),
        exact: true,
      })
      .click();
    assert.equal(await dialog.getByLabel(/CSE 4444.*17:00–18:00/).count(), 0);
    await frame
      .getByRole("button", {
        name: t("All teaching weeks", "全部教学周"),
        exact: true,
      })
      .click();
    assert.equal(await dialog.getByLabel(/CSE 4444.*17:00–18:00/).count(), 1);
    await frame.locator("summary").click();
    const next = options.getByRole("button", {
      name: t("Next timetable", "下一种时间表"),
    });
    await next.click();
    await options
      .getByText(t("Schedule 2 / 2", "方案 2 / 2"), { exact: true })
      .waitFor();
    assert.equal(await dialog.getByLabel(/CSE 2222.*12:00–13:00/).count(), 2);
    assert.deepEqual(
      await frame.evaluate((element) => [
        element.dataset.timeStart,
        element.dataset.timeEnd,
      ]),
      initialFrame,
    );
    if (width > 850) {
      await page.keyboard.press("ArrowLeft");
      await options.getByText("Schedule 1 / 2", { exact: true }).waitFor();
      const editable = dialog.getByRole("combobox", {
        name: "CSE 2222 Lecture",
        exact: true,
      });
      await editable.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await options.getByText("Schedule 1 / 2", { exact: true }).isVisible(),
        true,
      );
      await options.focus();
      await page.keyboard.press("ArrowRight");
      await options.getByText("Schedule 2 / 2", { exact: true }).waitFor();
      assert.equal(
        await options.evaluate((element) => document.activeElement === element),
        true,
      );
    }
    const save = dialog.getByRole("button", {
      name: t("Save this schedule group", "保存这组课表"),
      exact: true,
    });
    const bounds = await save.boundingBox();
    assert.ok(
      bounds &&
        bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.y + bounds.height <= height,
      `save actions must remain visible at ${width}px`,
    );
    const layout = await dialog.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
      body:
        element.querySelector('[data-analytics-area="planning_simulation"]')
          .parentElement.scrollHeight -
        element.querySelector('[data-analytics-area="planning_simulation"]')
          .parentElement.clientHeight,
    }));
    assert.ok(
      layout.scroll <= layout.client + 1,
      `dialog overflows at ${width}px`,
    );
    assert.ok(
      layout.body <= 2,
      `outer dialog unexpectedly scrolls ${layout.body}px at ${width}px`,
    );
    const grid = dialog.getByLabel(t("Week at a glance", "一周课程概览"), {
      exact: true,
    });
    const fitted = await grid.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        scroll: element.scrollHeight - element.clientHeight,
        visible: [...element.querySelectorAll("button")].every((button) => {
          const block = button.getBoundingClientRect();
          return block.top >= bounds.top && block.bottom <= bounds.bottom + 1;
        }),
        parentScroll:
          element.closest("[data-simulation-timetable]").parentElement
            .scrollHeight -
          element.closest("[data-simulation-timetable]").parentElement
            .clientHeight,
      };
    });
    assert.ok(
      fitted.visible && fitted.scroll <= 1 && fitted.parentScroll <= 1,
      `whole timetable must fit at ${width}px: ${JSON.stringify(fitted)}`,
    );
    const colors = await dialog
      .locator('[aria-label="Week at a glance"], [aria-label="一周课程概览"]')
      .locator("button")
      .evaluateAll((elements) => [
        ...new Set(
          elements.map((element) => getComputedStyle(element).backgroundColor),
        ),
      ]);
    assert.ok(
      colors.length >= 2,
      "different courses must have distinct colors",
    );
    await page.screenshot({
      path: resolve(out, `simulation-${width}-${locale}.png`),
    });
    await save.click();
    await page.waitForFunction(
      (key) =>
        !!JSON.parse(localStorage.getItem(key) || "null")?.schedule.calendars
          ?.length,
      PLAN_STORAGE_KEY,
    );
    const stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      PLAN_STORAGE_KEY,
    );
    assert.ok(
      stored.schedule.calendars[0].events.some(
        (event) =>
          event.title.includes("CSE 2222") &&
          easternMinutes(event.start) === 720,
      ),
    );
    if (width <= 850)
      await dialog
        .getByRole("button", {
          name: t("Sections & preferences", "班次与偏好"),
          exact: true,
        })
        .click();
    const select = dialog.getByRole("combobox", {
      name: "CSE 2222 Lecture",
      exact: true,
    });
    assert.match(await select.innerText(), /Automatic|自动/);
    await select.click();
    await page
      .getByRole("option")
      .filter({ hasText: /^LATE ·/ })
      .click();
    availabilityRound = 1;
    await run.click();
    await options
      .getByText(t("Schedule 1 / 1", "方案 1 / 1"), { exact: true })
      .waitFor();
    assert.equal(await next.isDisabled(), true);
    assert.deepEqual(
      availabilityReads
        .filter((read) => read.round === 1)
        .map((read) => read.section)
        .sort(),
      ["FIXED", "LAB", "LATE", "NEAR", "SESSION2", "online"],
      "each run refreshes all sections and every selected component",
    );
    assert.equal(
      (await frame.locator('[data-availability="full"]').count()) >= 1,
      true,
      "full fixed sections are visibly marked on the timetable",
    );
    assert.equal(
      (await frame.locator('[data-availability="waitlist"]').count()) >= 1,
      true,
      "asynchronous waitlisted sections stay visible in the timetable legend",
    );
    assert.equal(
      (await frame.locator('[data-availability="unknown"]').count()) >= 1,
      true,
      "failed reads replace previously open seats with unknown",
    );
    await frame.locator("summary").click();
    assert.match(
      await frame.innerText(),
      /Waitlist available · 0 seats · 3\/10|可候补 · 余位 0 · 3\/10/,
    );
    await frame.locator("summary").click();
    if (width <= 850)
      await dialog
        .getByRole("button", {
          name: t("Sections & preferences", "班次与偏好"),
          exact: true,
        })
        .click();
    await dialog
      .getByRole("button", {
        name: t("Use automatic sections", "全部自动选择"),
        exact: true,
      })
      .click();
    assert.match(await select.innerText(), /Automatic|自动/);
    availabilityRound = 2;
    await run.click();
    await options
      .getByText(t("Schedule 1 / 2", "方案 1 / 2"), { exact: true })
      .waitFor();
    await dialog
      .getByRole("combobox", {
        name: t("Save destination", "课表保存位置"),
        exact: true,
      })
      .click();
    await page
      .getByRole("option", {
        name: t("Save as a new group", "保存为新的课表组"),
        exact: true,
      })
      .click();
    await save.click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).schedule.calendars?.length === 2,
      PLAN_STORAGE_KEY,
    );
    if (width <= 850)
      await dialog
        .getByRole("button", {
          name: t("Sections & preferences", "班次与偏好"),
          exact: true,
        })
        .click();
    const savedGroups = dialog
      .getByRole("heading", {
        name: t("Saved schedule groups", "已保存课表组"),
        exact: true,
      })
      .locator("..");
    const retainedOptions = dialog.getByRole("navigation", {
      name: t("Timetable alternatives", "可选时间表"),
      includeHidden: true,
    });
    const mainCandidate = await retainedOptions.textContent();
    await savedGroups.getByRole("button").first().click();
    const savedOptions = page.getByRole("navigation", {
      name: t("Saved schedule alternatives", "已保存课表切换"),
      exact: true,
    });
    await savedOptions
      .getByText(t("Saved schedule 1 / 2", "已保存课表 1 / 2"), { exact: true })
      .waitFor();
    const savedDialog = page.getByRole("dialog").filter({ has: savedOptions });
    const savedWeek = savedDialog.locator('[data-fit="true"]');
    const savedScale = await savedWeek.evaluate((element) =>
      element.style.getPropertyValue("--hour-count"),
    );
    await page.keyboard.press("ArrowRight");
    await savedOptions
      .getByText(t("Saved schedule 2 / 2", "已保存课表 2 / 2"), { exact: true })
      .waitFor();
    const savedLayout = await savedWeek.evaluate((element) => ({
      scroll: element.scrollHeight - element.clientHeight,
      bottom: element.getBoundingClientRect().bottom,
    }));
    assert.ok(
      savedLayout.scroll <= 2 && savedLayout.bottom <= height,
      `saved timetable must fit at ${width}px: ${JSON.stringify(savedLayout)}`,
    );
    assert.equal(
      await savedWeek.evaluate((element) =>
        element.style.getPropertyValue("--hour-count"),
      ),
      savedScale,
    );
    await page.screenshot({
      path: resolve(out, `saved-simulation-${width}-${locale}.png`),
    });
    await savedDialog
      .getByRole("button", { name: t("Close", "关闭"), exact: true })
      .last()
      .click();
    assert.equal(
      await retainedOptions.textContent(),
      mainCandidate,
      "saved-preview arrow keys cannot also move the underlying main simulation",
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `simulation ${width}px ${locale}: automatic choices, cycling, pin/release, saved candidate and layout passed`,
    );
  }
} finally {
  await browser.close();
}
