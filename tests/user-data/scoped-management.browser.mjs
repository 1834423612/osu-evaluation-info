import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { course } from "./fixtures.mjs";
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  out = resolve(
    process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/scoped-management",
  ),
  id = "abbb12d0-6a77-4cf5-a4af-3c8674f01ef1";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  context = await browser.newContext({ viewport: { width: 390, height: 950 } });
let signedIn = true;
try {
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== base.origin || u.pathname.startsWith("/_vercel"))
      return r.abort();
    if (u.pathname === "/qa-workspace-seed")
      return r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><body></body>",
      });
    if (u.pathname === "/api/auth/get-session")
      return r.fulfill({
        json: signedIn
          ? {
              user: {
                id,
                email: "account-a@example.test",
                emailVerified: true,
                name: "Account A",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              session: {
                id: "qa-session",
                userId: id,
                token: "synthetic",
                expiresAt: new Date(Date.now() + 86400000).toISOString(),
              },
            }
          : null,
      });
    if (u.pathname === "/api/auth/sign-out") {
      signedIn = false;
      return r.fulfill({ json: { success: true } });
    }
    if (u.pathname === "/api/account/status")
      return r.fulfill({ json: { enabled: true, email: true, passkey: true } });
    if (
      u.pathname === "/api/auth/list-sessions" ||
      u.pathname === "/api/auth/passkey/list-user-passkeys"
    )
      return r.fulfill({ json: [] });
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, json: { error: "QA isolated" } });
    return r.continue();
  });
  const p = await context.newPage();
  await p.goto(new URL("/qa-workspace-seed", base).href);
  await p.evaluate(
    async ({ id, course }) => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      const records = (title) => ({
        version: 1,
        records: {
          "course-atlas:saved:v1": JSON.stringify([
            { ...course, title, sections: [] },
          ]),
          "course-atlas:saved-sections:v1": "[]",
          "course-atlas:saved-instructors:v1": "[]",
          "course-atlas:saved-syllabi:v1": "[]",
        },
      });
      localStorage.setItem(
        "course-atlas:saved-workspace:v1",
        JSON.stringify(records("Local course")),
      );
      localStorage.setItem(
        "course-atlas:saved-workspace:v1:account:" + id,
        JSON.stringify(records("Private A cached title")),
      );
      const db = await new Promise((resolve, reject) => {
        const q = indexedDB.open("waho-user-data", 2);
        q.onupgradeneeded = () => {
          q.result.createObjectStore("sync", { keyPath: "accountId" });
          q.result.createObjectStore("telemetry", { keyPath: "id" });
        };
        q.onsuccess = () => resolve(q.result);
        q.onerror = () => reject(q.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction("sync", "readwrite");
        tx.objectStore("sync").put({
          version: 1,
          accountId: id,
          enabled: false,
          initialized: true,
          once: false,
          cursor: 0,
          baseline: {},
          seen: {},
          outbox: [],
          conflicts: [],
          needsReview: false,
          lastSyncAt: null,
        });
        tx.oncomplete = resolve;
        tx.onabort = () => reject(tx.error);
      });
      db.close();
    },
    { id, course },
  );
  await p.goto(new URL("/saved", base).href);
  await p.getByText("Private A cached title", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Manage", exact: true }).click();
  await p
    .getByLabel("Collection name", { exact: true })
    .fill("Private A draft");
  const account = await context.newPage();
  await account.goto(new URL("/account", base).href);
  await account.getByRole("button", { name: "Sign out", exact: true }).click();
  await p.bringToFront();
  await p.evaluate(() => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await p.getByText("Local course", { exact: true }).waitFor();
  assert.equal(
    await p.getByText("Private A cached title", { exact: true }).count(),
    0,
  );
  assert.equal(
    await p.getByLabel("Collection name", { exact: true }).count(),
    0,
  );
  assert.equal(
    await p
      .getByRole("button", { name: "Manage", exact: true })
      .getAttribute("aria-expanded"),
    "false",
  );
  await p.screenshot({ path: out + "/signed-out-390.png" });
  console.log(
    "Workspace changes clear management selection, private cached rows and draft names after cross-tab sign-out",
  );
} finally {
  await context.close();
  await browser.close();
}
