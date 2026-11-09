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
  fail = false,
  touch = false,
  reduced = false,
  loading = false,
  support = "unsupported",
  selectedModel = "ollama",
  automatic = false,
  bytes = false,
} = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    locale: locale === "zh" ? "zh-CN" : "en-US",
    hasTouch: touch,
    isMobile: touch,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  await context.addInitScript(
    ({ locale, KEY, support, selectedModel, automatic, bytes }) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-model:v1", selectedModel);
      localStorage.setItem(KEY, "done");
      localStorage.setItem(
        "course-atlas:translation-auto:v1",
        String(automatic),
      );
      window.modelTest = {
        state: support,
        creates: 0,
        downloads: 0,
        active: [],
        fail: false,
        delay: 700,
        destroyed: 0,
      };
      Object.defineProperty(window, "Translator", {
        configurable: true,
        value:
          support === "unsupported"
            ? undefined
            : {
                availability: async () => window.modelTest.state,
                create(options) {
                  const state = window.modelTest;
                  state.creates++;
                  const instance = {
                    translate: async () => "这是一段在设备上完成的中文译文。",
                    destroy: () => state.destroyed++,
                  };
                  if (state.state === "available")
                    return Promise.resolve(instance);
                  state.downloads++;
                  state.active.push(navigator.userActivation.isActive);
                  if (state.fail)
                    return Promise.reject(new Error("download failed"));
                  const monitor = new EventTarget();
                  options.monitor?.(monitor);
                  return new Promise((resolve, reject) => {
                    const progress = setTimeout(
                      () =>
                        monitor.dispatchEvent(
                          Object.assign(new Event("downloadprogress"), {
                            loaded: bytes ? 14 * 1024 * 1024 : 0.35,
                            total: bytes ? 40 * 1024 * 1024 : 1,
                          }),
                        ),
                      100,
                    );
                    const finished = setTimeout(() => {
                      state.state = "available";
                      resolve(instance);
                    }, state.delay);
                    options.signal?.addEventListener(
                      "abort",
                      () => {
                        clearTimeout(progress);
                        clearTimeout(finished);
                        reject(new DOMException("cancelled", "AbortError"));
                      },
                      { once: true },
                    );
                  });
                },
              },
      });
    },
    { locale, KEY, support, selectedModel, automatic, bytes },
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

async function openModels(page) {
  await page.locator("[data-translation-settings]").first().click();
  await page.getByRole("menuitem", { name: /^翻译模型/ }).click();
  await page.locator('[data-translation-model="chrome"]').waitFor();
}

async function chooseLocal(page) {
  await openModels(page);
  await page.locator('[data-translation-model="chrome"]').click();
}

async function confirm(page) {
  await page.getByRole("heading", { name: "下载本机翻译模型？" }).waitFor();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "下载并启用", exact: true }).click();
}

