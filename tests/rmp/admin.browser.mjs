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
const base = process.env.RMP_TEST_BASE_URL ?? "http://localhost:3102",
  output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-admin-qa";
await mkdir(output, { recursive: true });
const original = {
  professorId: "123",
  name: "Sam Field",
  department: "Mathematics",
  campus: "COL",
  token: "1131",
  courseKey: null,
  state: "ambiguous",
  reason: "ambiguous_subject",
  candidates: ["MATH1131", "STAT1131"],
  evidence: {
    raw_values: ["1131"],
    verified_subjects: ["MATH", "STAT"],
    resolution_kind: "inferred_course_label",
  },
  version: 0,
  manualReason: null,
  evidenceUrls: [],
  updatedAt: "2026-11-26",
  username: "field.1",
  identityState: "accepted",
  reviewCount: 4,
};
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
      const page = await context.newPage(),
        errors = [],
        filters = [],
        writes = [];
      active = page;
      let row = { ...original };
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route("**/api/admin/rmp**", async (route) => {
        const req = route.request(),
          url = new URL(req.url());
        let body;
        if (req.method() === "POST") {
          const input = req.postDataJSON();
          writes.push(input);
          row = {
            ...row,
            version: row.version + 1,
            state: "bound",
            courseKey: input.courseKey,
            manualReason: input.reason,
          };
          body = { version: row.version };
        } else if (url.pathname.endsWith("/assistance"))
          body = { jobs: [], development: true };
        else if (url.searchParams.get("access") === "1")
          body = {
            authorized: true,
            development: true,
            developmentCourseView: true,
          };
        else if (url.searchParams.has("catalog"))
          body = {
            items: [{ key: "MATH1131", title: "Calculus" }],
            development: true,
          };
        else if (url.searchParams.has("professorId"))
          body = {
            row,
            teaching: [
              {
                source: "official_catalog",
                source_record_key: "1272:COL:1234",
                course_key: "MATH1151",
                latest_term: "1272",
                campus_code: "COL",
              },
            ],
            reviews: [
              {
                id: "456",
                course: "1131",
                comment: "Clear explanations of proofs.",
                date: "2025-09-14",
              },
            ],
            history: [],
          };
        else {
          filters.push(url.searchParams);
          body = {
            items: [row],
            total: 61,
            page: Number(url.searchParams.get("page") ?? 1),
            pageSize: 30,
            development: true,
          };
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(body),
        });
      });
      await page.goto(base + "/admin/rmp", { waitUntil: "domcontentloaded" });
      await page
        .getByText(
          locale === "zh"
            ? "开发模式 · 管理员认证已放宽"
            : "Development mode · administrator checks relaxed",
        )
        .waitFor();
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `${locale}/${width} page overflow`,
      );
      const fields = page.locator("form input[data-search-field]");
      await fields.nth(0).fill("MATH1131");
      await fields.nth(1).fill("field.1");
      await fields.nth(2).fill("proofs");
      await page
        .getByRole("button", {
          name: locale === "zh" ? "筛选" : "Filter",
          exact: true,
        })
        .click();
      await page.waitForFunction(() => location.search.includes("MATH1131"));
      await page
        .getByRole("button", {
          name: locale === "zh" ? "下一页" : "Next",
          exact: true,
        })
        .click();
      await page.waitForTimeout(100);
      assert(
        filters.some(
          (params) =>
            params.get("course") === "MATH1131" &&
            params.get("professor") === "field.1" &&
            params.get("keyword") === "proofs",
        ),
      );
      assert(filters.some((params) => params.get("page") === "2"));
      await page
        .getByRole("button", {
          name: locale === "zh" ? "预览" : "Preview",
          exact: true,
        })
        .click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.getByText("Clear explanations of proofs.").waitFor();
      assert(
        (await dialog.innerText()).includes(
          locale === "zh" ? "所有 4 条" : "all 4 active reviews",
        ),
      );
      await page.screenshot({
        path: `${output}/admin-detail-${locale}-${width}.png`,
        fullPage: true,
      });
      await dialog
        .getByRole("button", {
          name: locale === "zh" ? "标签修正" : "Label correction",
          exact: true,
        })
        .click();
      assert.equal(
        await dialog
          .getByLabel(locale === "zh" ? "理由（必填）" : "Reason (required)")
          .inputValue(),
        locale === "zh"
          ? "人工修正原始课程标签。"
          : "Manual correction of the source course label.",
      );
      await dialog
        .getByLabel(locale === "zh" ? "官方课程代码" : "Official course code")
        .fill("MATH1131");
      await dialog
        .getByRole("button", {
          name: locale === "zh" ? "绑定课程" : "Bind course",
          exact: true,
        })
        .click();
      await dialog
        .getByText(locale === "zh" ? "人工绑定" : "Manually bound", {
          exact: true,
        })
        .waitFor();
      assert.equal(writes[0].expectedVersion, 0);
      assert.equal(writes[0].courseKey, "MATH1131");
      await dialog
        .getByRole("button", {
          name: locale === "zh" ? "关闭" : "Close",
          exact: true,
        })
        .last()
        .click();
      await dialog.waitFor({ state: "hidden" });
      await page.screenshot({
        path: `${output}/admin-list-${locale}-${width}.png`,
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    }
  const locked = await browser.newContext({
      viewport: { width: 390, height: 900 },
    }),
    lockedPage = await locked.newPage();
  active = lockedPage;
  await locked.addInitScript(() =>
    localStorage.setItem("course-atlas:translation-guide:v1", "done"),
  );
  await lockedPage.route("**/api/admin/rmp**", (route) =>
    route.fulfill({
      status: 403,
      contentType: "application/json",
      body: JSON.stringify({ error: "forbidden" }),
    }),
  );
  await lockedPage.route("**/api/debug/session", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        authorized: false,
        configured: true,
        expiresAt: 0,
      }),
    }),
  );
  await lockedPage.goto(base + "/admin/rmp", { waitUntil: "domcontentloaded" });
  await lockedPage
    .getByRole("button", { name: "Unlock administrator tools", exact: true })
    .click();
  await lockedPage.getByLabel("Maintenance key", { exact: true }).waitFor();
  assert.equal(
    await lockedPage
      .getByLabel("Maintenance key", { exact: true })
      .getAttribute("type"),
    "password",
  );
  await lockedPage.screenshot({
    path: `${output}/admin-access-390.png`,
    fullPage: true,
  });
  await locked.close();
  console.log(
    "RMP admin browser: filters, pagination, grouped evidence, manual save, dev warning, unlock discovery; en/zh at 320/390/768/1440px passed.",
  );
} catch (error) {
  if (active && !active.isClosed()) {
    await active.screenshot({ path: `${output}/failed.png`, fullPage: true });
    console.error((await active.locator("body").innerText()).slice(0, 3000));
  }
  throw error;
} finally {
  await browser.close();
}
