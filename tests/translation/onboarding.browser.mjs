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

async function setup({
  width = 1440,
  height = 1000,
  locale = "zh",
  stored = null,
  fail = false,
  touch = false,
  reduced = false,
  loading = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: locale === "zh" ? "zh-CN" : "en-US",
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ({ locale, stored, KEY }) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-model:v1", "ollama");
      if (stored) localStorage.setItem(KEY, stored);
    },
    { locale, stored, KEY },
  );
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let shouldFail = fail;
  const requests = [];
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/catalog") {
      if (loading) await new Promise((resolve) => setTimeout(resolve, 900));
      return route.fulfill({ json: catalog });
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
              "软件工程的基础：设计、实现与测试可复用的软件组件。通过实践项目学习现代软件开发的原则。",
          })),
        },
      });
    }
    if (url.pathname.includes("/sections"))
      return route.fulfill({ json: { course, sections: [], totalItems: 0 } });
    return route.fulfill({ json: {} });
  });
  await page.goto(process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000", {
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
    succeed: () => {
      shouldFail = false;
    },
  };
}

catalog.courses = Array.from({ length: 12 }, (_, index) => ({
  ...course,
  id: `guide-${index}`,
  title: `${course.title} ${index}`,
  description: `${course.description} Project ${index}.`,
}));
catalog.totalItems = catalog.totalCourses = catalog.matchedSections = 12;

async function storage(page) {
  return page.evaluate((KEY) => localStorage.getItem(KEY), KEY);
}

async function bounds(page) {
  const rect = await page
    .locator('[data-translation-guide] [role="region"]')
    .boundingBox();
  const viewport = page.viewportSize();
  assert(
    rect &&
      rect.x >= -1 &&
      rect.y >= -1 &&
      rect.x + rect.width <= viewport.width + 1 &&
      rect.y + rect.height <= viewport.height + 1,
    JSON.stringify({ rect, viewport }),
  );
}

async function openSettings(page) {
  if (
    await page.getByRole("button", { name: "回到按钮", exact: true }).count()
  ) {
    await page.getByRole("button", { name: "回到按钮", exact: true }).click();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-translation-settings-guide]") ||
        [...document.querySelectorAll("[data-translation-guide] button")].some(
          (button) => button.textContent?.includes("打开设置"),
        ),
    );
    if (await page.locator("[data-translation-settings-guide]").count()) return;
    await page.waitForTimeout(450);
  }
  await page.getByRole("button", { name: "打开设置", exact: true }).click();
  await page.locator("[data-translation-settings-guide]").waitFor();
}

