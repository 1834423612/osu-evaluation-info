import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/history-browser",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  for (const [width, locale] of [
    [1440, "en"],
    [320, "zh"],
  ]) {
    const context = await browser.newContext({
        viewport: { width, height: 900 },
      }),
      t = (en, zh) => (locale === "zh" ? zh : en);
    await context.addInitScript((locale) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem(
        "course-atlas:history:v1",
        JSON.stringify([
          {
            id: "search:math",
            kind: "search",
            title: "MATH 1151",
            context: "1268 · COL",
            href: "/?q=MATH+1151&term=1268&token=qa-private#private",
            at: new Date().toISOString(),
          },
          {
            id: "course:one",
            kind: "course",
            title: "Calculus I",
            context: "Autumn 2026",
            href: "/?q=MATH+1151&course=1268-MATH-1151-COL",
            at: new Date().toISOString(),
          },
        ]),
      );
    }, locale);
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname.startsWith("/api/"))
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await context.newPage(),
      errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", () => errors.push("Unexpected native dialog"));
    await p.goto(new URL("/history", base).href);
    await p
      .getByRole("button", {
        name: t("Remove history entry", "删除记录"),
        exact: true,
      })
      .nth(1)
      .waitFor();
    assert.equal(
      await p
        .getByRole("button", {
          name: t("Remove history entry", "删除记录"),
          exact: true,
        })
        .count(),
      2,
    );
    const exported = p.waitForEvent("download");
    await p
      .getByRole("button", {
        name: t("Export history", "导出记录"),
        exact: true,
      })
      .click();
    const stream = await (await exported).createReadStream();
    let raw = "";
    for await (const chunk of stream) raw += chunk;
    const data = JSON.parse(raw);
    assert.equal(data.format, "waho-history");
    assert.equal(data.items.length, 2);
    assert.equal(raw.includes("qa-private"), false);
    assert.equal(data.items[0].href.includes("token="), false);
    await p
      .getByRole("button", { name: t("Clear", "清空"), exact: true })
      .click();
    let dialog = p.getByRole("dialog");
    await dialog
      .getByRole("button", { name: t("Cancel", "取消"), exact: true })
      .click();
    assert.equal(
      await p
        .getByRole("button", {
          name: t("Remove history entry", "删除记录"),
          exact: true,
        })
        .count(),
      2,
    );
    await p
      .getByRole("button", { name: t("Clear", "清空"), exact: true })
      .click();
    await dialog.waitFor();
    await p.screenshot({
      path: out + "/clear-" + width + "-" + locale + ".png",
    });
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await dialog
      .getByRole("button", {
        name: t("Clear history", "清空记录"),
        exact: true,
      })
      .click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(
      await p
        .getByRole("button", {
          name: t("Remove history entry", "删除记录"),
          exact: true,
        })
        .count(),
      0,
    );
    const other = await context.newPage();
    await other.addInitScript(() =>
      window.addEventListener(
        "storage",
        (event) => event.stopImmediatePropagation(),
        true,
      ),
    );
    await other.goto(new URL("/history", base).href);
    const removeOther = other.getByRole("button", {
      name: t("Remove history entry", "删除记录"),
      exact: true,
    });
    await removeOther.nth(1).waitFor();
    const math = p
      .locator("main li")
      .filter({ has: p.getByRole("link", { name: /MATH 1151/ }) });
    await math
      .getByRole("button", {
        name: t("Remove history entry", "删除记录"),
        exact: true,
      })
      .click();
    await math.waitFor({ state: "hidden" });
    assert.equal(
      await removeOther.count(),
      2,
      "The second tab intentionally has a stale rendered list",
    );
    await other
      .locator("main li")
      .filter({ has: other.getByRole("link", { name: /Calculus I/ }) })
      .getByRole("button", {
        name: t("Remove history entry", "删除记录"),
        exact: true,
      })
      .click();
    await other
      .getByRole("button", { name: t("Clear", "清空"), exact: true })
      .waitFor({ state: "visible" });
    await other.waitForFunction(
      () =>
        JSON.parse(localStorage.getItem("course-atlas:history:v1")).length ===
        0,
    );
    assert.deepEqual(errors, []);
    await context.close();
    console.log("History passed " + width + " " + locale);
  }
} finally {
  await browser.close();
}
