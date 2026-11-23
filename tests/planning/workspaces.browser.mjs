import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { emptyPlan, PLAN_STORAGE_KEY } from "../../src/lib/planning/model.ts";
import {
  addPlanningCourse,
  boardCourses,
} from "../../src/lib/planning/workspace.ts";
import {
  SAVED_STORAGE_KEYS,
  SAVED_WORKSPACE_KEY,
} from "../../src/lib/saved/workspace.ts";
import { course as fixtureCourse } from "../user-data/fixtures.mjs";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.PLANNING_TEST_BASE_URL ?? "http://localhost:3000",
);
const out = resolve(
  process.env.PLANNING_WORKSPACES_SCREENSHOT_DIR ??
    ".cache/planning-workspaces-browser",
);
await mkdir(out, { recursive: true });
const folderId = "541ce40f-3962-4cc8-8b06-e7f5c5435811";
const shareId = "c3a74e7b-cc63-4aaf-9885-ef1819938e02";
const capability = "Q".repeat(43);
const account = "qa-account";
const accountKey = PLAN_STORAGE_KEY + ":account:" + account;
let sequence = 0;
let personal = emptyPlan();
for (const [subject, number, term] of [
  ["PSYCH", "1100", "Autumn2026"],
  ["MATH", "1151", "Spring2027"],
])
  personal = addPlanningCourse(
    personal,
    { subject, number },
    term,
    () => `workspace-${++sequence}`,
  );
