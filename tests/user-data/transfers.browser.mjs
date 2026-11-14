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
    "ALLOW_SERVER_WRITES=1 is required; synthetic transfers are created and revoked",
  );
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.ALLOW_REMOTE_USER_DATA_TESTS !== "1"
)
  throw Error("Remote test requires explicit opt-in");
const output = resolve(
  process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/transfer-browser",
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const ids = [];
let owner;
async function device(width, seed = false) {
  const c = await browser.newContext({ viewport: { width, height: 950 } });
  await c.route("**/*", (r) =>
    new URL(r.request().url()).origin === base.origin &&
    !new URL(r.request().url()).pathname.startsWith("/_vercel")
      ? r.continue()
      : r.abort(),
  );
  await c.addInitScript(
    ({ snapshot, seed }) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      if (seed && !localStorage.getItem("qa-seeded")) {
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
        localStorage.setItem("qa-seeded", "1");
      }
    },
    { snapshot, seed },
  );
  return c;
}
async function create(page) {
  await page.getByRole("button", { name: "Transfer", exact: true }).click();
  const wait = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === "/api/transfers" &&
      r.request().method() === "POST",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create transfer", exact: true })
    .click();
  const response = await wait;
  if (!response.ok())
    throw Error("Creation failed with status " + response.status());
  const data = await response.json();
  ids.push(data.id);
  return data;
}
try {
  owner = await device(1440, true);
  const sender = await owner.newPage();
  await sender.goto(new URL("/saved", base).href);
  const pair = await create(sender),
    recipient = await device(390),
    page = await recipient.newPage();
  await page.goto(new URL("/transfer", base).href);
  await page
    .getByLabel("6-digit pairing code", { exact: true })
    .fill(pair.code);
  await page
    .getByRole("button", { name: "Request transfer", exact: true })
    .click();
  await page
    .getByText("Confirm this number on the sending device.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Receive favorites", exact: true })
      .isDisabled(),
    true,
  );
  await sender
    .getByRole("button", { name: "Approve this device", exact: true })
    .click();
  await page
    .getByText("Sender approved this device.", { exact: true })
    .waitFor();
  await sender.screenshot({
    path: output + "/desktop-approval.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Receive favorites", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page.getByRole("checkbox").first().check();
  await page.screenshot({
    path: output + "/phone-selection.png",
    fullPage: true,
  });
  const ack = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" &&
      r.request().postDataJSON()?.action === "ack" &&
      r.ok(),
  );
  await page
    .getByRole("button", { name: "Save selected (1)", exact: true })
    .click();
  await ack;
  await page
    .getByText("Saved on this device. Transfer completed.", { exact: true })
    .waitFor();
  const workspace = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("course-atlas:saved-workspace:v1")),
  );
  assert.equal(
    JSON.parse(workspace.records["course-atlas:saved:v1"]).length,
    1,
  );
  assert.equal(
    JSON.parse(workspace.records["course-atlas:saved-sections:v1"]).length,
    0,
  );
  await sender
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  const link = await create(sender),
    second = await device(320),
    p2 = await second.newPage();
  await p2.goto(
    new URL("/transfer/" + link.id + "#k=" + link.capability, base).href,
  );
  await p2
    .getByRole("button", { name: "Receive favorites", exact: true })
    .click();
  assert.equal(new URL(p2.url()).hash, "");
  await p2.reload();
  await p2
    .getByRole("button", { name: "Receive favorites", exact: true })
    .click();
  await p2
    .getByRole("button", { name: "Save selected (4)", exact: true })
    .waitFor();
  let loseAck = true;
  await p2.route("**/api/transfers/" + link.id, async (route) => {
    if (route.request().postDataJSON()?.action === "ack" && loseAck) {
      loseAck = false;
      await route.fetch();
      return route.abort();
    }
    return route.continue();
  });
  await p2
    .getByRole("button", { name: "Save selected (4)", exact: true })
    .click();
  await p2
    .getByText(
      "Saved on this device. Completion could not be confirmed; retry below.",
      { exact: true },
    )
    .waitFor();
  await p2.reload();
  await p2
    .getByRole("button", { name: "Confirm completion again", exact: true })
    .click();
  await p2
    .getByText("Saved on this device. Transfer completed.", { exact: true })
    .waitFor();
  for (const p of [page, p2])
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  console.log(
    "Real private pairing approval, partial import, direct-link resume, lost completion acknowledgement and 320/390px layouts passed",
  );
} finally {
  if (owner)
    for (const id of ids)
      await owner.request
        .post(new URL("/api/transfers/" + id, base).href, {
          headers: { Origin: base.origin },
          data: { action: "revoke" },
        })
        .catch(() => {});
  await writeFile(
    output + "/manifest.json",
    JSON.stringify({ ids, origin: base.origin }, null, 2),
  );
  await browser.close();
}
