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
const base = process.env.RMP_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-library-qa";
await mkdir(output, { recursive: true });
let active;
try {
  for (const locale of ["en", "zh"])
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        isMobile: width < 700,
        hasTouch: width < 700,
        reducedMotion: "reduce",
      });
      await context.addInitScript((locale) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
      }, locale);
      const page = await context.newPage();
      active = page;
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(base + "/rmp?campus=MNS&identity=unverified", {
        waitUntil: "networkidle",
      });
      const cards = page.locator("[data-rmp-profile]");
      await cards.first().waitFor();
      assert((await cards.count()) > 0);
      assert(
        !(await page.locator("[data-rmp-library-view]").innerText()).includes(
          "-1%",
        ),
      );
      assert(
        (await cards.first().innerText()).includes(
          locale === "zh" ? "身份待确认" : "Identity unconfirmed",
        ),
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      const views = page.locator("[data-rmp-library-view]");
      assert.equal(await views.getAttribute("data-rmp-library-view"), "grid");
      await page
        .getByRole("button", {
          name: locale === "zh" ? "列表视图" : "List view",
          exact: true,
        })
        .click();
      assert.equal(await views.getAttribute("data-rmp-library-view"), "list");
      await page.reload({ waitUntil: "networkidle" });
      await cards.first().waitFor();
      assert.equal(await views.getAttribute("data-rmp-library-view"), "list");
      await page.screenshot({
        path: `${output}/library-list-${locale}-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: locale === "zh" ? "网格视图" : "Grid view",
          exact: true,
        })
        .click();
      assert.equal(await views.getAttribute("data-rmp-library-view"), "grid");
      await page.screenshot({
        path: `${output}/library-${locale}-${width}.png`,
        fullPage: true,
      });
      await cards.first().click();
      await page.waitForURL("**/rmp/*");
      const reviews = page.locator("[data-library-review]");
      await reviews.first().waitFor();
      const heading = await page.locator("h1").innerText();
      assert(heading.length > 0);
      if (width < 650) {
        const select = page.locator("aside select");
        await select.selectOption({ index: 1 });
      } else {
        await page.locator("aside a").nth(1).click();
      }
      await page.waitForFunction(() =>
        new URL(location.href).searchParams.has("course"),
      );
      const selected = new URL(page.url()).searchParams.get("course");
      await reviews.first().waitFor();
      await page.waitForFunction(
        (code) =>
          Array.from(document.querySelectorAll("[data-library-review]")).every(
            (el) => el.querySelector("strong")?.textContent?.trim() === code,
          ),
        selected,
      );
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({
        path: `${output}/profile-${locale}-${width}.png`,
        fullPage: true,
      });
      const next = page.getByRole("link", {
        name: locale === "zh" ? "下一页" : "Next",
        exact: true,
      });
      if (await next.count()) {
        const first = await reviews.first().getAttribute("data-library-review");
        await next.click();
        await reviews.first().waitFor();
        await page.waitForFunction(
          (first) =>
            document
              .querySelector("[data-library-review]")
              ?.getAttribute("data-library-review") !== first,
          first,
        );
      }
      await page.goBack();
      assert.equal(await page.locator("h1").innerText(), heading);
      assert.deepEqual(errors, []);
      await context.close();
    }
  const extraContext = await browser.newContext({
    viewport: { width: 390, height: 900 },
  });
  await extraContext.addInitScript(() => {
    localStorage.setItem("course-atlas:locale:v1", "zh");
    localStorage.setItem("course-atlas:translation-guide:v1", "done");
  });
  const extra = await extraContext.newPage();
  active = extra;
  await extra.goto(base + "/rmp/582282", { waitUntil: "networkidle" });
  const supplements = extra
    .locator("details")
    .filter({ has: extra.locator("summary", { hasText: "未核验的历史补充" }) });
  await supplements.locator("summary").click();
  assert.equal(await supplements.locator("article").count(), 2);
  await supplements.scrollIntoViewIfNeeded();
  await extra.screenshot({ path: output + "/historical-supplements-390.png" });
  await extraContext.close();
  console.log(
    "RMP library: real unconfirmed profiles, original course filters, review pagination, browser back and bilingual 320/390/768/1440px layouts passed",
  );
} catch (error) {
  await active
    ?.screenshot({ path: `${output}/failure.png`, fullPage: true })
    .catch(() => {});
  throw error;
} finally {
  await browser.close();
}
