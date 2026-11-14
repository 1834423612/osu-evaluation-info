import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.CHANGES_TEST_BASE_URL ?? "http://localhost:3000",
  output = process.env.CHANGES_TEST_OUTPUT ?? "/tmp/osu-catalog-changes";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let active;
try {
  if (process.env.CATALOG_CHANGES_REAL_TEST === "1") {
    const context = await browser.newContext();
    let path = "/api/catalog/changes?term=1272&days=90",
      expected,
      seen = new Set(),
      pages = 0;
    while (path) {
      const r = await context.request.get(base + path);
      assert.equal(r.status(), 200);
      const data = await r.json();
      if (expected === undefined)
        expected = Object.values(data.counts).reduce((a, b) => a + b, 0);
      for (const item of data.items) {
        assert(!seen.has(item.id), "No duplicate event");
        seen.add(item.id);
        assert(
          /\.\d{6}Z$/.test(item.observedAt),
          "Database microseconds retained for paging",
        );
      }
      path = data.nextCursor
        ? "/api/catalog/changes?term=1272&days=90&cursor=" +
          encodeURIComponent(data.nextCursor)
        : null;
      assert(++pages < 100);
    }
    assert.equal(
      seen.size,
      expected,
      "Every event in the pinned horizon remains reachable",
    );
    assert.equal(
      (
        await context.request.get(base + "/api/catalog/changes?days=invalid")
      ).status(),
      400,
    );
    console.log(JSON.stringify({ realEvents: seen.size, pages }));
    await context.close();
  }
  for (const locale of ["zh", "en"])
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        locale: locale === "zh" ? "zh-CN" : "en-US",
        timezoneId: "Pacific/Honolulu",
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
        return u.origin === new URL(base).origin
          ? route.continue()
          : route.fulfill({ body: "", contentType: "application/javascript" });
      });
      await page.route("**/api/catalog/changes?*", (route) => {
        const p = new URL(route.request().url()).searchParams;
        if (p.get("q") === "ERROR")
          return route.fulfill({ status: 503, json: { error: "Unavailable" } });
        const items = ["added", "changed", "restored", "removed"].map(
          (kind, i) => ({
            id: String(i + 1),
            term: "1272",
            courseId: "001234",
            offering: "1",
            campus: "COL",
            subject: "MATH",
            catalog: String(1151 + i),
            title:
              i === 1
                ? "Calculus: a long course title with several descriptive phrases and additional details"
                : "Calculus " + (i + 1),
            kind,
            current: kind !== "removed" && kind !== "restored",
            fields:
              kind === "changed"
                ? ["title", "credits", "teachers", "schedule", "sections"]
                : ["sections"],
            observedAt: "2026-11-13T12:00:00.123456Z",
            beforeSections: kind === "added" ? 0 : 2,
            afterSections: kind === "removed" ? 0 : 3,
            beforeTitle: "Previous calculus title",
            beforeCredits: ["3", "3"],
            afterCredits: ["4", "4"],
          }),
        );
        const empty = ["EMPTY", "BASELINE", "PENDING"].includes(p.get("q"));
        const chosen = empty
          ? []
          : p.get("kind")
            ? items.filter((x) => x.kind === p.get("kind"))
            : items;
        return route.fulfill({
          json: {
            term: "1272",
            terms: [
              { code: "1272", label: "Spring 2027", sourceStatus: "listed" },
            ],
            counts: { added: 1, changed: 1, restored: 1, removed: 1 },
            items: chosen,
            nextCursor: p.has("cursor") ? null : "fixture-next",
            latestCheck: "2026-11-13T12:00:00Z",
            comparisonSince: ["BASELINE", "PENDING"].includes(p.get("q"))
              ? null
              : "2026-11-11T12:00:00Z",
            baselineSince: "2026-11-10T12:00:00Z",
            archived: false,
            pendingBatches: p.get("q") === "PENDING" ? 1 : 0,
          },
        });
      });
      await page.goto(base + "/updates", { waitUntil: "networkidle" });
      await page.locator('[data-course-update="added"]').waitFor();
      assert.equal(await page.locator("[data-course-update]").count(), 4);
      assert(
        await page
          .locator("time")
          .first()
          .innerText()
          .then((t) => /HST|GMT-10/.test(t)),
      );
      const trigger = page.locator('[data-nav-group="explore"]');
      assert.equal(await trigger.getAttribute("data-active"), "true");
      await trigger.click();
      assert.equal(
        await page
          .locator('[data-nav-page="updates"]')
          .getAttribute("aria-current"),
        "page",
      );
      await page.keyboard.press("Escape");
      const changed = page.locator('[data-course-update="changed"]');
      await changed.locator("summary").click();
      assert((await changed.innerText()).includes("Previous calculus title"));
      const link = await page
        .locator('[data-course-update="added"] a')
        .getAttribute("href");
      const destination = new URL(link, base);
      assert.equal(destination.searchParams.get("term"), "1272");
      assert.equal(destination.searchParams.get("campus"), "COL");
      assert.equal(
        destination.searchParams.get("course"),
        "1272-MATH-1151-COL",
      );
      assert.equal(
        await page.locator('[data-course-update="removed"] a').count(),
        0,
      );
      assert.equal(
        await page.locator('[data-course-update="restored"] a').count(),
        0,
        "Historical events do not link an offering that has since disappeared",
      );
      await page.evaluate(() =>
        window.scrollTo({ top: 0, behavior: "instant" }),
      );
      await page.screenshot({
        path: `${output}/${locale}-${width}.png`,
        fullPage: width >= 768,
      });
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page
        .getByRole("link", {
          name: locale === "zh" ? "较早更新 →" : "Earlier updates →",
          exact: true,
        })
        .click();
      await page.waitForURL((u) => u.searchParams.has("cursor"));
      await page
        .getByRole("link", {
          name: locale === "zh" ? "返回最新" : "Back to latest",
          exact: true,
        })
        .click();
      await page.waitForURL((u) => !u.searchParams.has("cursor"));
      await page.locator('[data-course-update="added"]').waitFor();
      await page
        .getByRole("button", {
          name: locale === "zh" ? "内容调整 1" : "Changed 1",
          exact: true,
        })
        .click();
      await page.waitForURL((u) => u.searchParams.get("kind") === "changed");
      await page.locator('[data-course-update="changed"]').waitFor();
      assert.equal(await page.locator("[data-course-update]").count(), 1);
      await page
        .getByRole("combobox", {
          name: locale === "zh" ? "校区" : "Campus",
          exact: true,
        })
        .click();
      await page.locator('[role="option"][data-choice-value="MNS"]').click();
      await page
        .getByRole("combobox", {
          name: locale === "zh" ? "范围" : "Period",
          exact: true,
        })
        .click();
      await page.locator('[role="option"][data-choice-value="7"]').click();
      await page
        .getByRole("textbox", {
          name: locale === "zh" ? "课程" : "Course",
          exact: true,
        })
        .fill("EMPTY");
      await page
        .getByRole("button", {
          name: locale === "zh" ? "筛选" : "Apply",
          exact: true,
        })
        .click();
      await page.waitForURL((u) => u.searchParams.get("q") === "EMPTY");
      assert.equal(new URL(page.url()).searchParams.get("campus"), "MNS");
      assert.equal(new URL(page.url()).searchParams.get("days"), "7");
      assert.equal(new URL(page.url()).searchParams.get("term"), "1272");
      await page
        .locator("[data-empty-result] [data-mascot-expression]")
        .waitFor();
      await page.goto(base + "/updates?q=BASELINE");
      await page
        .getByText(
          locale === "zh"
            ? "已建立基线，等待下一次完整同步。"
            : "Baseline recorded; waiting for the next complete check.",
          { exact: true },
        )
        .waitFor();
      await page.goto(base + "/updates?q=PENDING");
      await page
        .getByText(
          locale === "zh"
            ? "正在整理变化记录。"
            : "Change history is being indexed.",
          { exact: true },
        )
        .waitFor();
      await page.goto(base + "/updates?q=ERROR");
      await page.locator("main").getByRole("alert").waitFor();
      assert.deepEqual(errors, []);
      await context.close();
    }
  console.log(
    "Catalog updates: bilingual 320/390/768/1440px, source labels, term/campus destinations, changes, timezone, empty/baseline/error and selected navigation passed",
  );
} catch (e) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