try {
  for (const mobile of [false, true]) {
    const { context, page, requests, errors } = await setup({
      loading: true,
      ...(mobile ? { width: 390, height: 844, touch: true } : {}),
    });
    await page.evaluate(async () => {
      // Scroll while the first catalog response and entrance animation are pending.
      for (let index = 0; index < 35; index++) {
        window.scrollTo(0, index % 2 ? 0 : 500);
        window.dispatchEvent(new Event("scroll"));
        await new Promise((resolve) => setTimeout(resolve, 35));
        if (document.querySelector("[data-translation-guide]"))
          throw new Error("guide appeared before initial scrolling settled");
      }
      window.scrollTo(0, 0);
    });
    await page.getByRole("heading", { name: "试试一键翻译" }).waitFor();
    await page.waitForTimeout(350);
    await page.evaluate(async () => {
      const card = document.querySelector(
        '[data-translation-guide] [role="region"]',
      );
      let frames = 0;
      let observing = true;
      let failure = "";
      function sample() {
        if (
          document.querySelector('[data-translation-guide] [role="region"]') !==
          card
        )
          failure = "guide disappeared or remounted during scrolling";
        const rect = card.getBoundingClientRect();
        if (rect.top < -1 || rect.bottom > innerHeight + 1)
          failure = "guide moved outside the viewport";
        frames++;
        if (observing) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
      for (let index = 0; index < 40; index++) {
        window.scrollTo(
          0,
          index % 2 ? 0 : document.documentElement.scrollHeight,
        );
        await new Promise((resolve) => setTimeout(resolve, 35));
      }
      observing = false;
      if (failure) throw new Error(failure);
      if (frames < 15) throw new Error("insufficient animation-frame samples");
      window.scrollTo(0, document.documentElement.scrollHeight);
    });
    await page.locator("[data-translation-guide][data-detached]").waitFor();
    await bounds(page);
    assert.equal(await storage(page), null);
    await page
      .getByRole("button", { name: "回到按钮", exact: true })
      .dblclick();
    await page.getByRole("button", { name: "试试翻译", exact: true }).waitFor();
    assert.equal(
      requests.length,
      0,
      "locating a hidden button must not start translation",
    );
    await page.waitForTimeout(450);
    await page
      .getByRole("button", { name: "试试翻译", exact: true })
      .dblclick();
    await page.evaluate(async () => {
      const card = document.querySelector(
        '[data-translation-guide] [role="region"]',
      );
      for (let index = 0; index < 16; index++) {
        window.scrollTo(
          0,
          index % 2 ? 0 : document.documentElement.scrollHeight,
        );
        await new Promise((resolve) => setTimeout(resolve, 35));
        if (
          document.querySelector('[data-translation-guide] [role="region"]') !==
          card
        )
          throw new Error("guide disappeared while translation was pending");
      }
    });
    await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
    assert.equal(requests.length, 1, "rapid clicks must share one translation");
    assert.equal(await storage(page), "settings");
    await openSettings(page);
    // The carried second click must not acknowledge the newly opened menu.
    await page
      .getByRole("menuitem", { name: "知道了", exact: true })
      .evaluate((button) => button.click());
    assert.equal(await storage(page), "settings");
    await page.mouse.click(4, 4);
    await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
    assert.equal(
      await storage(page),
      "settings",
      "outside clicks must not complete onboarding",
    );
    for (let index = 0; index < 4; index++) {
      await openSettings(page);
      await page.keyboard.press("Escape");
      await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
      assert.equal(await storage(page), "settings");
    }
    await openSettings(page);
    await page
      .getByRole("menuitemcheckbox", { name: "自动翻译", exact: true })
      .click();
    assert(await page.locator("[data-translation-settings-guide]").isVisible());
    await page.getByRole("menuitemradio", { name: "仅显示译文" }).click();
    assert(await page.locator("[data-translation-settings-guide]").isVisible());
    await page.getByRole("menuitem", { name: /^翻译模型/ }).click();
    await page.locator('[data-translation-model="auto"]').click();
    assert(await page.locator("[data-translation-settings-guide]").isVisible());
    assert.equal(await storage(page), "settings");
    await page.waitForTimeout(400);
    await page
      .getByRole("menuitem", { name: "知道了", exact: true })
      .evaluate((button) =>
        button.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            detail: 1,
            clientX: -1,
            clientY: -1,
          }),
        ),
      );
    assert.equal(
      await storage(page),
      "settings",
      "a release outside the button must not complete onboarding",
    );
    await page.getByRole("menuitem", { name: "知道了", exact: true }).click();
    assert.equal(await storage(page), "done");
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await page.locator("[data-translation-guide]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${mobile ? "mobile" : "desktop"}: loading scroll, 40 scroll reversals, persistent dock, double clicks, outside taps, Escape, all preferences and explicit completion`,
    );
    await context.close();
  }
  for (const mobile of [false, true]) {
    const { context, page, errors } = await setup(
      mobile ? { width: 390, height: 844, touch: true } : {},
    );
    await page
      .getByRole("button", { name: `${course.title} 0`, exact: true })
      .click();
    await page.getByRole("dialog").waitFor();
    await page.getByRole("button", { name: "试试翻译", exact: true }).waitFor();
    await page.waitForTimeout(400);
    await bounds(page);
    await page.getByRole("button", { name: "试试翻译", exact: true }).click();
    await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
    await openSettings(page);
    await page.keyboard.press("Escape");
    assert(await page.getByRole("dialog").isVisible());
    assert.equal(await storage(page), "settings");
    await openSettings(page);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "关闭课程详情", exact: true })
      .click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
    assert.equal(
      await storage(page),
      "settings",
      "unmounting course details preserves progress",
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${mobile ? "drawer" : "sheet"}: scoped controls, outside close, unmount and resumable progress`,
    );
    await context.close();
  }
  {
    const { context, page, errors, succeed } = await setup({
      fail: true,
      width: 320,
      height: 640,
      touch: true,
      reduced: true,
    });
    await page.getByRole("button", { name: "试试翻译", exact: true }).waitFor();
    await page.getByRole("button", { name: "试试翻译", exact: true }).click();
    await page
      .getByText("所选模型暂不可用，可切换为“自动”。")
      .first()
      .waitFor();
    assert.equal(await storage(page), null);
    succeed();
    await page.getByRole("button", { name: "试试翻译", exact: true }).click();
    await page.getByRole("heading", { name: "按你的习惯阅读" }).waitFor();
    await bounds(page);
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "跳过翻译引导" }).click();
    assert.equal(await storage(page), "done");
    assert.deepEqual(errors, []);
    console.log(
      "PASS 320px, reduced motion, failed translation, retry and deliberate skip",
    );
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(
      await activePage.evaluate(
        (KEY) => ({
          lang: document.documentElement.lang,
          stored: localStorage.getItem(KEY),
          controls: document.querySelectorAll("[data-translation-action]")
            .length,
          guide: document
            .querySelector("[data-translation-guide]")
            ?.outerHTML.slice(0, 500),
          text: document.body.innerText.slice(-900),
        }),
        KEY,
      ),
    );
    await activePage.screenshot({
      path: "/tmp/translation-guide-regression-failure.png",
    });
  }
  throw error;
} finally {
  await browser.close();
}
