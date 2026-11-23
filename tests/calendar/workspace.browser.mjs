import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  emptyPlan,
  planSchema,
  PLAN_STORAGE_KEY,
} from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";
import {
  newYorkTime,
  semesterFingerprint,
} from "../../src/lib/calendar/schedules.ts";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.CALENDAR_TEST_BASE_URL ?? "http://localhost:3000",
);
const out = resolve(
  process.env.CALENDAR_SCREENSHOT_DIR ?? ".cache/calendar-browser",
);
await mkdir(out, { recursive: true });
const titles = [
  "BIOLOGY 1113 · Lab prep",
  "PSYCH 1100 · Read chapter",
  "MATH 1151 · Problem set",
  "CSE 2111 · Project checkpoint",
];
const events = titles.map((title, index) => ({
  id: `dense-${index}`,
  title,
  start: "2027-01-12T22:00:00Z",
  end: "2027-01-12T23:00:00Z",
  allDay: false,
  category: "assignment",
  description: `Synthetic calendar event ${index + 1}`,
  location: `Room ${index + 1}`,
}));
const plan = emptyPlan();
plan.schedule.calendars = Array.from({ length: 20 }, (_, index) =>
  calendarSchema.parse({
    id: `calendar-${index}`,
    title:
      index === 0
        ? "Synthetic busy calendar"
        : `Synthetic calendar ${index + 1}`,
    kind: "personal",
    includeAcademic: false,
    events:
      index === 0
        ? events
        : [
            {
              ...events[0],
              id: `other-${index}`,
              title: `Other course ${index + 1}`,
            },
          ],
    updatedAt: "2027-01-01",
  }),
);
const seeded = planSchema.parse(plan);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
try {
  for (const [width, height, locale] of [
    [1440, 900, "en"],
    [768, 1024, "en"],
    [390, 844, "zh"],
    [320, 740, "en"],
  ]) {
    console.log(`calendar ${width}px ${locale}: isolated fixture`);
    const context = await browser.newContext({
      viewport: { width, height },
      acceptDownloads: true,
    });
    const errors = [],
      writes = [];
    await context.addInitScript(
      ({ plan, key, locale }) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
        if (!localStorage.getItem("calendar-fixture-seeded")) {
          localStorage.setItem(key, JSON.stringify(plan));
          localStorage.setItem("calendar-fixture-seeded", "1");
        }
      },
      { plan: seeded, key: PLAN_STORAGE_KEY, locale },
    );
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
        return route.abort();
      if (url.pathname === "/api/calendar/academic")
        return route.fulfill({ json: { days: [], fetchedAt: "2027-01-01" } });
      if (url.pathname.startsWith("/api/")) {
        if (!["GET", "HEAD"].includes(request.method()))
          writes.push({ path: url.pathname, body: request.postData() });
        return route.fulfill({
          status: 503,
          json: { error: "Isolated calendar fixture" },
        });
      }
      return route.continue();
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    const t = (en, zh) => (locale === "zh" ? zh : en);
    try {
      await page.goto(new URL("/calendar", base).href, {
        waitUntil: "domcontentloaded",
        timeout: 90_000,
      });
      const sidebar = page.getByRole("complementary", {
        name: t("Calendars", "日历清单"),
        exact: true,
        includeHidden: true,
      });
      const workspace = sidebar.locator("..");
      const content = workspace.locator(":scope > section");
      const dense = content.getByRole("button", {
        name: /4 overlapping events|4 项重叠日程/,
      });
      await dense.waitFor({ timeout: 30_000 });
      assert.equal(
        await sidebar.getByRole("button").count(),
        23,
        "20 private and 3 official calendar sources remain accessible",
      );
      const layout = await workspace.evaluate((node) => ({
        height: node.getBoundingClientRect().height,
        pageHeight: document.documentElement.scrollHeight,
      }));
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${width}px page overflow`,
      );
      if (width > 800) {
        const before = await content.evaluate((node) => node.scrollTop);
        assert.equal(
          await sidebar.evaluate(
            (node) => node.scrollHeight > node.clientHeight * 3,
          ),
          true,
          "many sources scroll inside their own sidebar",
        );
        await sidebar.evaluate((node) => {
          node.scrollTop = node.scrollHeight;
        });
        assert.equal(
          await content.evaluate((node) => node.scrollTop),
          before,
          "sidebar scrolling does not move the calendar",
        );
        assert.ok(
          layout.height <= height - 200 && layout.height >= 440,
          "desktop workspace fits the viewport",
        );
      } else {
        assert.equal(
          await sidebar.evaluate(
            (node) =>
              node.scrollWidth > node.clientWidth &&
              node.scrollHeight <= node.clientHeight + 2,
          ),
          true,
          "narrow sources scroll horizontally",
        );
      }
      await page.screenshot({
        path: resolve(out, `calendar-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await dense.click();
      assert.equal(
        await dense.evaluate((node) => {
          const caption = node.querySelector("small").getBoundingClientRect();
          const button = node.getBoundingClientRect();
          return (
            caption.bottom <= button.bottom + 1 &&
            caption.right <= button.right + 1
          );
        }),
        true,
        "the dense-event list action remains visible in the calendar column",
      );
      const rows = titles.map((title) =>
        content.getByRole("button", {
          name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
        }),
      );
      const colors = [];
      for (let index = 0; index < rows.length; index++) {
        await rows[index].waitFor();
        assert.ok(
          (await rows[index].boundingBox()).width > 200,
          "overlap list gives every event readable width",
        );
        colors.push(
          await rows[index].evaluate((node) =>
            getComputedStyle(node).getPropertyValue("--event-color").trim(),
          ),
        );
        await rows[index].click();
        const details = page.getByRole("dialog", {
          name: titles[index],
          exact: true,
        });
        await details
          .getByRole("heading", { name: titles[index], exact: true })
          .waitFor();
        await details
          .getByRole("button", {
            name: t("Close event details", "关闭日程详情"),
            exact: true,
          })
          .click();
      }
      assert.equal(
        new Set(colors).size,
        4,
        "the simultaneous courses have distinct colors",
      );
      await page.screenshot({
        path: resolve(out, `overlaps-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await content
        .getByRole("button", { name: t("Edit", "编辑"), exact: true })
        .click();
      const settings = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: t("Calendar settings", "日历设置"),
          exact: true,
        }),
      });
      const add = settings.getByRole("button", {
        name: t("Add reminder", "添加提醒"),
        exact: true,
      });
      await add.click();
      await settings
        .getByRole("combobox", {
          name: t("Reminder 1", "第 1 次提醒"),
          exact: true,
        })
        .click();
      await page
        .getByRole("option", {
          name: t("10 minutes before", "提前 10 分钟"),
          exact: true,
        })
        .click();
      await add.click();
      await settings
        .getByRole("combobox", {
          name: t("Reminder 2", "第 2 次提醒"),
          exact: true,
        })
        .click();
      await page
        .getByRole("option", {
          name: t("30 minutes before", "提前 30 分钟"),
          exact: true,
        })
        .click();
      await page.screenshot({
        path: resolve(out, `reminders-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await settings
        .getByRole("button", {
          name: t("Save calendar", "保存日历"),
          exact: true,
        })
        .click();
      await settings.waitFor({ state: "hidden" });
      const stored = () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key)),
          PLAN_STORAGE_KEY,
        );
      assert.deepEqual(
        (await stored()).schedule.calendars.find(
          (calendar) => calendar.id === "calendar-0",
        ).reminders,
        [10, 30],
      );
      await rows[0].click();
      await page
        .getByRole("dialog", { name: titles[0], exact: true })
        .getByRole("button", { name: t("Edit event", "编辑日程"), exact: true })
        .click();
      const editor = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: t("Edit event", "编辑日程"),
          exact: true,
        }),
      });
      await editor
        .getByRole("checkbox", {
          name: t("Use calendar reminders", "使用此日历的默认提醒"),
          exact: true,
        })
        .uncheck();
      await editor
        .getByRole("button", {
          name: t("Add reminder", "添加提醒"),
          exact: true,
        })
        .click();
      await editor
        .getByRole("combobox", {
          name: t("Reminder 1", "第 1 次提醒"),
          exact: true,
        })
        .click();
      await page
        .getByRole("option", {
          name: t("15 minutes before", "提前 15 分钟"),
          exact: true,
        })
        .click();
      await editor
        .getByRole("button", { name: t("Save event", "保存日程"), exact: true })
        .click();
      await editor.waitFor({ state: "hidden" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await sidebar
        .getByRole("button", { name: /^Synthetic busy calendar/ })
        .click();
      await dense.waitFor();
      const saved = (await stored()).schedule.calendars.find(
        (calendar) => calendar.id === "calendar-0",
      );
      assert.deepEqual(saved.reminders, [10, 30]);
      assert.deepEqual(
        saved.events.find((event) => event.id === "dense-0").reminders,
        [15],
      );
      const download = page.waitForEvent("download");
      await content
        .getByRole("button", { name: t("Export", "导出"), exact: true })
        .click();
      const ics = await readFile(await (await download).path(), "utf8");
      assert.equal(
        (ics.match(/BEGIN:VALARM/g) ?? []).length,
        7,
        "event override replaces the default reminders in device export",
      );
      assert.ok(
        ics.includes("TRIGGER:-PT15M") &&
          ics.includes("TRIGGER:-PT10M") &&
          ics.includes("TRIGGER:-PT30M"),
      );
      if (width > 800) {
        await page.evaluate((key) => {
          const plan = JSON.parse(localStorage.getItem(key));
          plan.schedule.calendars = plan.schedule.calendars.filter(
            (calendar) => calendar.id === "calendar-0",
          );
          localStorage.setItem(key, JSON.stringify(plan));
        }, PLAN_STORAGE_KEY);
        await page.reload({ waitUntil: "domcontentloaded" });
        await dense.waitFor();
        const compact = await workspace.evaluate((node) => ({
          height: node.getBoundingClientRect().height,
          pageHeight: document.documentElement.scrollHeight,
        }));
        assert.ok(
          Math.abs(compact.height - layout.height) <= 2,
          "source count does not change desktop workspace height",
        );
        assert.ok(
          Math.abs(compact.pageHeight - layout.pageHeight) <= 3,
          "source count does not stretch the document",
        );
      }
      // Saved alternatives share a scale while ordinary calendars keep date navigation.
      const alternatives = [
        [540, 780, 1020],
        [420, 720, 1140],
        [600, 840, 1080],
      ].map((starts, index) =>
        calendarSchema.parse({
          id: `simulation-${index}`,
          title: `Saved timetable ${index + 1}`,
          kind: "simulation",
          term: "Spring2027",
          campus: "COL",
          fingerprint: semesterFingerprint(seeded, "Spring2027"),
          includeAcademic: false,
          updatedAt: "2027-01-01",
          events: ["2027-01-12", "2027-01-19"].flatMap((date) =>
            starts.map((minute, course) => ({
              id: `simulation-${index}-${date}-${course}`,
              title: ["CSE 1111", "PSYCH 1100", "MATH 1151"][course],
              category: "class",
              allDay: false,
              start: newYorkTime(date, minute),
              end: newYorkTime(date, minute + 60),
              description: "Synthetic saved timetable",
              location: "Synthetic room",
            })),
          ),
        }),
      );
      await page.evaluate(
        ({ key, alternatives }) => {
          const plan = JSON.parse(localStorage.getItem(key));
          plan.schedule.calendars.push(...alternatives);
          localStorage.setItem(key, JSON.stringify(plan));
        },
        { key: PLAN_STORAGE_KEY, alternatives },
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await sidebar.getByRole("button", { name: /^Saved timetable 1/ }).click();
      const currentTitle = () => content.locator("h2").first().innerText();
      const fitWeek = content.locator('[data-fit="true"]');
      await fitWeek.waitFor();
      const frame = fitWeek
        .locator(":scope > div")
        .filter({ has: page.getByText("07:00", { exact: true }) });
      assert.equal(
        await content.evaluate(
          (node) => node.scrollHeight <= node.clientHeight + 1,
        ),
        true,
        "the full saved week fits inside its calendar pane",
      );
      if (width > 800) {
        const box = await fitWeek.boundingBox();
        assert.ok(
          box.y >= 0 && box.y + box.height <= height + 1,
          "the desktop week stays inside the visible viewport",
        );
      }
      assert.equal(await frame.getByText("07:00", { exact: true }).count(), 1);
      assert.equal(await frame.getByText("20:00", { exact: true }).count(), 1);
      const firstScale = await frame
        .getByText("07:00", { exact: true })
        .boundingBox();
      await content
        .getByRole("button", { name: t("Next week", "下一周"), exact: true })
        .click();
      await page.keyboard.press("ArrowRight");
      assert.equal(await currentTitle(), "Saved timetable 2");
      assert.equal(
        await content.getByText("2027-01-18 — 01-24", { exact: true }).count(),
        1,
        "alternative switching keeps the comparison week",
      );
      const secondScale = await frame
        .getByText("07:00", { exact: true })
        .boundingBox();
      assert.ok(
        Math.abs(firstScale.y - secondScale.y) <= 1,
        "alternative switching keeps the same hour positions",
      );
      await page.keyboard.press("ArrowLeft");
      assert.equal(await currentTitle(), "Saved timetable 1");
      const viewSelect = content.getByRole("combobox", {
        name: t("Calendar view", "日历视图"),
        exact: true,
      });
      await viewSelect.focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await currentTitle(),
        "Saved timetable 1",
        "combobox keyboard navigation does not switch groups",
      );
      await page.keyboard.press("Escape");
      await content
        .getByRole("button", { name: t("Edit", "编辑"), exact: true })
        .click();
      await page
        .getByRole("dialog")
        .filter({
          has: page.getByRole("heading", {
            name: t("Calendar settings", "日历设置"),
            exact: true,
          }),
        })
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .focus();
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await currentTitle(),
        "Saved timetable 1",
        "dialog keyboard navigation does not switch groups",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      for (const tag of ["input", "textarea", "select", "div"]) {
        await page.evaluate((tag) => {
          const field = document.createElement(tag);
          field.dataset.calendarKeyboardFixture = "true";
          if (tag === "div") field.contentEditable = "true";
          document.body.append(field);
          field.focus();
        }, tag);
        await page.keyboard.press("ArrowRight");
        assert.equal(
          await currentTitle(),
          "Saved timetable 1",
          `${tag} keyboard navigation does not switch groups`,
        );
        await page
          .locator('[data-calendar-keyboard-fixture="true"]')
          .evaluate((node) => node.remove());
      }
      await content
        .getByRole("button", {
          name: t("Next saved timetable", "下一组已保存课表"),
          exact: true,
        })
        .click();
      assert.equal(await currentTitle(), "Saved timetable 2");
      await page.screenshot({
        path: resolve(out, `saved-timetable-${width}.png`),
        fullPage: true,
        animations: "disabled",
      });
      await sidebar
        .getByRole("button", { name: /^Synthetic busy calendar/ })
        .click();
      const ordinaryDate = await content
        .getByText(/2027-\d{2}-\d{2} — \d{2}-\d{2}/)
        .innerText();
      await page.keyboard.press("ArrowRight");
      assert.equal(await currentTitle(), "Synthetic busy calendar");
      assert.equal(
        await content.getByText(ordinaryDate, { exact: true }).count(),
        1,
        "ordinary-calendar dates do not change on comparison shortcuts",
      );
      assert.equal(
        await fitWeek.count(),
        0,
        "ordinary calendars retain their normal week layout",
      );
      assert.deepEqual(errors, []);
      assert.equal(
        writes.some((request) =>
          /Synthetic|BIOLOGY|PSYCH|calendar-0/.test(request.body ?? ""),
        ),
        false,
        "private calendar fixture does not leak into API writes",
      );
      console.log(
        `PASS calendar ${width}px ${locale}: layout, four readable events, details, colors, persisted multi-reminders and ICS`,
      );
    } catch (error) {
      await page
        .screenshot({
          path: resolve(out, `failure-${width}.png`),
          fullPage: true,
          animations: "disabled",
        })
        .catch(() => {});
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "Page unavailable during failure capture")
        ).slice(-5000),
        errors,
      );
      throw error;
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
