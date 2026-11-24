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
        : index === 1
          ? "Synthetic calendar with a deliberately long two-line source title"
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
async function verifyShareLifecycle() {
  const account = "calendar-sharing-fixture";
  const privateCalendar = calendarSchema.parse({
    id: "sharing-owned",
    title: "Share lifecycle calendar",
    kind: "personal",
    events: [events[0]],
    includeAcademic: false,
    updatedAt: "2027-01-01",
  });
  const sharingPlan = emptyPlan();
  sharingPlan.schedule.calendars = [privateCalendar];
  const published = {
    id: "db86554a-e4ad-42ca-a781-89ec78f1909c",
    token: "S".repeat(43),
    calendarIds: [privateCalendar.id],
    expiresAt: null,
  };
  let serverLinks = [
    {
      ...published,
      id: "3c58e159-e17c-4610-9a7a-96e8cd5b2042",
      token: "E".repeat(43),
      expiresAt: "2000-01-01T00:00:00Z",
    },
  ];
  let holdNextList = false,
    heldRead = null,
    readReady = null;
  const pauseList = () => {
    holdNextList = true;
    return new Promise((resolve) => {
      readReady = resolve;
    });
  };
  const releaseList = async () => {
    assert.ok(heldRead, "the delayed list request was observed");
    const held = heldRead;
    heldRead = null;
    const response = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/calendar/links",
    );
    await held.route.fulfill({ json: { links: held.snapshot } });
    await (await response).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  };
  const publications = [],
    revocations = [],
    errors = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  await context.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
      return route.abort();
    if (url.pathname === "/qa-calendar-seed")
      return route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><body></body>",
      });
    if (url.pathname === "/api/auth/get-session")
      return route.fulfill({
        json: {
          user: {
            id: account,
            email: "calendar-fixture@example.test",
            emailVerified: true,
            name: "Calendar fixture",
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
          session: {
            id: "calendar-fixture-session",
            userId: account,
            token: "synthetic",
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
          },
        },
      });
    if (url.pathname === "/api/calendar/academic")
      return route.fulfill({ json: { days: [], fetchedAt: "2027-01-01" } });
    if (url.pathname === "/api/planning/backup")
      return route.fulfill({
        json: { accountId: account, version: 1, plan: sharingPlan },
      });
    if (url.pathname === "/api/calendar/links") {
      if (request.method() === "GET") {
        const snapshot = structuredClone(serverLinks);
        if (holdNextList) {
          holdNextList = false;
          heldRead = { route, snapshot };
          readReady?.();
          return;
        }
        return route.fulfill({ json: { links: snapshot } });
      }
      if (request.method() === "POST") {
        publications.push(request.postDataJSON());
        serverLinks = [
          published,
          ...serverLinks.filter((link) => link.id !== published.id),
        ];
        return route.fulfill({
          json: {
            id: published.id,
            token: published.token,
            expiresAt: published.expiresAt,
          },
        });
      }
      if (request.method() === "DELETE") {
        const body = request.postDataJSON();
        revocations.push(body);
        serverLinks = serverLinks.filter((link) => link.id !== body.id);
        return route.fulfill({ json: { ok: true } });
      }
    }
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        json: { error: "Isolated calendar sharing fixture" },
      });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(new URL("/qa-calendar-seed", base).href);
    await page.evaluate(
      async ({ account, key, plan }) => {
        localStorage.setItem("course-atlas:locale:v1", "en");
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
        localStorage.setItem(
          key + ":account:" + account,
          JSON.stringify({
            plan,
            base: plan,
            cloud: plan,
            version: 1,
          }),
        );
        const db = await new Promise((resolve, reject) => {
          const request = indexedDB.open("waho-user-data", 2);
          request.onupgradeneeded = () => {
            request.result.createObjectStore("sync", { keyPath: "accountId" });
            request.result.createObjectStore("telemetry", { keyPath: "id" });
          };
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
        await new Promise((resolve, reject) => {
          const tx = db.transaction("sync", "readwrite");
          tx.objectStore("sync").put({
            version: 1,
            accountId: account,
            enabled: true,
            initialized: true,
            features: { favorites: false, planning: false, calendars: true },
            once: false,
            cursor: 0,
            baseline: {},
            seen: {},
            outbox: [],
            conflicts: [],
            needsReview: false,
            lastSyncAt: null,
          });
          tx.oncomplete = resolve;
          tx.onabort = () => reject(tx.error);
        });
        db.close();
      },
      { account, key: PLAN_STORAGE_KEY, plan: sharingPlan },
    );
    const initialList = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname === "/api/calendar/links",
    );
    await page.goto(new URL("/calendar", base).href, {
      waitUntil: "domcontentloaded",
    });
    await (await initialList).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    const card = page.locator('[data-calendar-id="sharing-owned"]');
    await card.waitFor();
    const mark = card.getByRole("img", {
      name: "Shared calendar",
      exact: true,
    });
    const backgroundMark = card.locator(
      '[role="img"][aria-label="Shared calendar"]',
    );
    assert.equal(
      await mark.count(),
      0,
      "expired links do not mark the calendar shared",
    );

    await card.hover();
    const delayed = pauseList();
    await card.hover();
    await card
      .getByRole("button", {
        name: "Share Share lifecycle calendar",
        exact: true,
      })
      .click();
    await delayed;
    const shares = page.getByRole("dialog").filter({
      has: page.getByRole("heading", {
        name: "Share calendars",
        exact: true,
      }),
    });
    const publish = shares.getByRole("button", {
      name: "Create or update link",
      exact: true,
    });
    assert.equal(
      await publish.isDisabled(),
      true,
      "publishing waits for the current link read",
    );
    assert.equal(
      publications.length,
      0,
      "a delayed list read cannot race a publish",
    );
    await releaseList();
    await publish.click();
    await shares
      .getByRole("heading", { name: "Share link ready", exact: true })
      .waitFor();
    await backgroundMark.waitFor();
    assert.deepEqual(
      publications.map((body) => body.calendarIds),
      [[privateCalendar.id]],
    );
    await shares
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await shares.waitFor({ state: "hidden" });
    await mark.waitFor();
    await page.screenshot({
      path: resolve(out, "sharing-active-1440.png"),
      fullPage: true,
      animations: "disabled",
    });

    await card.hover();
    await card
      .getByRole("button", {
        name: "Share Share lifecycle calendar",
        exact: true,
      })
      .click();
    const revoke = shares
      .getByRole("button", { name: "Revoke calendar share", exact: true })
      .first();
    await revoke.waitFor();
    const staleActiveList = pauseList();
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await staleActiveList;
    await revoke.click();
    await backgroundMark.waitFor({ state: "hidden" });
    await releaseList();
    await page.waitForFunction(
      () =>
        !document.querySelector(
          '[data-calendar-id="sharing-owned"] [role="img"]',
        ),
    );
    assert.equal(
      await backgroundMark.count(),
      0,
      "an older active-list read cannot revive a revoked mark",
    );
    await shares
      .getByRole("button", { name: "Close", exact: true })
      .last()
      .click();
    await shares.waitFor({ state: "hidden" });
    assert.equal(
      await mark.count(),
      0,
      "the revoked mark stays absent after closing the dialog",
    );
    assert.deepEqual(revocations, [{ id: published.id }]);
    assert.equal(
      await page.evaluate(
        (token) =>
          Object.values(localStorage).some((value) => value.includes(token)),
        published.token,
      ),
      false,
      "share capability tokens are not persisted in browser storage",
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS calendar sharing: delayed read guard, active/expired marks, revocation and stale-read isolation",
    );
  } catch (error) {
    await page
      .screenshot({
        path: resolve(out, "sharing-failure-1440.png"),
        fullPage: true,
      })
      .catch(() => {});
    throw error;
  } finally {
    if (heldRead) await heldRead.route.abort().catch(() => {});
    await context.close();
  }
}