try {
  for (const options of [
    { support: "unsupported" },
    { support: "unavailable" },
    { support: "unsupported", touch: true, width: 390, height: 844 },
  ]) {
    const { context, page, errors } = await setup(options);
    await openModels(page);
    assert.equal(
      await page
        .locator('[data-translation-model="chrome"]')
        .getAttribute("aria-disabled"),
      "true",
    );
    assert(
      await page.getByText("需电脑端 Chrome 138+；当前环境不支持").isVisible(),
    );
    await page
      .locator('[data-translation-model="chrome"]')
      .evaluate((item) => item.click());
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-model:v1"),
      ),
      "ollama",
    );
    assert.equal(await page.evaluate(() => window.modelTest.creates), 0);
    assert.deepEqual(errors, []);
    console.log(
      `PASS disabled local model: ${options.touch ? "mobile" : options.support}`,
    );
    await context.close();
  }
  {
    const { context, page, errors } = await setup({ support: "downloadable" });
    await chooseLocal(page);
    await page.getByRole("heading", { name: "下载本机翻译模型？" }).waitFor();
    assert.equal(await page.evaluate(() => window.modelTest.creates), 0);
    assert(
      await page.getByText("大小由 Chrome 决定，暂无法提前获取。").isVisible(),
    );
    await page.getByRole("button", { name: "暂不下载" }).click();
    assert.equal(await page.evaluate(() => window.modelTest.creates), 0);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-model:v1"),
      ),
      "ollama",
    );
    await chooseLocal(page);
    await confirm(page);
    await page.getByRole("progressbar").waitFor();
    assert.equal(await page.evaluate(() => window.modelTest.downloads), 1);
    assert.deepEqual(await page.evaluate(() => window.modelTest.active), [
      true,
    ]);
    await page.locator('[role="progressbar"][aria-valuenow="35"]').waitFor();
    await page
      .locator('[data-translation-provider="chrome"]')
      .first()
      .waitFor();
    assert.equal(await page.locator("[data-translation-download]").count(), 0);
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-model:v1"),
      ),
      "chrome",
    );
    await page.locator("[data-translation-action]").nth(1).click();
    await page.locator('[data-translation-provider="chrome"]').nth(1).waitFor();
    assert.equal(await page.evaluate(() => window.modelTest.downloads), 1);
    assert.deepEqual(errors, []);
    console.log(
      "PASS consent before create, cancellation preserves model, active confirmation, local translation, no repeat download",
    );
    await context.close();
  }
  {
    const { context, page, errors } = await setup({
      support: "downloadable",
      bytes: true,
    });
    await page.evaluate(() => {
      window.modelTest.delay = 1400;
    });
    await chooseLocal(page);
    await confirm(page);
    await page.getByText("下载大小：40 MB").waitFor();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    assert.equal(
      await page.evaluate(() =>
        localStorage.getItem("course-atlas:translation-model:v1"),
      ),
      "ollama",
    );
    await page.waitForTimeout(1500);
    assert.equal(
      await page.evaluate(() => window.modelTest.state),
      "downloadable",
    );
    await page.evaluate(() => {
      window.modelTest.fail = true;
    });
    await chooseLocal(page);
    await confirm(page);
    await page.getByRole("alert").waitFor();
    await page.evaluate(() => {
      window.modelTest.fail = false;
      window.modelTest.delay = 200;
    });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "重试下载" }).click();
    await page
      .locator('[data-translation-provider="chrome"]')
      .first()
      .waitFor();
    assert.deepEqual(errors, []);
    console.log(
      "PASS real byte size, cancellation aborts pending model, download failure and explicit retry",
    );
    await context.close();
  }
  {
    const { context, page, errors } = await setup({ support: "available" });
    await chooseLocal(page);
    await page
      .locator('[data-translation-provider="chrome"]')
      .first()
      .waitFor();
    assert.equal(await page.locator("[data-translation-download]").count(), 0);
    assert.equal(await page.evaluate(() => window.modelTest.downloads), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS ready model uses local translation without a download prompt",
    );
    await page.evaluate(() => {
      window.modelTest.state = "downloadable";
    });
    await page.locator("[data-translation-action]").nth(1).click();
    await page.getByRole("heading", { name: "下载本机翻译模型？" }).waitFor();
    assert.equal(await page.evaluate(() => window.modelTest.downloads), 0);
    await page.getByRole("button", { name: "暂不下载" }).click();
    console.log(
      "PASS a removed model requires fresh confirmation before downloading again",
    );
    await context.close();
  }
  for (const options of [
    { support: "downloadable", selectedModel: "auto" },
    { support: "downloadable", selectedModel: "auto", automatic: true },
    { support: "unsupported", selectedModel: "chrome" },
  ]) {
    const { context, page, requests, errors } = await setup(options);
    if (!options.automatic)
      await page.locator("[data-translation-action]").first().click();
    await page
      .locator('[data-translation-provider="ollama"]')
      .first()
      .waitFor();
    assert(requests.length > 0);
    assert.equal(await page.evaluate(() => window.modelTest.creates), 0);
    assert.equal(await page.locator("[data-translation-download]").count(), 0);
    assert.deepEqual(errors, []);
    console.log(`PASS no implicit download: ${JSON.stringify(options)}`);
    await context.close();
  }
  {
    const { context, page, errors } = await setup({ support: "downloadable" });
    await page.getByRole("button", { name: course.title, exact: true }).click();
    const courseDialog = page.getByRole("dialog").first();
    await courseDialog.waitFor();
    await courseDialog.locator("[data-translation-settings]").click();
    await page.getByRole("menuitem", { name: /^翻译模型/ }).click();
    await page.locator('[data-translation-model="chrome"]').click();
    await page.locator("[data-translation-download]").waitFor();
    assert.equal(await page.getByRole("dialog").count(), 2);
    await page.waitForTimeout(200);
    const rect = await page
      .locator("[data-translation-download]")
      .boundingBox();
    assert(rect.x >= 0 && rect.x + rect.width <= page.viewportSize().width);
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 1);
    assert(await courseDialog.isVisible());
    assert.equal(await page.evaluate(() => window.modelTest.creates), 0);
    assert.deepEqual(errors, []);
    console.log(
      "PASS nested confirmation stays inside course dialog and Escape cancels only confirmation",
    );
    await context.close();
  }
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    console.error(
      await activePage.evaluate(() => ({
        state: window.modelTest,
        text: document.body.innerText.slice(-1100),
      })),
    );
    await activePage.screenshot({
      path: "/tmp/local-model-regression-failure.png",
    });
  }
  throw error;
} finally {
  await browser.close();
}
