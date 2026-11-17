import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { syntheticPdf } from "./synthetic-pdf.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  await context.addInitScript(() => {
    localStorage.setItem("course-atlas:locale:v1", "en");
    localStorage.setItem("course-atlas:translation-guide:v1", "done");
  });
  const page = await context.newPage(),
    requests = [],
    errors = [];
  page.on("request", (r) => {
    if (r.method() === "POST")
      requests.push({ url: r.url(), body: r.postData() });
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/catalog/**", (route) =>
    route.fulfill({ status: 503, body: "Offline browser regression" }),
  );
  await page.goto(
    (process.env.BASE_URL ?? "http://127.0.0.1:3000") + "/planning",
  );
  await page
    .getByRole("heading", { name: "Plan your path", exact: true })
    .waitFor();
  await page.locator("input[type=file]").setInputFiles({
    name: "private-student.pdf",
    mimeType: "application/pdf",
    buffer: syntheticPdf(),
  });
  await page
    .getByText("1 reports imported. Your plan is ready.", { exact: true })
    .waitFor({ timeout: 90000 });
  await page.getByRole("button", { name: "CSE 2111", exact: true }).waitFor();
  await page
    .getByRole("combobox", { name: "Move CSE 2111", exact: true })
    .selectOption({ label: "Autumn 2027" });
  await page.getByText("Saved on this device", { exact: true }).waitFor();
  await page.reload();
  await page
    .getByRole("combobox", { name: "Move CSE 2111", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("combobox", { name: "Move CSE 2111", exact: true })
      .inputValue(),
    "Autumn2027",
  );
  const saved = await page.evaluate(() =>
    localStorage.getItem("course-atlas:private-planning:v1"),
  );
  assert.doesNotMatch(
    saved,
    /Synthetic Private|private-student|rawText|filename/,
  );
  assert.equal(
    await page
      .getByRole("checkbox", { name: /I checked these fields/ })
      .count(),
    0,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Backup", exact: true }).click();
  assert.equal((await download).suggestedFilename(), "course-atlas-plan.json");
  await mkdir("/tmp/planning-evidence", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ["Plans", "Progress", "Four-year examples", "Reports"]) {
      await page.getByRole("button", { name, exact: true }).click();
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
    .getByRole("button", { name: "Four-year examples", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Four-year sample schedules", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: /Computer and Information Science.*BA/ })
    .waitFor();
  await page
    .getByRole("button", { name: "Switch to Chinese", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "规划你的学业路径", exact: true })
    .waitFor();
  assert.equal(
    requests.some((r) => /telemetry|diagnostics/.test(r.url)),
    false,
  );
  assert.equal(
    requests.some((r) =>
      /Synthetic Private|private-student|AU2017|documentId|programId/.test(
        r.body ?? "",
      ),
    ),
    false,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: automatic PDF import/save, movement persistence, private backup, responsive views and no private POST payloads",
  );
  await context.close();
} finally {
  await browser.close();
}
