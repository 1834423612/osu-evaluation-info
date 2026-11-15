import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  output = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/diagnostics-browser",
  );
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  errors = [];
try {
  for (const [width, locale] of [
    [1440, "en"],
    [390, "zh"],
    [320, "en"],
  ]) {
    const c = await browser.newContext({ viewport: { width, height: 950 } }),
      reports = [];
    await c.addInitScript((locale) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      window.__qaLocationCalls = 0;
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", {
        value() {
          window.__qaLocationCalls++;
          throw Error("unexpected permission probe");
        },
      });
    }, locale);
    await c.route("**/*", (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
        return r.abort();
      if (u.pathname === "/api/diagnostics/report") {
        reports.push(r.request().postDataJSON());
        return r.fulfill({
          status: reports.length === 1 ? 503 : 200,
          json:
            reports.length === 1 ? { error: "QA retry" } : { received: true },
        });
      }
      if (
        u.pathname.startsWith("/api/") &&
        !u.pathname.startsWith("/api/diagnostics/")
      )
        return r.fulfill({ status: 503, json: { error: "QA isolated" } });
      return r.continue();
    });
    const p = await c.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("console", (m) => {
      if (
        m.type() === "error" &&
        !m.text().startsWith("Failed to load resource")
      )
        errors.push(m.text());
    });
    await p.goto(new URL("/diagnostics", base).href);
    await p
      .getByRole("heading", {
        name: locale === "zh" ? "浏览器诊断" : "Browser diagnostics",
        exact: true,
      })
      .waitFor();
    assert.equal(await p.locator("main").count(), 1);
    assert.equal(await p.locator(".app-header").count(), 1);
    const run = p.getByRole("button", {
      name: locale === "zh" ? "开始检测" : "Run diagnostics",
      exact: true,
    });
    assert.equal(reports.length, 0);
    await run.click();
    await run.waitFor();
    await p.waitForFunction(() =>
      document.querySelector('[data-probe="fonts"] [data-status="not_run"]'),
    );
    assert.equal(
      await p
        .locator('[data-probe="canvas"] [data-status]')
        .getAttribute("data-status"),
      "not_run",
    );
    assert.equal(
      await p
        .locator('[data-probe="geoloc"] [data-status]')
        .getAttribute("data-status"),
      "not_run",
    );
    assert.equal(await p.evaluate(() => window.__qaLocationCalls), 0);
    await p
      .getByLabel(
        locale === "zh" ? "设备与指纹检测" : "Device & fingerprint probes",
        { exact: true },
      )
      .check();
    await run.click();
    await p.waitForFunction(
      () =>
        document.querySelector(
          '[data-probe="shield"] [data-status="available"]',
        ),
      null,
      { timeout: 30000 },
    );
    assert.equal(
      await p
        .locator('[data-probe="canvas"] [data-status]')
        .getAttribute("data-status"),
      "available",
    );
    assert.equal(
      await p
        .locator('[data-probe="worker"] [data-status]')
        .getAttribute("data-status"),
      "available",
    );
    assert.equal(await p.evaluate(() => window.__qaLocationCalls), 0);
    assert.equal(reports.length, 0);
    await p.locator('[data-probe="tz"] input[type="checkbox"]').check();
    await p
      .getByRole("button", {
        name: locale === "zh" ? "预览（1）" : "Review (1)",
        exact: true,
      })
      .click();
    const dialog = p.getByRole("dialog");
    await dialog.waitFor();
    assert.ok((await dialog.locator("pre").textContent()).includes('"tz"'));
    const submit = dialog.getByRole("button", {
      name: locale === "zh" ? "提交报告" : "Submit report",
      exact: true,
    });
    await p.screenshot({ path: output + "/before-submit-" + width + ".png" });
    await submit.click();
    await dialog.getByRole("status").waitFor();
    await submit.click();
    await dialog
      .getByRole("button", {
        name: locale === "zh" ? "已接收" : "Received",
        exact: true,
      })
      .waitFor();
    assert.equal(reports.length, 2);
    assert.equal(reports[0].id, reports[1].id);
    assert.deepEqual(
      reports[1].results.map((r) => r.id),
      ["tz"],
    );
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: output + "/report-" + width + ".png",
      fullPage: false,
    });
    await dialog
      .getByRole("button", {
        name: locale === "zh" ? "关闭" : "Close",
        exact: true,
      })
      .click();
    await p.screenshot({
      path: output + "/results-" + width + ".png",
      fullPage: true,
    });
    await c.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Diagnostics: local-only run, opt-in fingerprints, permission isolation, report retry, 1440/390/320 layouts passed",
  );
} finally {
  await browser.close();
}
