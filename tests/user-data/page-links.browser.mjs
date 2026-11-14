import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { snapshot } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
);
if (process.env.ALLOW_SERVER_WRITES !== "1")
  throw Error(
    "ALLOW_SERVER_WRITES=1 required; synthetic public links are created and removed",
  );
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.ALLOW_REMOTE_USER_DATA_TESTS !== "1"
)
  throw Error("Remote testing requires explicit opt-in");
const output = resolve(
  process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/page-links-browser",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  ids = new Set();
let owner;
async function context(width, seed = false) {
  const c = await browser.newContext({ viewport: { width, height: 950 } });
  await c.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base.origin || url.pathname.startsWith("/_vercel"))
      return route.abort();
    if (/^\/api\/(catalog|rmp|evaluations|syllabus)/.test(url.pathname))
      return route.fulfill({
        status: 503,
        json: { error: "QA source unavailable" },
      });
    return route.continue();
  });
  await c.addInitScript(
    ({ course, seed }) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      if (seed)
        localStorage.setItem("course-atlas:saved:v1", JSON.stringify([course]));
      Object.defineProperty(navigator, "share", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text) => {
            window.__copied = text;
          },
        },
      });
    },
    { course: snapshot.items[0].payload, seed },
  );
  return c;
}
try {
  owner = await context(1440, true);
  const source = await owner.newPage();
  await source.goto(new URL("/saved", base).href);
  async function share(name) {
    await source.evaluate(() => (window.__copied = ""));
    const ready = source.waitForResponse(
      (r) =>
        r.url().endsWith("/api/page-links") && r.request().method() === "POST",
    );
    await source.getByRole("button", { name, exact: true }).first().click();
    const r = await ready;
    if (!r.ok()) throw Error("Link creation failed: " + r.status());
    const id = (await r.json()).id;
    ids.add(id);
    await source.waitForFunction(() => !!window.__copied);
    return { id, url: await source.evaluate(() => window.__copied) };
  }
  const course = await share("Share course");
  assert.equal((await share("Share course")).id, course.id);
  const bot = await owner.request.get(course.url, {
    headers: { "User-Agent": "ExampleBot" },
    maxRedirects: 0,
  });
  assert.equal(bot.status(), 200);
  assert.ok((await bot.text()).includes("og:title"));
  for (const width of [1440, 390]) {
    const receiver = await context(width),
      page = await receiver.newPage();
    await page.goto(course.url);
    await page
      .locator(".course-detail-panel, .course-detail-drawer")
      .waitFor({ state: "visible", timeout: 20000 });
    assert.equal(
      new URL(page.url()).searchParams.get("course"),
      snapshot.items[0].payload.id,
    );
    assert.equal(
      await page.locator("[data-shared-course-fallback]").count(),
      1,
    );
    assert.equal(await page.locator(".search-bar").count(), 1);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({ path: output + "/course-" + width + ".png" });
  }
  await source.goto(new URL("/reference#instruction-modes", base).href);
  const general = await share("Share this page"),
    redirect = await owner.request.get(general.url, { maxRedirects: 0 });
  assert.equal(redirect.status(), 307);
  assert.equal(redirect.headers().location, "/reference#instruction-modes");
  await source.evaluate(() => {
    window.__copied = "";
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => {
        throw new DOMException("Cancelled", "AbortError");
      },
    });
  });
  await source
    .getByRole("button", { name: "Share this page", exact: true })
    .click();
  await source.waitForTimeout(700);
  assert.equal(await source.evaluate(() => window.__copied), "");
  assert.equal(
    await source.getByRole("dialog").count(),
    0,
    "cancel must not open a fallback dialog or copy",
  );
  console.log(
    "Real attributed links, idempotent creation, bot previews, missing-result course fallback, reference anchors and native-share cancellation passed",
  );
} finally {
  if (owner)
    for (const id of ids)
      await owner.request
        .delete(new URL("/api/page-links/" + id, base).href, {
          headers: { Origin: base.origin, "Content-Type": "application/json" },
          data: {},
        })
        .catch(() => {});
  await writeFile(
    output + "/manifest.json",
    JSON.stringify({ ids: [...ids], origin: base.origin }, null, 2),
  );
  await browser.close();
}