const calendarViewports = [
  [1440, 900, "en"],
  [768, 1024, "en"],
  [390, 844, "zh"],
  [375, 693, "zh"],
  [320, 740, "en"],
];
const requestedWidth = process.env.CALENDAR_TEST_WIDTH;
assert.ok(
  !requestedWidth ||
    calendarViewports.some(([width]) => String(width) === requestedWidth),
  "CALENDAR_TEST_WIDTH must match an existing test viewport",
);
try {
  for (const [width, height, locale] of calendarViewports.filter(
    ([width]) => !requestedWidth || String(width) === requestedWidth,
  )) {
    console.log(`calendar ${width}px ${locale}: isolated fixture`);
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width <= 600,
      isMobile: width <= 600,
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
      const initialRange = content.getByText("2027-01-11 — 01-17", {
        exact: true,
      });
      await initialRange.waitFor();
      assert.equal(
        await page.evaluate(() => document.activeElement?.tagName),
        "BODY",
      );
      await page.keyboard.press("ArrowRight");
      await content.getByText("2027-01-18 — 01-24", { exact: true }).waitFor();
      await page.keyboard.press("ArrowLeft");
      await initialRange.waitFor();
      assert.equal(
        await sidebar.locator("[aria-pressed]").count(),
        23,
        "20 private and 3 official calendar sources remain accessible",
      );
      assert.equal(
        await sidebar.locator("button button").count(),
        0,
        "calendar selection and quick actions never nest buttons",
      );
      const officialCards = sidebar.locator('[data-official="true"]');
      assert.equal(await officialCards.count(), 3);
      assert.equal(
        await officialCards.getByRole("group").count(),
        0,
        "official calendars have no edit, share or remove quick actions",
      );
      assert.equal(
        await officialCards
          .getByText(t("Official", "官方"), { exact: true })
          .count(),
        3,
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
        if (width <= 600) {
          const detailLayout = await details.evaluate((node) => {
            const box = node.getBoundingClientRect();
            const title = node.querySelector("h2");
            return {
              x: box.x,
              y: box.y,
              width: box.width,
              height: box.height,
              titleSize: parseFloat(getComputedStyle(title).fontSize),
              text: node.innerText,
            };
          });
          assert.ok(
            detailLayout.x >= 0 && detailLayout.x + detailLayout.width <= width,
          );
          assert.ok(
            detailLayout.y >= 0 &&
              detailLayout.y + detailLayout.height <= height,
          );
          assert.ok(
            detailLayout.height < height * 0.6,
            "mobile event details stay compact",
          );
          assert.ok(
            detailLayout.titleSize <= 18,
            "mobile details use a restrained title scale",
          );
          assert.equal(
            (detailLayout.text.match(/Jan 12|1月12日/g) ?? []).length,
            1,
            "same-day details show the date once",
          );
        }
        await details
          .getByRole("button", {
            name: t("Close event details", "关闭日程详情"),
            exact: true,
          })
          .click();
        await details.waitFor({ state: "hidden" });
        assert.equal(
          await rows[index].evaluate((node) => document.activeElement === node),
          true,
          "closing event details restores focus to its event",
        );
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
        [600, 600, 1080],
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
              title: (index === 2
                ? ["ECON 2001.01", "ACCTMIS 2200", "MATH 1151"]
                : ["CSE 2111", "ECON 2001.01", "MATH 1151"])[course],
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
      const mixedSources = [
        calendarSchema.parse({
          id: "empty-personal",
          title: "Empty personal calendar",
          kind: "personal",
          events: [],
          includeAcademic: false,
          updatedAt: "2027-01-01",
        }),
        calendarSchema.parse({
          id: "mixed-combined",
          title: "Mixed combined calendar",
          kind: "combined",
          sourceIds: ["calendar-0", "simulation-0"],
          events: [],
          includeAcademic: false,
          updatedAt: "2027-01-01",
        }),
      ];
      await page.evaluate(
        ({ key, alternatives, mixedSources }) => {
          const plan = JSON.parse(localStorage.getItem(key));
          plan.schedule.calendars.push(...alternatives, ...mixedSources);
          localStorage.setItem(key, JSON.stringify(plan));
        },
        { key: PLAN_STORAGE_KEY, alternatives, mixedSources },
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      const currentTitle = () => content.locator("h2").first().innerText();
      const previewsVisible = () =>
        sidebar.evaluate((node) =>
          [...node.children].every((card) => {
            const preview = card.querySelector('div[aria-hidden="true"]');
            if (!preview || getComputedStyle(preview).display === "none")
              return false;
            const cardBox = card.getBoundingClientRect();
            const previewBox = preview.getBoundingClientRect();
            const title = card.querySelector('strong > span:not([role="img"])');
            const titleBox = title?.getBoundingClientRect();
            const metadata = card.querySelector("small");
            return (
              previewBox.height >= 40 &&
              previewBox.top >= cardBox.top &&
              previewBox.bottom <= cardBox.bottom &&
              previewBox.left >= cardBox.left &&
              previewBox.right <= cardBox.right &&
              (!titleBox || titleBox.bottom <= previewBox.top) &&
              (!metadata || metadata.scrollHeight <= metadata.clientHeight)
            );
          }),
        );
      await sidebar
        .getByRole("button", { name: /^Empty personal calendar/ })
        .click();
      assert.equal(
        await previewsVisible(),
        true,
        "all mixed-source thumbnails show for a personal selection",
      );
      await sidebar.getByRole("button", { name: /^Saved timetable 1/ }).click();
      assert.equal(
        await previewsVisible(),
        true,
        "selecting a simulation keeps every source thumbnail",
      );
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await currentTitle(),
        "Saved timetable 2",
        "comparison shortcuts work immediately while the source card keeps focus",
      );
      await page.keyboard.press("ArrowLeft");
      assert.equal(await currentTitle(), "Saved timetable 1");
      await sidebar
        .getByRole("button", { name: /^Mixed combined calendar/ })
        .click();
      assert.equal(
        await previewsVisible(),
        true,
        "combined selection keeps every thumbnail",
      );
      await sidebar.getByRole("button", { name: /^Saved timetable 1/ }).click();
      const fitWeek = content.locator('[data-fit="true"]');
      await fitWeek.waitFor();
      if (width <= 600) {
        const labels = fitWeek.locator("[data-compact-code]");
        assert.ok((await labels.count()) >= 3);
        const labelGeometry = [];
        for (const code of ["CSE2111", "ECON2001.01"]) {
          const label = labels.filter({ hasText: code }).first();
          await label.waitFor({ state: "visible" });
          assert.equal(await label.innerText(), code);
          labelGeometry.push(
            await label.evaluate((node) => {
              const box = node.getBoundingClientRect();
              const event = node.closest("button");
              const eventBox = event.getBoundingClientRect();
              const style = getComputedStyle(node);
              const eventStyle = getComputedStyle(event);
              return {
                code: node.textContent,
                label: box.toJSON(),
                event: eventBox.toJSON(),
                fontSize: style.fontSize,
                lineHeight: style.lineHeight,
                fontFamily: style.fontFamily,
                minHeight: eventStyle.minHeight,
                padding: eventStyle.padding,
                alignItems: eventStyle.alignItems,
                lanes: event.dataset.lanes,
                contained:
                  parseFloat(style.fontSize) <= 9 &&
                  style.textOverflow !== "ellipsis" &&
                  box.x >= eventBox.x &&
                  box.right <= eventBox.right + 1 &&
                  box.bottom <= eventBox.bottom + 1,
              };
            }),
          );
        }
        if (requestedWidth || labelGeometry.some((label) => !label.contained))
          console.log(
            "Calendar course geometry",
            width,
            JSON.stringify(labelGeometry),
          );
        assert.equal(
          labelGeometry.every((label) => label.contained),
          true,
          "the full course code stays readable inside a narrow event block",
        );
      }
      if (width <= 600) {
        await sidebar
          .getByRole("button", { name: /^Saved timetable 3/ })
          .click();
        for (const code of ["ECON2001.01", "ACCTMIS2200"]) {
          const label = fitWeek
            .locator("[data-compact-code]")
            .filter({ hasText: code })
            .first();
          await label.waitFor({ state: "visible" });
          assert.equal(await label.innerText(), code);
          assert.equal(
            await label.evaluate((node) => {
              const tile = node.closest("button");
              if (tile.dataset.lanes !== "2") return false;
              const bounds = tile.getBoundingClientRect();
              const walker = document.createTreeWalker(
                node,
                NodeFilter.SHOW_TEXT,
              );
              for (
                let text = walker.nextNode();
                text;
                text = walker.nextNode()
              ) {
                for (let index = 0; index < text.textContent.length; index++) {
                  const range = document.createRange();
                  range.setStart(text, index);
                  range.setEnd(text, index + 1);
                  const glyph = range.getBoundingClientRect();
                  if (!(
                    glyph.width > 0 &&
                    glyph.height > 0 &&
                    glyph.top >= bounds.top &&
                    glyph.bottom <= bounds.bottom &&
                    glyph.left >= bounds.left &&
                    glyph.right <= bounds.right
                  ))
                    return false;
                }
              }
              return true;
            }),
            true,
            "every character of a two-lane course code stays inside its event",
          );
        }
        await page.screenshot({
          path: resolve(out, `narrow-overlap-${width}.png`),
          fullPage: true,
          animations: "disabled",
        });
        await sidebar
          .getByRole("button", { name: /^Saved timetable 1/ })
          .click();
      }
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
      const firstCard = sidebar.locator('[data-calendar-id="simulation-0"]');
      const quickEdit = firstCard.getByRole("button", {
        name: t("Edit Saved timetable 1", "编辑 Saved timetable 1"),
        exact: true,
      });
      await firstCard.hover();
      const primary = firstCard.locator(":scope > button");
      assert.equal(
        await primary.evaluate((node) => {
          const button = node.getBoundingClientRect();
          const card = node.parentElement.getBoundingClientRect();
          return [button, card].every((rect) =>
            node.contains(
              document.elementFromPoint(
                rect.x + rect.width / 2,
                rect.y + rect.height / 2,
              ),
            ),
          );
        }),
        true,
        "the card and primary button centers always select the source, even with tools visible",
      );
      assert.equal(
        await firstCard.getByRole("group").evaluate((node) => {
          const card = node.parentElement.getBoundingClientRect();
          const primary = node.parentElement
            .querySelector(":scope > button")
            .getBoundingClientRect();
          return [...node.querySelectorAll("button")].every((button) => {
            const box = button.getBoundingClientRect();
            return (
              box.left >= primary.right &&
              box.left >= card.left &&
              box.right <= card.right &&
              box.top >= card.top &&
              box.bottom <= card.bottom
            );
          });
        }),
        true,
        "the three quick actions occupy a separate contained column",
      );
      await quickEdit.focus();
      if (width <= 600) {
        assert.equal(
          await page.evaluate(
            () => matchMedia("(hover: none) and (pointer: coarse)").matches,
          ),
          true,
          "phone fixtures use touch and a coarse pointer",
        );
        const target = await quickEdit.boundingBox();
        assert.ok(
          target.width >= 44 && target.height >= 44,
          "touch source actions have a 44px target",
        );
      }
      assert.equal(
        await quickEdit
          .locator("..")
          .evaluate((node) => getComputedStyle(node).opacity),
        "1",
        "keyboard focus reveals the quick actions",
      );
      await quickEdit.click();
      await settings.waitFor();
      assert.equal(
        await currentTitle(),
        "Saved timetable 2",
        "quick edit does not activate its source card",
      );
      await settings
        .getByRole("textbox", {
          name: t("Calendar name", "日历名称"),
          exact: true,
        })
        .fill("Unsaved card edit");
      await page.keyboard.press("ArrowRight");
      assert.equal(
        await currentTitle(),
        "Saved timetable 2",
        "quick edit isolates navigation keys",
      );
      let discardRequests = 0;
      page.once("dialog", async (dialog) => {
        assert.match(dialog.message(), /unsaved|尚未保存/);
        discardRequests++;
        await dialog.dismiss();
      });
      await settings
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      assert.equal(
        discardRequests,
        1,
        "quick edit uses the existing draft guard",
      );
      assert.equal(await settings.isVisible(), true);
      page.once("dialog", (dialog) => dialog.accept());
      await settings
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      await settings.waitFor({ state: "hidden" });

      await firstCard.hover();
      assert.equal(
        await firstCard
          .getByRole("group")
          .evaluate((node) => getComputedStyle(node).pointerEvents),
        "auto",
        "hover reveals clickable source actions",
      );
      await firstCard
        .getByRole("button", {
          name: t("Share Saved timetable 1", "分享 Saved timetable 1"),
          exact: true,
        })
        .click();
      const shares = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: t("Share calendars", "分享日历"),
          exact: true,
        }),
      });
      await shares.waitFor();
      assert.equal(
        await shares
          .getByRole("checkbox", { name: /^Saved timetable 1/ })
          .getAttribute("aria-checked"),
        "true",
      );
      assert.equal(
        await shares
          .getByRole("checkbox", { name: /^Saved timetable 2/ })
          .getAttribute("aria-checked"),
        "false",
      );
      assert.equal(
        await currentTitle(),
        "Saved timetable 2",
        "quick share does not activate its source card",
      );
      await shares
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      await shares.waitFor({ state: "hidden" });

      const emptyCard = sidebar.locator('[data-calendar-id="empty-personal"]');
      const quickRemove = emptyCard.getByRole("button", {
        name: t(
          "Remove Empty personal calendar",
          "移除 Empty personal calendar",
        ),
        exact: true,
      });
      await emptyCard.hover();
      await quickRemove.click();
      const removal = page.getByRole("dialog").filter({
        has: page.getByRole("heading", {
          name: t("Remove calendar", "移除日历"),
          exact: true,
        }),
      });
      await removal
        .getByRole("button", { name: t("Cancel", "取消"), exact: true })
        .click();
      assert.equal(await emptyCard.count(), 1, "cancel keeps the calendar");
      await emptyCard.hover();
      await quickRemove.click();
      await removal
        .getByRole("button", {
          name: t("Remove calendar", "移除日历"),
          exact: true,
        })
        .click();
      await removal.waitFor({ state: "hidden" });
      assert.equal(await emptyCard.count(), 0);
      assert.equal(
        (await stored()).schedule.calendars.some(
          (calendar) => calendar.id === "empty-personal",
        ),
        false,
        "quick removal persists only the owned target",
      );
      assert.equal(
        await currentTitle(),
        "Saved timetable 2",
        "quick removal does not change the active calendar",
      );
      assert.equal(await sidebar.locator('[data-official="true"]').count(), 3);
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
        0,
        "ordinary-calendar arrows navigate the week immediately from its source card",
      );
      await page.keyboard.press("ArrowLeft");
      await content.getByText(ordinaryDate, { exact: true }).waitFor();
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
  await verifyShareLifecycle();
} finally {
  await browser.close();
}
