import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { snapshot } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
  process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
);
if (process.env.ALLOW_SERVER_WRITES !== "1")
  throw new Error(
    "Set ALLOW_SERVER_WRITES=1; this test creates and revokes synthetic guest shares",
  );
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.ALLOW_REMOTE_USER_DATA_TESTS !== "1"
)
  throw new Error("Remote user-data tests require explicit opt-in");
const output = resolve(
  process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/sharing-browser",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const contexts = [],
  created = [],
  tag = "UI QA " + randomBytes(5).toString("hex"),
  errors = [];
let owner;
async function context(width, local = false) {
  const c = await browser.newContext({ viewport: { width, height: 1000 } });
  contexts.push(c);
  await c.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return url.origin !== base.origin ||
      url.pathname.startsWith("/_vercel/insights")
      ? route.abort()
      : route.continue();
  });
  await c.addInitScript(
    ({ snapshot, local }) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      if (local)
        for (const [i, key] of [
          "saved",
          "saved-sections",
          "saved-instructors",
          "saved-syllabi",
        ].entries())
          localStorage.setItem(
            "course-atlas:" + key + ":v1",
            JSON.stringify([snapshot.items[i].payload]),
          );
    },
    { snapshot, local },
  );
  return c;
}
function eventWait(page, action) {
  return page.waitForResponse(
    (response) =>
      response.url().endsWith("/events") &&
      response.request().method() === "POST" &&
      response.request().postDataJSON()?.action === action &&
      response.ok(),
  );
}
try {
  owner = await context(390, true);
  const page = await owner.newPage();
  page.on("pageerror", (e) => errors.push(e.name));
  await page.goto(new URL("/saved", base).href, {
    waitUntil: "domcontentloaded",
  });
  async function create(publicCode, interrupt = false) {
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Collection name", { exact: true })
      .fill(tag + (publicCode ? " public" : " private"));
    if (publicCode)
      await dialog
        .getByRole("button", { name: "Public 6-digit code", exact: true })
        .click();
    await dialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "1 hour", exact: true }).click();
    let failedId = null;
    if (interrupt)
      await page.route("**/api/shares", async (route) => {
        if (route.request().method() === "POST" && !failedId) {
          const response = await route.fetch();
          assert.equal(response.status(), 201);
          const data = await response.json();
          failedId = data.id;
          created.push(data.id);
          await route.abort("connectionfailed");
        } else await route.continue();
      });
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/shares") &&
        r.request().method() === "POST" &&
        r.status() === 201,
    );
    await dialog
      .getByRole("button", { name: "Create share", exact: true })
      .click();
    if (interrupt) {
      await dialog.getByRole("status").waitFor();
      await dialog
        .getByRole("button", { name: "Create share", exact: true })
        .click();
    }
    const data = await (await response).json();
    if (!created.includes(data.id)) created.push(data.id);
    if (failedId) assert.equal(data.id, failedId);
    const url = await dialog
      .getByLabel("Share link", { exact: true })
      .inputValue();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({
      path: resolve(
        output,
        publicCode ? "create-public-phone.png" : "create-private-phone.png",
      ),
    });
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    return { id: data.id, url, code: data.code };
  }
  const published = await create(true),
    privateShare = await create(false, true);
  for (const width of [1440, 390]) {
    const recipient = await context(width),
      p = await recipient.newPage();
    p.on("pageerror", (e) => errors.push(e.name));
    const opened = eventWait(p, "open");
    await p.goto(published.url, { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: /Save selected/ }).waitFor();
    await opened;
    await p.locator("main input[type=checkbox]").nth(2).uncheck();
    await p.locator("main input[type=checkbox]").nth(3).uncheck();
    const imported = eventWait(p, "import");
    await p.getByRole("button", { name: /Save selected/ }).click();
    await imported;
    await p.getByText("2 added · 0 already saved", { exact: true }).waitFor();
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await p.screenshot({
      path: resolve(output, "recipient-" + width + ".png"),
    });
    await p
      .locator('main li[data-kind="course"]')
      .first()
      .getByRole("button", { name: /^Preview / })
      .click();
    await p
      .locator(".course-detail-panel, .course-detail-drawer")
      .waitFor({ state: "visible", timeout: 15000 });
    assert.ok(new URL(p.url()).pathname.startsWith("/share/"));
    assert.equal(await p.locator(".search-bar").count(), 0);
    await p.screenshot({ path: resolve(output, "detail-" + width + ".png") });
  }
  const recipient = await context(390),
    p = await recipient.newPage();
  let opened = eventWait(p, "open");
  await p.goto(privateShare.url, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /Save selected/ }).waitFor();
  await opened;
  assert.ok(!p.url().includes("#"));
  opened = eventWait(p, "open");
  await p.reload();
  await p.getByRole("button", { name: /Save selected/ }).waitFor();
  await opened;
  const stats = await owner.request.get(new URL("/api/shares", base).href);
  assert.equal(stats.status(), 200);
  const rows = (await stats.json()).shares;
  assert.equal(rows.find((x) => x.id === published.id).opens, 2);
  assert.equal(rows.find((x) => x.id === published.id).imports, 2);
  assert.equal(rows.find((x) => x.id === privateShare.id).opens, 1);
  await page.getByRole("button", { name: "Shared links", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByText(tag + " private", { exact: true })
    .waitFor();
  await page.screenshot({ path: resolve(output, "management-phone.png") });
  const privateRow = page
    .getByRole("dialog")
    .locator("li")
    .filter({ hasText: tag + " private" });
  await privateRow
    .getByRole("button", { name: "Replace link", exact: true })
    .click();
  const rotated = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/shares/" + privateShare.id) &&
      r.request().postDataJSON()?.action === "rotate",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  assert.equal((await rotated).status(), 200);
  await page
    .getByRole("dialog")
    .getByText(tag + " private", { exact: true })
    .waitFor();
  const stale = await recipient.request.post(
    new URL("/api/shares/read", base).href,
    {
      headers: { Origin: base.origin },
      data: {
        id: privateShare.id,
        capability: new URL(privateShare.url).hash.slice(3),
      },
    },
  );
  assert.equal(stale.status(), 404);
  const publicRow = page
    .getByRole("dialog")
    .locator("li")
    .filter({ hasText: tag + " public" });
  await publicRow.getByRole("button", { name: "Revoke", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByText("Share revoked", { exact: true })
    .waitFor();
  const revoked = await recipient.request.get(
    new URL("/api/shares/" + published.id, base).href,
  );
  assert.equal(revoked.status(), 404);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      passed: true,
      viewports: [1440, 390],
      shares: created.length,
      scenarios: [
        "partial import",
        "in-place details",
        "lost response retry",
        "fragment removal",
        "reload",
        "counts",
        "rotation",
        "revocation",
      ],
    }),
  );
} catch (error) {
  throw new Error(
    String(error.message).replace(/#k=[A-Za-z0-9_-]+/g, "#k=[redacted]"),
  );
} finally {
  await writeFile(
    resolve(output, "manifest.json"),
    JSON.stringify({ ids: created, tag, origin: base.origin }),
  );
  if (owner)
    for (const id of created)
      await owner.request
        .post(new URL("/api/shares/" + id, base).href, {
          headers: { Origin: base.origin },
          data: { action: "revoke" },
        })
        .catch(() => {});
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}
