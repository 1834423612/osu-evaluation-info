import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { emptyPlan, PLAN_STORAGE_KEY } from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";
import { semesterFingerprint } from "../../src/lib/calendar/schedules.ts";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.BASE_URL ?? "http://127.0.0.1:3102";
const output =
  process.env.CALENDAR_DAYS_OUTPUT ?? ".cache/calendar-days-browser";
await mkdir(output, { recursive: true });
const plan = emptyPlan();
const days = [
  {
    id: "thanksgiving",
    date: "2026-11-26",
    end: "2026-11-27",
    title: "Thanksgiving — no classes",
    categories: ["Autumn"],
    noClasses: true,
    kind: "holiday",
  },
  {
    id: "office",
    date: "2026-11-25",
    end: "2026-11-25",
    title: "Offices closed",
    categories: ["Autumn"],
    noClasses: false,
    kind: "holiday",
  },
];
const events = [
  {
    id: "class",
    title: "ECON 2001.01 · Principles of Microeconomics",
    start: "2026-11-23T15:00:00Z",
    end: "2026-11-23T18:00:00Z",
    allDay: false,
    category: "class",
    location: "Conard 239",
    description: "Lecture",
    session: "Regular Academic Term",
  },
  {
    id: "ordinary",
    title: "Personal all-day holiday",
    start: "2026-11-24",
    end: "2026-11-25",
    allDay: true,
    category: "holiday",
  },
  ...[
    ["lane-a", "MATH 1151 · Calculus I", "14:00", "14:50"],
    ["lane-b", "ART 2000 · Contemporary Art", "14:00", "14:50"],
    ["following", "HISTORY 2001 · History", "15:00", "15:50"],
  ].map(([id, title, start, end]) => ({
    id,
    title,
    start: `2026-11-24T${start}:00Z`,
    end: `2026-11-24T${end}:00Z`,
    allDay: false,
    category: "class",
  })),
  {
    id: "point",
    title: "Advising reminder",
    start: "2026-11-25T14:00:00Z",
    end: "2026-11-25T14:00:00Z",
    allDay: false,
    category: "event",
  },
];
plan.schedule.calendars = [
  calendarSchema.parse({
    id: "calendar-days",
    title: "Saved timetable",
    kind: "simulation",
    term: "Autumn2026",
    campus: "COL",
    fingerprint: semesterFingerprint(plan, "Autumn2026"),
    includeAcademic: true,
    events,
    updatedAt: "2026-11-26",
  }),
];
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
try {
  for (const width of [1440, 768, 390, 320]) {
    for (const fit of [true, false]) {
      const fixture = structuredClone(plan);
      fixture.schedule.calendars[0].kind = fit ? "simulation" : "personal";
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        timezoneId: "Asia/Shanghai",
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ({ plan, key }) => {
          localStorage.setItem(key, JSON.stringify(plan));
          localStorage.setItem("course-atlas:locale:v1", "en");
          localStorage.setItem("course-atlas:translation-guide:v1", "done");
        },
        { plan: fixture, key: PLAN_STORAGE_KEY },
      );
      await context.route("**/api/**", (route) =>
        new URL(route.request().url()).pathname === "/api/calendar/academic"
          ? route.fulfill({ json: { days } })
          : route.fulfill({
              status: 503,
              json: { error: "Isolated calendar fixture" },
            }),
      );
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`${base}/calendar`, { waitUntil: "domcontentloaded" });
      const week = page
        .locator('[data-calendar-date="2026-11-26"]')
        .locator("../..");
      await week
        .locator('[data-calendar-date="2026-11-26"][data-no-classes="true"]')
        .waitFor();
      assert.equal(await week.locator('[data-no-classes="true"]').count(), 2);
      assert.equal(
        await week
          .locator('[data-calendar-date="2026-11-24"]')
          .getAttribute("data-no-classes"),
        null,
      );
      assert.equal(
        await week
          .locator('[data-calendar-date="2026-11-25"]')
          .getAttribute("data-no-classes"),
        null,
      );
      const shade = await week
        .locator('[data-calendar-date="2026-11-26"]')
        .evaluate((node) => {
          const layer = getComputedStyle(node, "::before");
          return {
            image: layer.backgroundImage,
            top: layer.top,
            bottom: layer.bottom,
            pointerEvents: layer.pointerEvents,
          };
        });
      assert.match(shade.image, /repeating-linear-gradient/);
      assert.deepEqual(
        [shade.top, shade.bottom, shade.pointerEvents],
        ["0px", "0px", "none"],
      );
      assert.equal(
        await week
          .getByRole("button", {
            name: "Thanksgiving — no classes",
            exact: true,
          })
          .count(),
        2,
      );
      const event = week.getByRole("button", {
        name: /^ECON 2001\.01 · Principles of Microeconomics,/,
      });
      await event.waitFor();
      assert.equal(await week.getAttribute("data-fit"), fit ? "true" : null);
      const visibleInfo = await event.evaluate((node) =>
        [...node.children]
          .filter((child) => getComputedStyle(child).display !== "none")
          .map((child) => child.textContent),
      );
      if (width === 1440) {
        assert.equal(
          await event
            .locator("strong")
            .first()
            .evaluate((node) => node.scrollHeight <= node.clientHeight + 1),
          true,
          "a tall event must show the complete title when space is available",
        );
        assert.ok(
          visibleInfo.includes("ECON 2001.01 · Principles of Microeconomics"),
        );
        assert.ok(visibleInfo.includes("Conard 239"));
        assert.ok(visibleInfo.includes("Regular Academic Term"));
      } else
        assert.ok(
          visibleInfo.includes("ECON2001.01") ||
            visibleInfo.includes("ECON 2001.01 · Principles of Microeconomics"),
        );
      const lanes = week.locator('[data-calendar-date="2026-11-24"]');
      const first = lanes.getByRole("button", {
        name: /^MATH 1151 · Calculus I,/,
      });
      const second = lanes.getByRole("button", {
        name: /^ART 2000 · Contemporary Art,/,
      });
      const following = lanes.getByRole("button", {
        name: /^HISTORY 2001 · History,/,
      });
      // Equal 50-minute events must keep their real time rectangles. Their
      // 10-minute gap must survive even when overlapping lanes are very narrow.
      const firstBox = await first.boundingBox();
      const secondBox = await second.boundingBox();
      const followingBox = await following.boundingBox();
      const expectedHeight = ((followingBox.y - firstBox.y) * 50) / 60;
      for (const [label, box] of [
        ["first lane", firstBox],
        ["second lane", secondBox],
        ["following class", followingBox],
      ]) {
        assert.ok(
          Math.abs(box.height - expectedHeight) < 1,
          `${label} must retain its 50-minute height at ${width}px (fit=${fit}): ${box.height}px instead of ${expectedHeight}px`,
        );
      }
      assert.ok(firstBox.y + firstBox.height < followingBox.y);
      assert.ok(secondBox.y + secondBox.height < followingBox.y);
      assert.equal(await first.getAttribute("data-lanes"), "2");
      assert.match(await first.getAttribute("aria-label"), /9:00 AM–9:50 AM/);
      await first.focus();
      assert.equal(
        await first.evaluate((node) => node === document.activeElement),
        true,
      );
      const pointBox = await week
        .getByRole("button", { name: /^Advising reminder,/ })
        .boundingBox();
      assert.ok(
        pointBox.height >= 40,
        "point reminders retain their visible target",
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        true,
      );
      assert.deepEqual(errors, []);
      await page.screenshot({
        path: `${output}/calendar-${fit ? "fit" : "regular"}-${width}.png`,
        fullPage: true,
      });
      console.log(
        JSON.stringify({
          width,
          fit,
          stripes: 2,
          visibleInfo,
          eventHeight: firstBox.height,
          expectedHeight,
        }),
      );
      await context.close();
    }
  }
} finally {
  await browser.close();
}
