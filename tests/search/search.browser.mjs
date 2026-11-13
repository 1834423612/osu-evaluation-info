import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000",
  output = process.env.SEARCH_QA_DIR ?? "/tmp/osu-index-search-qa";
await mkdir(output, { recursive: true });
let active;
try {
  for (const [width, locale] of [
    [1440, "zh"],
    [768, "en"],
    [390, "zh"],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await context.addInitScript((locale) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      window.searchEvents = [];
      window.umami = {
        track: (name, properties) =>
          window.searchEvents.push({ name, properties }),
      };
    }, locale);
    const page = await context.newPage();
    active = page;
    page.setDefaultTimeout(60000);
    const errors = [],
      searches = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", async (response) => {
      if (
        new URL(response.url()).pathname === "/api/catalog/search" &&
        response.ok()
      )
        searches.push(await response.json());
    });
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === new URL(base).origin) {
        if (
          !url.pathname.startsWith("/api/") ||
          url.pathname.startsWith("/api/catalog") ||
          url.pathname === "/api/build-info"
        )
          return route.continue();
        return route.fulfill({ json: { summaries: {} } });
      }
      if (url.origin === "https://content.osu.edu") return route.continue();
      return route.fulfill({ body: "", contentType: "text/plain" });
    });
    for (const query of [
      "chemsitry",
      "cse2212",
      "protien structuer",
      "datastructures",
    ]) {
      await page.goto(
        `${base}/?${new URLSearchParams({ q: query, term: "1272", campus: "all" })}`,
        { waitUntil: "domcontentloaded" },
      );
      await page.locator("[data-search-context]").waitFor();
      await page.locator(".course-card").first().waitFor();
      assert.equal(
        searches.at(-1).sourceMode,
        "index",
        "use the real published catalog index",
      );
      assert.equal(new URL(page.url()).searchParams.get("q"), query);
      assert((await page.locator(".course-card").count()) <= 12);
      assert(
        !(await page.locator("[data-search-context]").innerText()).includes(
          "undefined",
        ),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      if (query === "cse2212")
        assert(
          (
            await page.locator("[data-search-match]").first().innerText()
          ).includes("2212 →"),
        );
      if (["cse2212", "protien structuer"].includes(query)) {
        await page.locator(".results-area").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${output}/${query === "cse2212" ? "number" : "words"}-${width}-${locale}.png`,
        });
      }
    }
    const first = await page.locator(".course-code").allTextContents();
    const next = page.getByRole("button", {
      name: locale === "zh" ? "下一页" : "Next",
      exact: true,
    });
    if (await next.isEnabled()) {
      await next.click();
      await page.waitForFunction(() =>
        new URL(location.href).searchParams.get("cursor")?.startsWith("s:"),
      );
      await page.goBack();
      await page.waitForFunction(
        (code) => document.querySelector(".course-code")?.textContent === code,
        first[0],
      );
    }
    await page.goto(`${base}/?q=zxqvjkplmnodzz&term=1272`, {
      waitUntil: "domcontentloaded",
    });
    await page.locator(".empty-results").waitFor();
    assert.equal(await page.locator(".course-card").count(), 0);
    await page.goto(
      `${base}/?q=STAT1450&term=1272&component=lec&academic-program=asc&academic-career=ugrd`,
      {
        waitUntil: "domcontentloaded",
      },
    );
    await page.locator("[data-search-context]").waitFor();
    await page.locator(".course-card").first().waitFor();
    await page
      .getByRole("button", {
        name:
          locale === "zh"
            ? "改用官方实时查询"
            : "Check with live official search",
      })
      .click();
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get("searchMode") === "live",
    );
    await page
      .getByRole("button", {
        name:
          locale === "zh" ? "使用容错目录搜索" : "Use tolerant catalog search",
      })
      .waitFor();
    assert.equal(new URL(page.url()).searchParams.get("component"), "lec");
    assert.deepEqual(errors, []);
    console.log(
      `PASS real index ${width}px ${locale}: typos, numbers, joined words, evidence, pagination, no-result and live switch`,
    );
    await context.close();
  }
} catch (error) {
  if (active && !active.isClosed())
    await active.screenshot({ path: `${output}/failure.png` });
  throw error;
} finally {
  await browser.close();
}