personal.semesters = personal.semesters.map((semester) => ({
  ...semester,
  courses: semester.courses.map((course) => ({
    ...course,
    title: `${course.subject} ${course.number} personal course`,
    credits: 3,
  })),
}));
const oldFavorite = {
  ...fixtureCourse,
  id: "1268-CSE-2221-COL",
  subject: "CSE",
  catalogNumber: "2221",
  title: "Software I: Software Components",
  sections: fixtureCourse.sections.map((section) => ({
    ...section,
    section: "0010",
  })),
};
const favorites = {
  version: 2,
  records: Object.fromEntries(
    SAVED_STORAGE_KEYS.map((key, i) => [
      key,
      i === 0 ? JSON.stringify([oldFavorite]) : "[]",
    ]),
  ),
  collections: [
    {
      id: folderId,
      name: "Earlier favorites",
      icon: "lucide:folder",
      tags: ["Keep metadata"],
      members: ["course:" + oldFavorite.id],
    },
  ],
};
const publicSnapshot = {
  version: 1,
  title: "Friend’s Spring alternative",
  semesters: [
    {
      term: "Spring2027",
      campus: "COL",
      courses: [
        {
          subject: "CSE",
          number: "2221",
          title: "Software I: Software Components",
          credits: 4,
          section: "0010",
        },
      ],
    },
  ],
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const readRows = (plan) =>
  boardCourses(plan).map(({ course, term }) => [
    course.subject,
    course.number,
    term,
  ]);
const personalRows = readRows(personal);

async function createContext(width, height, locale, signedIn = false) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: "reduce",
  });
  const requests = [],
    publications = [],
    reads = [],
    errors = [];
  await context.addInitScript(
    ({
      personal,
      favorites,
      planKey,
      workspaceKey,
      accountKey,
      locale,
      signedIn,
    }) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      if (!localStorage.getItem("planning-workspaces-seeded")) {
        localStorage.setItem(planKey, JSON.stringify(personal));
        localStorage.setItem(workspaceKey, JSON.stringify(favorites));
        if (signedIn)
          localStorage.setItem(
            accountKey,
            JSON.stringify({ plan: personal, base: null, version: 0 }),
          );
        localStorage.setItem("planning-workspaces-seeded", "1");
      }
    },
    {
      personal,
      favorites,
      planKey: PLAN_STORAGE_KEY,
      workspaceKey: SAVED_WORKSPACE_KEY,
      accountKey,
      locale,
      signedIn,
    },
  );
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
      return route.abort();
    if (url.pathname === "/api/auth/get-session")
      return route.fulfill({
        json: signedIn
          ? {
              user: {
                id: account,
                email: "qa-account@example.test",
                emailVerified: true,
                name: "QA account",
                createdAt: "2026-01-01T00:00:00Z",
                updatedAt: "2026-01-01T00:00:00Z",
              },
              session: {
                id: "qa-workspaces-session",
                userId: account,
                token: "synthetic",
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
              },
            }
          : null,
      });
    if (url.pathname === "/api/catalog/course") {
      const query = Object.fromEntries(url.searchParams);
      if (!query.subject || !query.catalog || !query.campus)
        return route.fulfill({
          status: 503,
          json: { error: "Isolated non-planner lookup" },
        });
      requests.push(query);
      const termCode = query.term || "1272";
      return route.fulfill({
        json: {
          course: {
            ...fixtureCourse,
            id: `${termCode}-${query.subject}-${query.catalog}-${query.campus.toUpperCase()}`,
            subject: query.subject,
            catalogNumber: query.catalog,
            termCode,
            term: termCode === "1268" ? "Autumn 2026" : "Spring 2027",
            campusCode: query.campus.toUpperCase(),
            title: `${query.subject} ${query.catalog} official course`,
          },
          sourceMode: "official",
        },
      });
    }
    if (url.pathname === "/api/planning/shares/read") {
      reads.push(route.request().postDataJSON());
      return route.fulfill({
        json: { snapshot: publicSnapshot, expiresAt: null },
      });
    }
    if (url.pathname === "/api/planning/shares") {
      if (route.request().method() === "POST") {
        publications.push(route.request().postDataJSON());
        return route.fulfill({
          json: { id: shareId, title: "QA share", capability, expiresAt: null },
        });
      }
      return route.fulfill({ json: { shares: [] } });
    }
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        status: 503,
        json: { error: "QA isolated workspace" },
      });
    return route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /hydration|maximum update depth|module not found/i.test(message.text())
    )
      errors.push(message.text());
  });
  const t = (en, zh) => (locale === "zh" ? zh : en);
  const dialog = (title) =>
    page
      .getByRole("dialog")
      .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  const close = async (element, discard = false) => {
    const confirm = (dialog) => dialog.accept();
    if (discard) page.on("dialog", confirm);
    try {
      await element
        .getByRole("button", { name: t("Close", "关闭"), exact: true })
        .last()
        .click();
      await element.waitFor({ state: "hidden" });
    } finally {
      if (discard) page.off("dialog", confirm);
    }
  };
  const toolbar = () =>
    page.getByRole("region", {
      name: t("Planning tools", "规划工具栏"),
      exact: true,
    });
  const showTools = async () => {
    if (width > 600) return;
    const toggle = toolbar().getByRole("button", {
      name: t("Planning tools", "规划工具"),
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) !== "true")
      await toggle.click();
  };
  const hideTools = async () => {
    if (width > 600) return;
    const toggle = toolbar().getByRole("button", {
      name: t("Planning tools", "规划工具"),
      exact: true,
    });
    if ((await toggle.getAttribute("aria-expanded")) === "true")
      await toggle.click();
  };
  const settledMenu = async () => {
    const menu = page.getByRole("menu");
    await menu.waitFor({ state: "visible" });
    await page.waitForFunction(
      ({ width, height }) => {
        const node = [...document.querySelectorAll('[role="menu"]')].find(
          (element) =>
            element.getAttribute("data-state") === "open" &&
            element.getClientRects().length,
        );
        if (!node) return false;
        const bounds = node.getBoundingClientRect();
        return (
          bounds.x >= 11 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= width - 11 &&
          bounds.y + bounds.height <= height
        );
      },
      { width, height },
    );
    return menu;
  };
  const workspacePicker = () =>
    page.getByRole(width <= 600 ? "button" : "combobox", {
      name: t("Choose planning workspace", "选择规划工作区"),
      exact: true,
    });
  const chooseWorkspace = async (title, capture) => {
    await workspacePicker().click();
    if (capture) {
      await settledMenu();
      await page.screenshot({
        path: resolve(out, capture),
        animations: "disabled",
      });
    }
    await page
      .getByRole(width <= 600 ? "menuitemradio" : "option", {
        name: title,
        exact: true,
      })
      .click();
  };
  const openGlobalShare = async () => {
    await showTools();
    await page
      .getByRole(width <= 600 ? "menuitem" : "button", {
        name: t("Share semester plan", "分享学期规划"),
        exact: true,
      })
      .click();
    await dialog(t("Share semester plan", "分享学期规划")).waitFor({
      state: "visible",
    });
  };
  const barStats = () =>
    toolbar().evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const button = [...element.querySelectorAll("button")].find(
        (node) => node.getClientRects().length,
      );
      return {
        height: bounds.height,
        width: bounds.width,
        y: bounds.y,
        shadow: getComputedStyle(element).boxShadow,
        fontSize: button ? parseFloat(getComputedStyle(button).fontSize) : null,
        stuck: element.getAttribute("data-stuck"),
      };
    });
  return {
    context,
    page,
    requests,
    publications,
    reads,
    errors,
    t,
    dialog,
    close,
    showTools,
    hideTools,
    toolbar,
    workspacePicker,
    chooseWorkspace,
    openGlobalShare,
    barStats,
    settledMenu,
  };
}

