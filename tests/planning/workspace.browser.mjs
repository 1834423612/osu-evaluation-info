import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
import { syntheticPdf } from "./synthetic-pdf.mjs";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("course-atlas:locale:v1", "en");
    localStorage.setItem("course-atlas:translation-guide:v1", "done");
  });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  page.on("request", (r) => {
    if (r.method() === "POST")
      requests.push({ url: r.url(), body: r.postData() });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/catalog/**", (route) =>
    route.fulfill({
      status: 503,
      body: "Local browser regression intentionally offline",
    }),
  );
  await page.goto(
    (process.env.BASE_URL ?? "http://127.0.0.1:3000") + "/planning",
  );
  await page
    .getByRole("heading", { name: "Semester planning", exact: true })
    .waitFor();
  await page
    .getByRole("tab", { name: "Import & sources", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "private-student.pdf",
    mimeType: "application/pdf",
    buffer: syntheticPdf(),
  });
  await page
    .getByText(
      "Candidates extracted. Check every row against your PDF before saving.",
      { exact: true },
    )
    .waitFor({ timeout: 90000 });
  await page
    .locator("summary")
    .filter({ hasText: /Spring2027/ })
    .first()
    .click();
  assert.equal(
    await page.getByLabel("Subject", { exact: true }).first().inputValue(),
    "CSE",
  );
  assert.equal(
    await page.getByLabel("Credits", { exact: true }).nth(1).inputValue(),
    "",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save on this device", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByLabel("Number", { exact: true }).first().fill("2221");
  await page
    .getByRole("checkbox", { name: /I checked these fields/ })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Save on this device", exact: true })
    .click();
  await page.getByText("Saved on this browser.", { exact: true }).waitFor();
  const saved = await page.evaluate(() =>
    localStorage.getItem("course-atlas:private-planning:v1"),
  );
  assert.doesNotMatch(
    saved,
    /Synthetic|Private|private-student|rawText|filename/,
  );
  assert.equal(JSON.parse(saved).semesters[0].courses[0].number, "2221");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON", exact: true }).click();
  assert.equal(
    (await downloadPromise).suggestedFilename(),
    "private-plan.json",
  );
  await mkdir("/tmp/planning-evidence", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of [
      "My plan",
      "Import & sources",
      "Requirement map",
      "Next semester",
      "Four-year examples",
    ]) {
      await page.getByRole("tab", { name, exact: true }).click();
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        true,
        `${width} ${name} overflow`,
      );
    }
    await page.screenshot({
      path: `/tmp/planning-evidence/${width}.png`,
      fullPage: true,
    });
  }
  await page
    .getByRole("tab", { name: "Import & sources", exact: true })
    .click();
  await page.locator("input[type=file]").setInputFiles({
    name: "synthetic-second.pdf",
    mimeType: "application/pdf",
    buffer: syntheticPdf(),
  });
  await page.getByLabel("Show source", { exact: true }).waitFor();
  assert.equal(await page.getByLabel("Subject", { exact: true }).count(), 4);
  assert.equal(
    await page.getByLabel("Number", { exact: true }).first().inputValue(),
    "2221",
  );
  assert.equal(
    await page
      .getByRole("button", { name: "Save on this device", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByLabel("Show source", { exact: true })
    .selectOption({ index: 2 });
  assert.equal(await page.getByLabel("Subject", { exact: true }).count(), 2);
  assert.equal(
    await page.getByLabel("Number", { exact: true }).first().inputValue(),
    "2111",
  );
  await page.getByLabel("Show source", { exact: true }).selectOption("");
  await page
    .getByRole("tab", { name: "Four-year examples", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Four-year sample schedules", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: /Computer and Information Science.*BA/ })
    .waitFor();
  await page.evaluate(() => {
    localStorage.setItem("course-atlas:locale:v1", "zh");
    window.dispatchEvent(new Event("course-atlas:preferences"));
  });
  await page.getByRole("heading", { name: "学期规划", exact: true }).waitFor();
  assert.equal(
    requests.some((r) => /telemetry|diagnostics/.test(r.url)),
    false,
    JSON.stringify(requests),
  );
  assert.equal(
    requests.some((r) =>
      /Synthetic|private-student|AU2017|documentId|programId/.test(
        r.body ?? "",
      ),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: synthetic PDF import, correction, review gate, local save/export, samples, en/zh at 320/390/768/1440, no planning POST payloads, no page errors",
  );
  await context.close();
} finally {
  await browser.close();
}
