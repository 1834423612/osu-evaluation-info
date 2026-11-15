import assert from "node:assert/strict";
import { createInterface } from "node:readline";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://localhost:3000",
  ),
  email = process.env.AUTH_TEST_EMAIL;
if (process.env.ALLOW_SMTP_TEST_EMAILS !== "1" || !email)
  throw Error(
    "Set ALLOW_SMTP_TEST_EMAILS=1 and AUTH_TEST_EMAIL to a mailbox you control; this sends two real messages and can create a test account.",
  );
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
  process.env.ALLOW_REMOTE_USER_DATA_TESTS !== "1"
)
  throw Error("Remote account writes require explicit opt-in");
if (!process.stdin.isTTY)
  throw Error(
    "Run this manual email test in an interactive terminal; keep stdin open for both codes.",
  );
process.stdin.setRawMode?.(true);
const input = createInterface({ input: process.stdin, terminal: false }),
  lines = [],
  waiting = [];
input.on("line", (line) =>
  waiting.length ? waiting.shift()(line) : lines.push(line),
);
function code() {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
        () => reject(Error("OTP input timed out")),
        240000,
      ),
      finish = (line) => {
        clearTimeout(timer);
        if (!/^\d{6}$/.test(line.trim()))
          return reject(Error("Expected one six-digit code on stdin"));
        resolve(line.trim());
      };
    if (lines.length) finish(lines.shift());
    else waiting.push(finish);
  });
}
const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  }),
  contexts = [];
try {
  const pages = [];
  let firstCode, accountId;
  for (const [index, width] of [1440, 390].entries()) {
    const context = await browser.newContext({
      viewport: { width, height: 950 },
    });
    contexts.push(context);
    await context.addInitScript(() =>
      localStorage.setItem("course-atlas:locale:v1", "en"),
    );
    await context.route("**/*", (r) => {
      const u = new URL(r.request().url());
      return u.origin !== base.origin || u.pathname.startsWith("/_vercel")
        ? r.abort()
        : r.continue();
    });
    const p = await context.newPage();
    pages.push(p);
    await p.goto(new URL("/account", base).href);
    await p
      .getByRole("heading", { name: "Welcome back", exact: true })
      .waitFor();
    await p
      .getByRole("button", { name: "Use an email code", exact: true })
      .click();
    await p.getByLabel("Email", { exact: true }).fill(email);
    if (index === 1) {
      console.log("Waiting for the resend cooldown before device 2");
      await new Promise((resolve) => setTimeout(resolve, 61000));
    }
    if (index === 1) {
      const replay = await context.request.post(
        new URL("/api/auth/sign-in/email-otp", base).href,
        { headers: { Origin: base.origin }, data: { email, otp: firstCode } },
      );
      assert.ok(
        replay.status() >= 400,
        "Consumed codes must not work on a second device",
      );
    }
    const sent = p.waitForResponse(
      (r) =>
        r.url().endsWith("/email-otp/send-verification-otp") &&
        r.request().method() === "POST",
    );
    await p
      .getByRole("button", { name: "Send verification code", exact: true })
      .click();
    assert.equal((await sent).status(), 200);
    await p.getByLabel("Verification code", { exact: true }).waitFor();
    console.log(
      "OTP_STAGE_" + (index + 1) + ": awaiting the delivered code on stdin",
    );
    const otp = await code();
    if (!index) firstCode = otp;
    await p.getByLabel("Verification code", { exact: true }).fill(otp);
    await p
      .getByRole("button", { name: "Verify and sign in", exact: true })
      .click();
    await p.getByRole("button", { name: "Sign out", exact: true }).waitFor();
    const session = await (
      await context.request.get(new URL("/api/auth/get-session", base).href)
    ).json();
    assert.equal(session.user.email.toLowerCase(), email.toLowerCase());
    assert.equal(session.user.emailVerified, true);
    if (!index) accountId = session.user.id;
    else assert.equal(session.user.id, accountId);
    console.log("DEVICE_" + (index + 1) + ": verified email session created");
  }
  await pages[1].getByRole("button", { name: "Sign out", exact: true }).click();
  await pages[1]
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  const still = await (
    await contexts[0].request.get(new URL("/api/auth/get-session", base).href)
  ).json();
  assert.equal(still.user.id, accountId);
  await pages[0].getByRole("button", { name: "Sign out", exact: true }).click();
  await pages[0]
    .getByRole("heading", { name: "Welcome back", exact: true })
    .waitFor();
  for (const context of contexts)
    assert.equal(
      await (
        await context.request.get(new URL("/api/auth/get-session", base).href)
      ).json(),
      null,
    );
  console.log(
    "Live SMTP delivery, consumed-code rejection, one account across two devices and independent sign-out passed",
  );
} finally {
  input.close();
  process.stdin.setRawMode?.(false);
  process.stdin.pause();
  for (const context of contexts) await context.close();
  await browser.close();
}
