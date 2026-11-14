import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.SYLLABUS_TEST_BASE_URL ?? "http://localhost:3000";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
try {
  const page = await browser.newPage();
  const failed = [],
    fonts = [];
  page.on("console", (msg) => {
    if (/CORS|font-src|Failed to decode.*font/i.test(msg.text()))
      failed.push(msg.text());
  });
  page.on("request", (req) => {
    if (req.url().includes("bux-fonts.s3")) failed.push(req.url());
  });
  page.on("response", (r) => {
    if (r.url().includes("assets.bux.osu.edu") && r.url().endsWith(".woff2"))
      fonts.push(r);
  });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const html = process.env.FONT_TEST_DOCUMENT_FILE
    ? await readFile(process.env.FONT_TEST_DOCUMENT_FILE, "utf8")
    : (
        await import("../../src/lib/syllabus/official-render.ts")
      ).officialSyllabusFrame(
        [
          {
            id: "font-check",
            html: '<p class="component">Buckeye Sans</p><p style="font-family:BuckeyeSans;font-weight:700">Bold</p><p style="font-family:BuckeyeSerif;font-weight:900">Serif</p>',
          },
        ],
        "en",
      );
  await page.evaluate((html) => {
    const frame = document.createElement("iframe");
    frame.id = "font-check";
    frame.srcdoc = html;
    document.body.append(frame);
  }, html);
  const frame = page.frameLocator("#font-check");
  await frame.locator("p").first().waitFor();
  const status = await frame.locator("body").evaluate(async () => {
    await Promise.all([
      document.fonts.load("16px BuckeyeSans"),
      document.fonts.load("italic 16px BuckeyeSans"),
      document.fonts.load("800 16px BuckeyeSans"),
      document.fonts.load("700 16px BuckeyeSans"),
      document.fonts.load("900 16px BuckeyeSerif"),
    ]);
    return [...document.fonts]
      .filter((f) => f.status === "loaded")
      .map((f) => ({ family: f.family, weight: f.weight, style: f.style }));
  });
  assert(status.some((f) => f.family === "BuckeyeSans" && f.weight === "400"));
  assert(status.some((f) => f.family === "BuckeyeSans" && f.weight === "700"));
  assert(status.some((f) => f.family === "BuckeyeSerif" && f.weight === "900"));
  assert(
    status.some((f) => f.family === "BuckeyeSans" && f.style === "italic"),
  );
  assert(status.some((f) => f.family === "BuckeyeSans" && f.weight === "800"));
  assert(fonts.length >= 5);
  for (const r of fonts) {
    assert.equal(r.status(), 200);
    assert.equal((await r.allHeaders())["access-control-allow-origin"], "*");
  }
  assert.deepEqual(failed, []);
  console.log(
    "BUX fonts: official CDN regular, italic, bold, extra-bold and serif loaded in a localhost syllabus iframe without CORS/CSP errors",
  );
} finally {
  await browser.close();
}
