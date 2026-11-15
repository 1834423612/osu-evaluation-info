import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { snapshot } from "./fixtures.mjs";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const origin = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  output = process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/sync-browser";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "qa@example.test",
  emailVerified: true,
  name: "Example User",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
let seq = 0,
  calls = 0,
  failNext = false;
const cloud = new Map(),
  receipts = new Map();
async function device(width, seed) {
  const context = await browser.newContext({
    viewport: { width, height: 1000 },
  });
  let signedIn = true;
  await context.addInitScript(
    ({ seed, item }) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      if (seed && !localStorage.getItem("qa-seeded")) {
        localStorage.setItem(
          "course-atlas:saved:v1",
          JSON.stringify([item.payload]),
        );
        localStorage.setItem(
          "course-atlas:saved-workspace:v1",
          JSON.stringify({
            version: 2,
            records: {
              "course-atlas:saved:v1": JSON.stringify([item.payload]),
              "course-atlas:saved-sections:v1": "[]",
              "course-atlas:saved-instructors:v1": "[]",
              "course-atlas:saved-syllabi:v1": "[]",
            },
            collections: [
              {
                id: "a2222222-2222-4222-8222-222222222222",
                name: "Autumn collection",
                tags: ["Degree"],
                members: ["course:" + item.payload.id],
              },
            ],
          }),
        );
        localStorage.setItem("qa-seeded", "true");
      }
    },
    { seed, item: snapshot.items[0] },
  );
  await context.route("**/*", async (route) => {
    const req = route.request(),
      url = new URL(req.url());
    if (url.origin !== origin.origin || url.pathname.startsWith("/_vercel/"))
      return route.abort();
    const json = (x, status = 200) => route.fulfill({ status, json: x });
    if (url.pathname === "/api/account/status")
      return json({ enabled: true, email: true, passkey: true });
    if (url.pathname === "/api/auth/get-session")
      return json(
        signedIn
          ? {
              user,
              session: {
                id: "session-id",
                userId: user.id,
                token: "mock-session",
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }
          : null,
      );
    if (url.pathname === "/api/auth/sign-out") {
      signedIn = false;
      return json({ success: true });
    }
    if (url.pathname.startsWith("/api/auth/")) return json([]);
    if (url.pathname === "/api/sync") {
      calls++;
      const body = req.postDataJSON();
      assert.equal(body.accountId, user.id);
      const results = [];
      for (const op of body.operations) {
        if (receipts.has(op.id)) {
          results.push(receipts.get(op.id));
          continue;
        }
        let record = cloud.get(op.key) ?? {
            key: op.key,
            version: 0,
            item: null,
          },
          status = "applied";
        if (
          op.base !== record.version &&
          JSON.stringify(op.item) !== JSON.stringify(record.item)
        )
          status = "conflict";
        else if (JSON.stringify(op.item) !== JSON.stringify(record.item)) {
          record = { key: op.key, item: op.item, version: ++seq };
          cloud.set(op.key, record);
        }
        const r = { id: op.id, status, record };
        receipts.set(op.id, r);
        results.push(r);
      }
      if (failNext) {
        failNext = false;
        return route.abort();
      }
      return json({
        accountId: user.id,
        cursor: seq,
        floor: 0,
        reset: false,
        records: [...cloud.values()].filter((x) => x.version > body.cursor),
        receipts: results,
      });
    }
    return route.continue();
  });
  const page = await context.newPage();
  return { context, page };
}
async function setup(page) {
  await page.goto(new URL("/account", origin).href);
  await page.getByRole("button", { name: "Set up sync", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Merge & enable sync", exact: true })
    .click();
  await dialog.waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Pause", exact: true }).waitFor();
}
async function count(page) {
  return page.evaluate((id) => {
    const raw = localStorage.getItem(
      "course-atlas:saved-workspace:v1:account:" + id,
    );
    return raw
      ? JSON.parse(JSON.parse(raw).records["course-atlas:saved:v1"] ?? "[]")
          .length
      : 0;
  }, user.id);
}
try {
  const a = await device(1440, true),
    b = await device(390, false);
  await setup(a.page);
  await a.page.waitForFunction(
    (id) =>
      !!localStorage.getItem("course-atlas:saved-workspace:v1:account:" + id),
    user.id,
  );
  assert.equal(
    await a.page.evaluate(
      (id) =>
        JSON.parse(
          JSON.parse(
            localStorage.getItem(
              "course-atlas:saved-workspace:v1:account:" + id,
            ),
          ).records["course-atlas:saved:v1"],
        )[0].description,
      user.id,
    ),
    snapshot.items[0].payload.description,
  );
  await setup(b.page);
  assert.equal(await count(b.page), 1);
  assert.equal(cloud.size, 2);
  const before = calls;
  await b.page.waitForTimeout(2500);
  assert.ok(calls - before < 5, "empty sync must not loop");
  await a.page.screenshot({ path: output + "/desktop.png", fullPage: true });
  await b.page.screenshot({ path: output + "/phone.png", fullPage: true });

  // A lost response leaves a durable operation; reload retries the same operation ID.
  const key = "course:" + snapshot.items[0].payload.id;
  async function changeTitle(page, title) {
    await page.evaluate(
      ({ id, title }) => {
        const k = "course-atlas:saved-workspace:v1:account:" + id,
          w = JSON.parse(localStorage.getItem(k)),
          items = JSON.parse(w.records["course-atlas:saved:v1"]);
        items[0].title = title;
        w.records["course-atlas:saved:v1"] = JSON.stringify(items);
        localStorage.setItem(k, JSON.stringify(w));
        window.dispatchEvent(new Event("course-atlas:preferences"));
      },
      { id: user.id, title },
    );
  }
  failNext = true;
  await changeTitle(b.page, "Saved after lost response");
  await b.page
    .getByText("Waiting to retry · pending changes are kept.", { exact: true })
    .waitFor();
  const failedSeq = seq;
  await b.page.reload();
  await b.page.getByRole("button", { name: "Sync now", exact: true }).waitFor();
  await b.page.waitForFunction(async (id) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("waho-user-data");
      q.onsuccess = () => r(q.result);
    });
    return await new Promise((r) => {
      const q = db.transaction("sync").objectStore("sync").get(id);
      q.onsuccess = () => r(q.result?.outbox.length === 0);
    });
  }, user.id);
  assert.equal(
    seq,
    failedSeq,
    "replay of the lost acknowledgement must not create a second version",
  );
  // An offline edit and a cloud edit based on the same revision require a visible choice.
  await b.page.getByRole("button", { name: "Pause", exact: true }).click();
  const cloudEdit = structuredClone(cloud.get(key).item);
  cloudEdit.payload.title = "Updated on another device";
  cloud.set(key, { key, item: cloudEdit, version: ++seq });
  await changeTitle(b.page, "My offline title");
  await b.page
    .getByRole("button", { name: "Resume sync", exact: true })
    .click();
  await b.page
    .getByRole("heading", { name: "Choose a version", exact: true })
    .waitFor();
  await b.page.getByText("Compare versions", { exact: true }).click();
  await b.page.screenshot({
    path: output + "/phone-conflict.png",
    fullPage: true,
  });
  await b.page.getByRole("button", { name: "Use cloud", exact: true }).click();
  await b.page
    .getByRole("heading", { name: "Choose a version", exact: true })
    .waitFor({ state: "hidden" });

  await b.page.getByRole("button", { name: "Pause", exact: true }).click();
  const collectionKey = "collection:a2222222-2222-4222-8222-222222222222",
    folderEdit = structuredClone(cloud.get(collectionKey).item);
  folderEdit.payload.name = "Cloud collection name";
  cloud.set(collectionKey, {
    key: collectionKey,
    item: folderEdit,
    version: ++seq,
  });
  await b.page.evaluate((id) => {
    const key = "course-atlas:saved-workspace:v1:account:" + id,
      w = JSON.parse(localStorage.getItem(key));
    w.collections[0].name = "Device collection name";
    localStorage.setItem(key, JSON.stringify(w));
    window.dispatchEvent(new Event("course-atlas:preferences"));
  }, user.id);
  await b.page
    .getByRole("button", { name: "Resume sync", exact: true })
    .click();
  await b.page
    .getByRole("button", { name: "Keep both collections", exact: true })
    .waitFor();
  await b.page.getByText("Compare versions", { exact: true }).click();
  await b.page.screenshot({
    path: output + "/phone-collection-conflict.png",
    fullPage: true,
  });
  await b.page
    .getByRole("button", { name: "Keep both collections", exact: true })
    .click();
  await b.page
    .getByRole("heading", { name: "Choose a version", exact: true })
    .waitFor({ state: "hidden" });
  await b.page.getByRole("button", { name: "Sync now", exact: true }).click();
  await b.page.waitForFunction(async (id) => {
    const db = await new Promise((resolve) => {
      const req = indexedDB.open("waho-user-data");
      req.onsuccess = () => resolve(req.result);
    });
    return new Promise((resolve) => {
      const req = db.transaction("sync").objectStore("sync").get(id);
      req.onsuccess = () => {
        resolve(
          req.result?.outbox.length === 0 &&
            Object.values(req.result.baseline).filter(
              (x) => x.item?.kind === "collection",
            ).length === 2,
        );
        db.close();
      };
    });
  }, user.id);
  const folders = [...cloud.values()]
    .filter((x) => x.item?.kind === "collection")
    .map((x) => x.item.payload.name)
    .sort();

  assert.deepEqual(folders, [
    "Cloud collection name",
    "Device collection name (copy)",
  ]);
  await b.page.getByRole("button", { name: "Pause", exact: true }).click();
  await b.page.goto(new URL("/saved", origin).href);
  await b.page.getByRole("button", { name: "Manage", exact: true }).click();
  await b.page.getByRole("button", { name: /Select results/ }).click();
  await b.page.getByRole("button", { name: "Remove (1)", exact: true }).click();
  await b.page.getByText("1 removed", { exact: true }).waitFor();
  assert.equal(await count(b.page), 0);
  // Resume sends the deletion with its base revision rather than re-importing cloud data.
  await b.page.goto(new URL("/account", origin).href);
  await b.page
    .getByRole("button", { name: "Resume sync", exact: true })
    .click();
  await b.page.waitForFunction(async (id) => {
    const db = await new Promise((r) => {
      const q = indexedDB.open("waho-user-data");
      q.onsuccess = () => r(q.result);
    });
    return await new Promise((r) => {
      const q = db.transaction("sync").objectStore("sync").get(id);
      q.onsuccess = () => r(q.result?.outbox.length === 0);
    });
  }, user.id);
  await a.page.getByRole("button", { name: "Sync now", exact: true }).click();
  await a.page.waitForTimeout(300);
  assert.equal(await count(a.page), 0);
  assert.equal([...cloud.values()][0].item, null);
  // Signing out reveals the untouched guest snapshot; the account copy remains isolated.
  await a.page.getByRole("button", { name: "Sign out", exact: true }).click();
  await a.page.getByRole("heading", { name: "Continue by email" }).waitFor();
  await a.page.goto(new URL("/saved", origin).href);
  await a.page
    .getByRole("heading", { name: /Saved|favorites/i })
    .first()
    .waitFor();
  assert.equal(
    await a.page.evaluate(
      () => JSON.parse(localStorage.getItem("course-atlas:saved:v1")).length,
    ),
    1,
  );
  for (const p of [a.page, b.page])
    assert.equal(
      await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
  console.log(
    "Two-device merge, bounded polling, paused deletion, resume, guest isolation and responsive layouts passed (auth and sync mocked)",
  );
} finally {
  await browser.close();
}
