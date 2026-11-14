import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.NAV_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.NAV_TEST_OUTPUT ?? "/tmp/osu-navigation";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let active;
try {
  for (const locale of ["en", "zh"])
    for (const width of [320, 360, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 950 },
        locale: locale === "zh" ? "zh-CN" : "en-US",
        reducedMotion: "reduce",
      });
      await context.addInitScript((locale) => {
        localStorage.setItem("course-atlas:locale:v1", locale);
        localStorage.setItem("course-atlas:translation-guide:v1", "done");
      }, locale);
      const page = await context.newPage();
      active = page;
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.origin !== new URL(base).origin)
          return route.fulfill({
            body: "",
            contentType: "application/javascript",
          });
        if (u.pathname === "/api/debug/session")
          return route.fulfill({ json: { authorized: false } });
        if (u.pathname.startsWith("/api/"))
          return route.fulfill({
            status: 503,
            json: { error: "Test: data unavailable" },
          });
        return route.continue();
      });
      for (const [path, group, selected] of [
        ["/", "explore", "explore"],
        ["/rmp", "explore", "rmp"],
        ["/updates", "explore", "updates"],
        ["/rmp/1117448", "explore", "rmp"],
        ["/saved", null, "saved"],
        ["/methodology", "guides", "methodology"],
        ["/reference", "guides", "reference"],
      ]) {
        await page.goto(base + path, { waitUntil: "networkidle" });
        await page.waitForFunction(
          (locale) =>
            document.documentElement.lang ===
            (locale === "zh" ? "zh-CN" : "en"),
          locale,
        );
        const header = page.locator("header.app-header");
        assert(
          await header.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1,
          ),
          `${locale}/${width}/${path}: header overflow`,
        );
        for (const node of await header
          .locator("a:visible, button:visible")
          .all()) {
          const b = await node.boundingBox();
          assert(
            b.x >= -1 && b.x + b.width <= width + 1,
            `${locale}/${width}/${path}: clipped navigation`,
          );
        }
        assert.equal(
          await header.locator('[data-nav-group][data-active="true"]').count(),
          group ? 1 : 0,
        );
        if (group) {
          const trigger = header.locator(`[data-nav-group="${group}"]`);
          assert.equal(await trigger.getAttribute("aria-current"), "true");
          await trigger.click();
          const menu = page.getByRole("menu");
          await menu.waitFor();
          assert.equal(
            await menu
              .locator('[aria-current="page"]')
              .getAttribute("data-nav-page"),
            selected,
          );
          const b = await menu.boundingBox();
          assert(b.x >= 0 && b.x + b.width <= width + 1);
          if (path === "/rmp" || path === "/methodology")
            await page.screenshot({
              path: `${output}/${selected}-${locale}-${width}.png`,
            });
          await page.keyboard.press("Escape");
          await trigger.focus();
          await page.waitForFunction(
            (group) =>
              getComputedStyle(
                document.querySelector(`[data-nav-group="${group}"]`),
              ).outlineWidth === "2px",
            group,
          );
          const focus = await trigger.evaluate((node) => {
            const s = getComputedStyle(node);
            return {
              outline: s.outlineWidth,
              shadow: s.boxShadow,
              color: s.outlineColor,
            };
          });
          assert.equal(focus.outline, "2px");
          assert.equal(focus.shadow, "none");
          assert.notEqual(focus.color, "rgb(186, 12, 47)");
          await page.keyboard.press("ArrowDown");
          await menu.waitFor();
          await page.keyboard.press("Escape");
        } else
          assert.equal(
            await header
              .locator('a[href="/saved"]')
              .getAttribute("aria-current"),
            "page",
          );
        if (path === "/rmp") {
          const campus = page.getByRole("combobox", {
            name: locale === "zh" ? "校区" : "Campus",
            exact: true,
          });
          await campus.click();
          if (width === 390)
            await page.screenshot({
              path: `${output}/select-${locale}-${width}.png`,
            });
          await page
            .locator('[role="option"][data-choice-value="MNS"]')
            .click();
          await page
            .getByRole("button", {
              name: locale === "zh" ? "搜索" : "Search",
              exact: true,
            })
            .click();
          await page.waitForURL(
            (url) => url.searchParams.get("campus") === "MNS",
            { waitUntil: "domcontentloaded" },
          );
          assert.equal(new URL(page.url()).searchParams.get("campus"), "MNS");
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log(
    "Navigation: 7 routes, bilingual 320/360/390/768/1440px, selected groups and leaves, keyboard menus, bounded popovers and custom-select form submission passed",
  );
} catch (error) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
