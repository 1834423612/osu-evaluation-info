import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
try {
  const context = await browser.newContext();
  // No recording or analytics leaves the browser during this test.
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === base.origin && !url.pathname.startsWith("/_vercel"))
      return route.continue();
    if (route.request().resourceType() === "script")
      return route.fulfill({
        contentType: "application/javascript",
        body: "window.__collectorLoads=(window.__collectorLoads||0)+1;",
      });
    return route.abort();
  });
  const page = await context.newPage();
  for (const path of ["/", "/saved", "/history", "/share", "/account"]) {
    await page.goto(new URL(path, base).href);
    await page.waitForSelector("script#umami-recorder", { state: "attached" });
    const config = await page
      .locator("script#umami-recorder")
      .evaluate((el) => ({
        attributes: Array.from(el.attributes)
          .filter((x) => x.name.startsWith("data-"))
          .map((x) => x.name),
        version: new URL(el.src).searchParams.get("v"),
        blocked: !!document.querySelector("main.rr-block"),
      }));
    assert.equal(config.blocked, false, path);
    assert.equal(config.version, "3.5.0");
    assert.deepEqual(config.attributes, ["data-website-id", "data-nscript"]);
  }
  await page.evaluate(() =>
    localStorage.setItem("course-atlas:analytics:v1", '{"replay":false}'),
  );
  await page.reload();
  await page.waitForSelector("script#umami-tracker", { state: "attached" });
  assert.equal(await page.locator("script#umami-recorder").count(), 0);
  console.log(
    "Replay defaults, all-page coverage, remote-only options and explicit opt-out passed (collectors mocked)",
  );
} finally {
  await browser.close();
}