try {
  for (const [width, height, locale] of [
    [1440, 1000, "en"],
    [390, 950, "zh"],
    [320, 900, "en"],
  ]) {
    console.log(
      `workspaces ${width}px ${locale}: local plans and semester actions`,
    );
    const {
      context,
      page,
      requests,
      errors,
      t,
      dialog,
      close,
      showTools,
      hideTools,
      toolbar,
      workspacePicker,
      chooseWorkspace,
      openGlobalShare,
      barStats,
      settledMenu,
    } = await createContext(width, height, locale);
    await page.goto(new URL("/planning", base).href, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await page
      .locator('[data-analytics-area="planning_board"]')
      .getByRole("button", { name: "MATH 1151", exact: true })
      .waitFor();
    if (width === 320 && locale === "en") {
      const labels = page.locator(
        "[data-planning-tools][data-scoped] [data-scoped-action-label]",
      );
      await labels.first().waitFor({ state: "visible" });
      const clipped = await labels.evaluateAll((elements) =>
        elements.flatMap((label) => {
          const button = label.closest("button");
          if (!button || !label.getClientRects().length) return [];
          const text = label.getBoundingClientRect(),
            box = button.getBoundingClientRect();
          return text.left < box.left - 0.5 ||
            text.right > box.right + 0.5 ||
            text.top < box.top - 0.5 ||
            text.bottom > box.bottom + 0.5
            ? [
                {
                  label: label.textContent,
                  text: {
                    x: text.x,
                    y: text.y,
                    width: text.width,
                    height: text.height,
                  },
                  button: {
                    x: box.x,
                    y: box.y,
                    width: box.width,
                    height: box.height,
                  },
                },
              ]
            : [];
        }),
      );
      assert.deepEqual(
        clipped,
        [],
        "semester action labels must fit inside their own buttons at 320px",
      );
    }
    const inline = await barStats();
    assert.equal(
      inline.shadow,
      "none",
      "inline planning controls must have no shadow",
    );
    assert.equal(inline.stuck, null);
    if (width <= 600) {
      assert.ok(
        inline.height <= 52 && inline.fontSize <= 13,
        `mobile controls must stay compact: ${JSON.stringify(inline)}`,
      );
      console.log(
        `workspaces mobile layout ${width}px inline: ${JSON.stringify(inline)}`,
      );
      await page.screenshot({
        path: resolve(out, `inline-${width}-${locale}.png`),
        animations: "disabled",
      });
      const underlying = page
        .locator('[data-analytics-area="planning_board"]')
        .getByRole("button", { name: "MATH 1151", exact: true });
      await underlying.scrollIntoViewIfNeeded();
      await chooseWorkspace(t("My academic plan", "我的学业规划"));
      assert.equal(await page.getByRole("dialog").count(), 0);
      for (const [menuIndex, open] of [
        async () => workspacePicker().click(),
        showTools,
      ].entries()) {
        const bounds = await underlying.boundingBox();
        assert.ok(
          bounds && bounds.y >= 0 && bounds.y + bounds.height <= height,
        );
        await open();
        await settledMenu();
        const menuBounds = await page.getByRole("menu").boundingBox();
        assert.ok(
          menuBounds &&
            menuBounds.width <= width - 24 &&
            menuBounds.height <= 280 &&
            menuBounds.x >= 11 &&
            menuBounds.x + menuBounds.width <= width - 11,
          `mobile menu must fit: ${JSON.stringify(menuBounds)}`,
        );
        await page.screenshot({
          path: resolve(
            out,
            `${menuIndex ? "tools-menu" : "mobile-menu"}-${width}-${locale}.png`,
          ),
          animations: "disabled",
        });
        await page.mouse.click(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
        await page.getByRole("menu").waitFor({ state: "hidden" });
        assert.equal(
          await page.getByRole("dialog").count(),
          0,
          "outside click must not open the underlying course card",
        );
        assert.match(
          await workspacePicker().innerText(),
          locale === "zh" ? /我的学业规划/ : /My academic plan/,
        );
      }
    }
    await page
      .getByRole("button", {
        name: t("New independent plan", "新建独立方案"),
        exact: true,
      })
      .click();
    const create = dialog(t("New independent plan", "新建独立方案"));
    await create
      .getByRole("textbox", { name: t("Plan name", "方案名称") })
      .fill("Friend’s alternative");
    await create
      .getByRole("button", { name: t("Save plan", "保存方案"), exact: true })
      .click();
    await create.waitFor({ state: "hidden" });
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key) || "null")?.scenarios?.length ===
        1,
      PLAN_STORAGE_KEY,
    );
    let stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      PLAN_STORAGE_KEY,
    );
    assert.deepEqual(readRows(stored), personalRows);
    assert.equal(boardCourses(stored.scenarios[0].plan).length, 0);
    assert.match(await workspacePicker().innerText(), /Friend/);
    await chooseWorkspace(
      "Friend’s alternative",
      width <= 600 ? `mobile-menu-${width}-${locale}.png` : undefined,
    );
    assert.match(await workspacePicker().innerText(), /Friend/);
    await chooseWorkspace(t("My academic plan", "我的学业规划"));
    const spring = page.getByRole("region", {
      name: t("Spring 2027", "2027 春季"),
      exact: true,
    });
    await spring
      .getByRole("button", {
        name: t("Import favorites · Spring 2027", "从收藏导入 · 2027 春季"),
        exact: true,
      })
      .click();
    const importing = dialog(t("Import favorite courses", "导入收藏课程"));
    assert.equal(
      await importing
        .getByRole("combobox", { name: t("Destination semester", "目标学期") })
        .isDisabled(),
      true,
    );
    await importing
      .getByRole("combobox", { name: t("Source folder", "来源收藏夹") })
      .click();
    await page
      .getByRole("option", { name: "Earlier favorites", exact: true })
      .click();
    await importing
      .getByRole("button", {
        name: t("Clear selection", "取消全选"),
        exact: true,
      })
      .click();
    assert.equal(await importing.getByRole("checkbox").isChecked(), false);
    await importing
      .getByRole("button", {
        name: t("Select entire folder", "选择整个收藏夹"),
        exact: true,
      })
      .click();
    await importing
      .getByRole("button", { name: /Import selected courses|导入所选课程/ })
      .click();
    await page.waitForFunction(
      (key) =>
        JSON.parse(localStorage.getItem(key)).semesters.some((s) =>
          s.courses.some((c) => c.subject === "CSE"),
        ),
      PLAN_STORAGE_KEY,
    );
    stored = await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      PLAN_STORAGE_KEY,
    );
    const imported = boardCourses(stored).find(
      ({ course }) => course.subject === "CSE",
    );
    assert.equal(imported.term, "Spring2027");
    assert.equal(imported.course.section, undefined);
    assert.equal(
      stored.schedule.sectionChoices?.Spring2027?.["CSE 2221"]?.length ?? 0,
      0,
    );
    assert.equal(boardCourses(stored.scenarios[0].plan).length, 0);
    assert.deepEqual(
      readRows(stored).filter(([subject]) => subject !== "CSE"),
      personalRows,
    );
    await close(importing);
    const exportButton = spring.getByRole("button", {
      name: t("Save to a folder · Spring 2027", "转存至收藏夹 · 2027 春季"),
      exact: true,
    });
    const expectedIds = ["1272-CSE-2221-COL", "1272-MATH-1151-COL"].sort();
    for (const existing of [false, true]) {
      const startRequest = requests.length;
      await exportButton.click();
      const exporting = dialog(t("Save planned courses", "转存规划课程"));
      assert.equal(
        await exporting
          .getByRole("combobox", { name: t("Courses from", "转存范围") })
          .isDisabled(),
        true,
      );
      if (existing) {
        await exporting
          .getByRole("combobox", {
            name: t("Destination folder", "目标收藏夹"),
          })
          .click();
        await page
          .getByRole("option", { name: "Earlier favorites", exact: true })
          .click();
      } else
        await exporting
          .getByRole("textbox", { name: t("Folder name", "收藏夹名称") })
          .fill("Spring 2027 portfolio");
      await exporting
        .getByRole("button", {
          name: t("Save courses to folder", "转存课程至收藏夹"),
          exact: true,
        })
        .click();
      await exporting
        .getByText(
          t("2 courses saved to the folder.", "已将 2 门课程转存至收藏夹。"),
          { exact: true },
        )
        .waitFor();
      const saved = await page.evaluate(
        (key) => JSON.parse(localStorage.getItem(key)),
        SAVED_WORKSPACE_KEY,
      );
      assert.equal(saved.version, 2);
      const destination = saved.collections.find(
        (f) =>
          f.name === (existing ? "Earlier favorites" : "Spring 2027 portfolio"),
      );
      assert.deepEqual(
        destination.members
          .filter((key) => key.startsWith("course:1272-"))
          .map((key) => key.slice(7))
          .sort(),
        expectedIds,
      );
      assert.ok(!destination.members.some((key) => key.includes("PSYCH")));
      assert.deepEqual(saved.collections.find((f) => f.id === folderId).tags, [
        "Keep metadata",
      ]);
      assert.ok(
        saved.collections
          .find((f) => f.id === folderId)
          .members.includes("course:" + oldFavorite.id),
      );
      const writtenCourses = JSON.parse(
        saved.records[SAVED_STORAGE_KEYS[0]],
      ).filter((c) => expectedIds.includes(c.id));
      assert.equal(writtenCourses.length, 2);
      assert.ok(
        writtenCourses.every(
          (c) => c.termCode === "1272" && c.campusCode === "COL",
        ),
      );
      // The reader can reuse correctly scoped details fetched while rendering the board.
      assert.ok(
        requests
          .slice(startRequest)
          .every(
            (query) =>
              query.term === "1272" &&
              query.campus === "col" &&
              query.subject !== "PSYCH",
          ),
      );
      await close(exporting);
    }
    await spring
      .getByRole("button", {
        name: t(
          "Share semester plan · Spring 2027",
          "分享学期规划 · 2027 春季",
        ),
        exact: true,
      })
      .click();
    const sharing = dialog(t("Share semester plan", "分享学期规划"));
    assert.equal(await sharing.getByRole("checkbox").count(), 1);
    assert.equal(await sharing.getByRole("checkbox").isChecked(), true);
    assert.equal(await sharing.getByRole("checkbox").isDisabled(), true);
    assert.equal(
      await sharing
        .getByRole("button", {
          name: t("All semesters", "全部学期"),
          exact: true,
        })
        .count(),
      0,
    );
    await close(sharing);
    await openGlobalShare();
    const allSharing = dialog(t("Share semester plan", "分享学期规划"));
    assert.equal(await allSharing.getByRole("checkbox").count(), 2);
    await allSharing
      .getByRole("button", {
        name: t("All semesters", "全部学期"),
        exact: true,
      })
      .click();
    assert.equal(
      await allSharing
        .getByRole("checkbox")
        .evaluateAll((nodes) => nodes.filter((node) => node.checked).length),
      2,
    );
    await close(allSharing, true);
    await hideTools();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await page.waitForFunction(
      (label) =>
        [...document.querySelectorAll('[role="region"]')]
          .find((node) => node.getAttribute("aria-label") === label)
          ?.getAttribute("data-stuck") === "true",
      t("Planning tools", "规划工具栏"),
    );
    const sticky = await barStats();
    assert.notEqual(
      sticky.shadow,
      "none",
      "stuck planning controls need a shadow",
    );
    assert.equal(sticky.stuck, "true");
    if (width <= 600) {
      assert.ok(
        sticky.height <= 52 && sticky.fontSize <= 13,
        `stuck controls must remain compact: ${JSON.stringify(sticky)}`,
      );
      console.log(
        `workspaces mobile layout ${width}px sticky: ${JSON.stringify(sticky)}`,
      );
    }
    const bounds = await toolbar().boundingBox();
    assert.ok(
      bounds && bounds.y >= 0 && bounds.y + bounds.height <= height,
      `planning toolbar leaves viewport at ${width}px: ${JSON.stringify(bounds)}`,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(out, `sticky-${width}-${locale}.png`),
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log(
      `workspaces ${width}px: independent plan, scoped import/export/share and sticky controls passed`,
    );

    const signed = await createContext(width, height, locale, true);
    await signed.page.goto(new URL("/planning", base).href, {
      waitUntil: "domcontentloaded",
      timeout: 90_000,
    });
    await signed.page
      .locator('[data-analytics-area="planning_board"]')
      .getByRole("button", { name: "MATH 1151", exact: true })
      .waitFor();
    const signedSpring = signed.page.getByRole("region", {
      name: t("Spring 2027", "2027 春季"),
      exact: true,
    });
    await signedSpring
      .getByRole("button", {
        name: t(
          "Share semester plan · Spring 2027",
          "分享学期规划 · 2027 春季",
        ),
        exact: true,
      })
      .click();
    const scopedShare = signed.dialog(t("Share semester plan", "分享学期规划"));
    await scopedShare
      .getByRole("button", {
        name: t("Create share link", "生成分享链接"),
        exact: true,
      })
      .click();
    await scopedShare
      .getByRole("link", {
        name: t("Open shared plan", "打开分享页"),
        exact: true,
      })
      .waitFor();
    assert.deepEqual(
      signed.publications[0].snapshot.semesters.map((s) => s.term),
      ["Spring2027"],
    );
    assert.deepEqual(
      signed.publications[0].snapshot.semesters[0].courses.map(
        (c) => c.subject,
      ),
      ["MATH"],
    );
    await signed.close(scopedShare);
    await signed.openGlobalShare();
    const globalShare = signed.dialog(t("Share semester plan", "分享学期规划"));
    await globalShare
      .getByRole("button", {
        name: t("All semesters", "全部学期"),
        exact: true,
      })
      .click();
    await globalShare
      .getByRole("button", {
        name: t("Create share link", "生成分享链接"),
        exact: true,
      })
      .click();
    await globalShare
      .getByRole("link", {
        name: t("Open shared plan", "打开分享页"),
        exact: true,
      })
      .waitFor();
    assert.deepEqual(
      signed.publications[1].snapshot.semesters.map((s) => s.term),
      ["Autumn2026", "Spring2027"],
    );
    await signed.close(globalShare);
    await signed.page.goto(
      new URL(`/planning/share/${shareId}#k=${capability}`, base).href,
      { waitUntil: "domcontentloaded", timeout: 90_000 },
    );
    await signed.page
      .getByRole("heading", { name: publicSnapshot.title, exact: true })
      .waitFor();
    await signed.page
      .getByRole("button", {
        name: t("Save to my account", "一键转存至我的账号"),
        exact: true,
      })
      .click();
    await signed.page
      .getByRole("link", {
        name: t("Open my plan", "打开我的方案"),
        exact: true,
      })
      .waitFor();
    const copiedState = await signed.page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)),
      accountKey,
    );
    assert.deepEqual(readRows(copiedState.plan), personalRows);
    assert.equal(copiedState.plan.scenarios.length, 1);
    assert.equal(copiedState.plan.scenarios[0].title, publicSnapshot.title);
    assert.deepEqual(readRows(copiedState.plan.scenarios[0].plan), [
      ["CSE", "2221", "Spring2027"],
    ]);
    assert.equal(new URL(signed.page.url()).hash, "");
    assert.ok(
      signed.reads.length > 0 &&
        signed.reads.every(
          (read) => read.id === shareId && read.capability === capability,
        ),
    );
    assert.equal(
      await signed.page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await signed.page.screenshot({
      path: resolve(out, `shared-plan-${width}-${locale}.png`),
    });
    assert.deepEqual(signed.errors, []);
    await signed.context.close();
    console.log(
      `workspaces ${width}px: publication scope, capability cleanup and account copy passed`,
    );
  }
} finally {
  await browser.close();
}
