import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const base = process.env.ADMIN_TEST_BASE_URL ?? "http://127.0.0.1:3102";
const output = process.env.ADMIN_TEST_OUTPUT ?? "/tmp/osu-admin-users-qa";
await mkdir(output, { recursive: true });
if (process.env.ADMIN_TEST_EXPECT_PRODUCTION === "1") {
  const denied = await fetch(base + "/api/admin/users");
  assert.equal(
    denied.status,
    403,
    "production account lists require administrator access",
  );
  assert.match(denied.headers.get("cache-control") ?? "", /no-store/);
  const deniedWrite = await fetch(base + "/api/admin/users", {
    method: "POST",
    headers: {
      Origin: new URL(base).origin,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      userId: "unassigned-account",
      action: "grant",
      reason: "Must never bootstrap over HTTP",
    }),
  });
  assert.equal(
    deniedWrite.status,
    403,
    "production HTTP cannot grant the first administrator",
  );
}
let activePage;
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      reducedMotion: "reduce",
      locale: "en-US",
    });
    await context.addInitScript(() => {
      localStorage.setItem("course-atlas:locale:v1", "en");
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
    });
    const page = await context.newPage();
    activePage = page;
    const errors = [];
    page.on("pageerror", (e) => {
      errors.push(e.message);
      console.error(e.message);
    });
    const users = [
      {
        id: "existing-admin",
        name: "Existing Admin",
        email: "admin@example.test",
        verified: true,
        admin: true,
        createdAt: "2026-11-01T12:00:00Z",
      },
      {
        id: "existing-user",
        name: "Existing User",
        email: "user@example.test",
        verified: true,
        admin: false,
        createdAt: "2026-11-02T12:00:00Z",
      },
    ];
    const writes = [],
      audit = [];
    let failRevoke = false,
      reads = 0,
      forbidden = false;
    await page.route("**/api/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/auth/get-session")
        return route.fulfill({ json: null });
      if (url.pathname === "/api/admin/users") {
        if (forbidden)
          return route.fulfill({ status: 403, json: { error: "forbidden" } });
        if (route.request().method() === "POST") {
          const input = route.request().postDataJSON();
          writes.push(input);
          if (failRevoke)
            return route.fulfill({
              status: 409,
              json: { error: "last_admin" },
            });
          users.find((user) => user.id === input.userId).admin =
            input.action === "grant";
          audit.unshift({
            id: String(audit.length + 1),
            userId: input.userId,
            action: input.action,
            actor: "account:existing-admin",
            reason: input.reason,
            createdAt: "2026-11-26T20:00:00Z",
          });
          return route.fulfill({ json: { changed: true } });
        }
        reads++;
        const search = url.searchParams.get("search") ?? "";
        const items = users.filter(
          (user) =>
            user.email.includes(search) ||
            user.name.includes(search) ||
            user.id === search,
        );
        return route.fulfill({
          json: {
            items,
            page: 1,
            total: items.length,
            pageSize: 25,
            audit,
            development: true,
          },
        });
      }
      if (url.pathname === "/api/build-info") return route.continue();
      if (url.pathname.startsWith("/api/debug/"))
        return route.fulfill({
          json: {
            authorized: true,
            configured: true,
            expiresAt: Date.now() + 3600000,
          },
        });
      return route.fulfill({ json: {} });
    });
    await page.goto(base + "/admin/users", { waitUntil: "networkidle" });
    await page.getByText("admin@example.test", { exact: true }).waitFor();
    assert.equal(
      await page
        .getByText(
          "Development mode · changes apply only to development accounts.",
          { exact: true },
        )
        .isVisible(),
      true,
    );
    await page
      .getByRole("button", { name: "Grant admin", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "Grant administrator" });
    assert.equal(
      await dialog.getByRole("button", { name: "Confirm change" }).isDisabled(),
      true,
    );
    await dialog
      .getByRole("textbox", { name: "Reason" })
      .fill("Reviewed and approved account");
    await dialog.getByRole("button", { name: "Confirm change" }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(writes, [
      {
        userId: "existing-user",
        action: "grant",
        reason: "Reviewed and approved account",
      },
    ]);
    await page
      .getByRole("row")
      .filter({ hasText: "user@example.test" })
      .getByRole("button", { name: "Revoke admin" })
      .waitFor();
    await page
      .getByText("Reviewed and approved account", { exact: true })
      .waitFor();
    const before = reads;
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForFunction(
      () => !document.body.textContent.includes("Loading accounts…"),
    );
    assert(
      reads > before,
      "submitting the current search refreshes instead of hanging",
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
      `page fits ${width}px`,
    );
    await page.screenshot({
      path: `${output}/users-${width}.png`,
      fullPage: true,
    });
    failRevoke = true;
    await page
      .getByRole("row")
      .filter({ hasText: "user@example.test" })
      .getByRole("button", { name: "Revoke admin" })
      .click();
    const revoke = page.getByRole("dialog", { name: "Revoke administrator" });
    await revoke
      .getByRole("textbox", { name: "Reason" })
      .fill("Revoke attempted for protection check");
    await revoke.getByRole("button", { name: "Confirm change" }).click();
    await revoke
      .getByText("The final administrator must remain authorized.", {
        exact: true,
      })
      .waitFor();
    assert.equal(errors.length, 0, errors.join("\n"));
    await context.close();
    const denied = await browser.newContext({
      viewport: { width, height: 1000 },
    });
    await denied.addInitScript(() =>
      localStorage.setItem("course-atlas:locale:v1", "en"),
    );
    const deniedPage = await denied.newPage();
    await deniedPage.route("**/api/**", (route) =>
      route.fulfill({
        status:
          new URL(route.request().url()).pathname === "/api/admin/users"
            ? 403
            : 200,
        json:
          new URL(route.request().url()).pathname === "/api/auth/get-session"
            ? null
            : { error: "forbidden" },
      }),
    );
    await deniedPage.goto(base + "/admin/users", { waitUntil: "networkidle" });
    await deniedPage
      .getByText("Administrator access required", { exact: true })
      .waitFor();
    assert.equal(
      await deniedPage.getByText("admin@example.test", { exact: true }).count(),
      0,
    );
    await denied.close();
  }
  console.log(
    "Admin users: explicit grant payload, reason guard, role refresh/audit, last-admin refusal, repeated search, forbidden privacy and responsive widths1440/390/320 passed",
  );
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    await activePage
      .screenshot({ path: `${output}/failure.png`, fullPage: true })
      .catch(() => {});
    console.error((await activePage.locator("body").innerText()).slice(-3000));
  }
  throw error;
} finally {
  await browser.close();
}
