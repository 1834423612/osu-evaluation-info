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
const base = process.env.RMP_TEST_BASE_URL ?? "http://localhost:3103",
  output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-batch-qa";
await mkdir(output, { recursive: true });
const first = {
  professorId: "123",
  name: "Sam Field",
  department: "Mathematics",
  campus: "COL",
  token: "1131",
  courseKey: null,
  state: "ambiguous",
  reason: "ambiguous_subject",
  candidates: ["MATH1131", "STAT1131"],
  evidence: {},
  version: 0,
  manualReason: null,
  evidenceUrls: [],
  updatedAt: "2026-11-26",
  username: "field.1",
  identityState: "accepted",
  reviewCount: 4,
  recordFingerprint: "a".repeat(64),
};
const second = {
  ...first,
  professorId: "124",
  name: "Nia Tide",
  department: "Biology",
  token: "1100",
  courseKey: "BIOLOGY1100",
  state: "accepted",
  candidates: ["BIOLOGY1100"],
  reviewCount: 7,
  username: null,
};
let active;
async function setup(locale, width, conflict = false) {
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
    writes = [];
  active = page;
  let rows = [{ ...first }, { ...second }];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/admin/rmp**", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    let body;
    if (url.pathname.endsWith("/batch") && request.method() === "POST") {
      const input = request.postDataJSON();
      writes.push(input);
      assert.equal(input.confirmed, true);
      assert.equal(input.items.length, 2);
      assert(
        input.items.every((item) =>
          /^[a-f0-9]{64}$/.test(item.recordFingerprint),
        ),
      );
      if (conflict) {
        await route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            error: "batch_conflict",
            issues: [
              {
                professorId: "123",
                campus: "COL",
                token: "1131",
                code: "version_conflict",
                actualVersion: 1,
              },
            ],
          }),
        });
        return;
      }
      rows = rows.map((row) => {
        const item = input.items.find(
          (item) => item.professorId === row.professorId,
        );
        return {
          ...row,
          state: "bound",
          courseKey: item.courseKey,
          version: row.version + 1,
        };
      });
      body = {
        items: rows.map((row) => ({
          professorId: row.professorId,
          campus: row.campus,
          token: row.token,
          version: row.version,
        })),
      };
    } else if (url.pathname.endsWith("/assistance"))
      body = { jobs: [], development: true };
    else if (url.searchParams.get("access") === "1")
      body = {
        authorized: true,
        development: true,
        developmentCourseView: true,
      };
    else
      body = {
        items: rows,
        total: 2,
        page: 1,
        pageSize: 30,
        development: true,
      };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
  await page.goto(base + "/admin/rmp", { waitUntil: "domcontentloaded" });
  await page
    .getByRole("button", {
      name: locale === "zh" ? "批量处理 (0)" : "Batch decisions (0)",
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("checkbox", {
      name: locale === "zh" ? "选择当前页" : "Select current page",
      exact: true,
    })
    .check();
  await page
    .getByRole("button", {
      name: locale === "zh" ? "批量处理 (2)" : "Batch decisions (2)",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const target = dialog.getByLabel(
    locale === "zh" ? "Sam Field 的目标课程" : "Target for Sam Field",
    { exact: true },
  );
  assert.equal(await target.inputValue(), "");
  assert.equal(
    await dialog
      .getByLabel(
        locale === "zh" ? "Nia Tide 的目标课程" : "Target for Nia Tide",
        { exact: true },
      )
      .inputValue(),
    "BIOLOGY1100",
  );
  const review = dialog.getByRole("button", {
    name: locale === "zh" ? "核对整批" : "Review batch",
    exact: true,
  });
  assert(await review.isDisabled());
  await dialog
    .getByRole("button", {
      name: locale === "zh" ? "标签修正" : "Label correction",
      exact: true,
    })
    .click();
  assert(
    await review.isDisabled(),
    "ambiguous target must stay empty until human selects",
  );
  await target.fill("MATH1131");
  assert(
    (
      await dialog
        .getByRole("textbox", {
          name: locale === "zh" ? "Sam Field 的理由" : "Reason for Sam Field",
          exact: true,
        })
        .inputValue()
    ).length > 3,
  );
  await review.click();
  const apply = dialog.getByRole("button", {
    name: locale === "zh" ? "确认并应用整批" : "Confirm and apply batch",
    exact: true,
  });
  assert(await apply.isDisabled());
  await dialog
    .getByRole("checkbox", {
      name: locale === "zh" ? /我已核对全部 2 组/ : /I reviewed all 2 groups/,
    })
    .check();
  await page.screenshot({
    path: `${output}/batch-preview-${locale}-${width}${conflict ? "-conflict" : ""}.png`,
    fullPage: true,
  });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  );
  await apply.click();
  if (conflict) {
    await dialog.getByRole("alert").waitFor();
    assert(
      (await dialog.getByRole("alert").innerText()).includes(
        "No batch changes were saved",
      ),
    );
    assert(await apply.isDisabled());
  } else {
    await dialog.waitFor({ state: "hidden" });
    assert.equal(writes[0].items[0].courseKey, "MATH1131");
    assert.equal(writes[0].items[1].courseKey, "BIOLOGY1100");
    await page
      .getByText(
        locale === "zh" ? "0 条当前页记录已选" : "0 selected on this page",
        { exact: true },
      )
      .waitFor();
    await page.screenshot({
      path: `${output}/batch-result-${locale}-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("checkbox", {
        name: locale === "zh" ? "选择当前页" : "Select current page",
        exact: true,
      })
      .check();
    await page.locator("form input[data-search-field]").first().fill("MATH");
    await page
      .getByRole("button", {
        name: locale === "zh" ? "筛选" : "Filter",
        exact: true,
      })
      .click();
    await page
      .getByText(
        locale === "zh" ? "0 条当前页记录已选" : "0 selected on this page",
        { exact: true },
      )
      .waitFor();
  }
  assert.deepEqual(errors, []);
  await context.close();
}
try {
  for (const locale of ["en", "zh"])
    for (const width of [320, 390, 768, 1440]) await setup(locale, width);
  await setup("en", 390, true);
  console.log(
    "RMP batch browser: current-page selection, unique-only prefill, editable templates, per-row targets, second confirmation, scope preview, conflict rollback, filter reset; en/zh × 320/390/768/1440 passed.",
  );
} catch (error) {
  if (active && !active.isClosed()) {
    await active.screenshot({ path: `${output}/failed.png`, fullPage: true });
    console.error((await active.locator("body").innerText()).slice(-5000));
  }
  throw error;
} finally {
  await browser.close();
}
