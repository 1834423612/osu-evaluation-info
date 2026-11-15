import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/rmp-favorites");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const profiles = ["12345", "98765"].map((id, i) => ({
  id,
  name: "Same Name",
  department: "Mathematics",
  campuses: ["MNS"],
  username: i ? "name.1" : null,
  officialName: null,
  active: true,
  quality: 4.3,
  difficulty: 2.7,
  wouldTakeAgain: 90,
  sourceReviewCount: 19,
  storedReviewCount: 19,
  archivedReviewCount: 0,
  updatedAt: "2026-11-14T12:00:00.000Z",
  tags: [],
  distribution: {},
}));
try {
  for (const [width, locale] of [
    [1440, "en"],
    [390, "en"],
    [320, "zh"],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height: 1000 },
      }),
      errors = [];
    const t = (en, zh) => (locale === "zh" ? zh : en);
    await context.addInitScript(
      (locale) => localStorage.setItem("course-atlas:locale:v1", locale),
      locale,
    );
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname === "/api/rmp/professors")
        return r.fulfill({ json: { profiles, total: 2, nextOffset: null } });
      if (u.pathname.startsWith("/api/rmp/professors/"))
        return r.fulfill({
          json: {
            profile: profiles.find((x) => u.pathname.endsWith(x.id)),
            courses: [],
            reviews: [],
            supplements: [],
            total: 0,
            nextOffset: null,
          },
        });
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await context.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    await p.goto(new URL("/rmp", base).href);
    const card = p.locator('[data-rmp-profile="12345"]');
    await card
      .getByRole("button", {
        name: t("Save Same Name", "收藏 Same Name"),
        exact: true,
      })
      .click();
    await card
      .getByRole("button", {
        name: t("Unsave Same Name", "取消收藏 Same Name"),
        exact: true,
      })
      .waitFor();
    assert.equal(new URL(p.url()).pathname, "/rmp");
    await p
      .locator('[data-rmp-profile="98765"]')
      .getByRole("button", {
        name: t("Save Same Name", "收藏 Same Name"),
        exact: true,
      })
      .click();
    await p
      .locator('[data-rmp-profile="98765"]')
      .getByRole("button", {
        name: t("Unsave Same Name", "取消收藏 Same Name"),
        exact: true,
      })
      .waitFor();
    const ids = await p.evaluate(() =>
      JSON.parse(
        JSON.parse(localStorage.getItem("course-atlas:saved-workspace:v1"))
          .records["course-atlas:saved-instructors:v1"],
      ).map((x) => x.id),
    );
    assert.deepEqual(ids, ["rmp:12345", "rmp:98765"]);
    await p.screenshot({
      path: out + "/library-" + width + "-" + locale + ".png",
      fullPage: true,
    });
    await card.getByRole("link", { name: "Same Name", exact: true }).click();
    await p.waitForURL("**/rmp/12345");
    await p
      .getByRole("button", {
        name: t("Unsave Same Name", "取消收藏 Same Name"),
        exact: true,
      })
      .waitFor();
    assert.equal(new URL(p.url()).pathname, "/rmp/12345");
    await p.goto(new URL("/saved", base).href);
    await p
      .getByRole("tab", { name: new RegExp(t("Instructors", "教师")) })
      .click();
    await p
      .getByText(t("Identity unconfirmed", "身份待确认"), { exact: false })
      .waitFor();
    const links = p.getByRole("link", { name: "Same Name", exact: true });
    assert.equal(await links.count(), 2);
    assert.equal(await links.first().getAttribute("href"), "/rmp/12345");
    await p
      .getByRole("button", {
        name: t("Unsave Same Name", "取消收藏 Same Name"),
        exact: true,
      })
      .first()
      .click();
    await p
      .getByRole("button", { name: t("Undo", "撤回"), exact: true })
      .click();
    await links.nth(1).waitFor();
    assert.equal(await links.count(), 2);
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: out + "/saved-" + width + "-" + locale + ".png",
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    await context.close();
    console.log("RMP favorites passed " + width + " " + locale);
  }
} finally {
  await browser.close();
}
