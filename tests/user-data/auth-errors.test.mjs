import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorMessage } from "../../src/lib/auth/errors.ts";
test("login errors distinguish missing credentials, unverified email, rate limits and service failures", () => {
  assert.match(
    authErrorMessage("zh", { code: "INVALID_EMAIL_OR_PASSWORD" }),
    /未设置密码.*验证码或通行密钥/,
  );
  assert.match(
    authErrorMessage("en", { code: "EMAIL_NOT_VERIFIED" }),
    /Verify your email/,
  );
  assert.match(
    authErrorMessage("zh", { error: "origin", status: 403 }),
    /访问地址/,
  );
  assert.match(
    authErrorMessage("en", { status: 503 }),
    /temporarily unavailable/,
  );
  assert.match(
    authErrorMessage("en", { error: "rate_limited", status: 429 }),
    /Wait a minute/,
  );
  assert.match(
    authErrorMessage("zh", { code: "INVALID_OTP" }),
    /验证码错误或已失效/,
  );
});
test("passkey failures offer actionable recovery without displaying server details", () => {
  assert.match(
    authErrorMessage("en", { code: "PASSKEY_EMAIL_MISMATCH" }),
    /email you entered/,
  );
  assert.match(
    authErrorMessage("zh", { code: "PASSKEY_UNAVAILABLE" }),
    /HTTPS 或 localhost/,
  );
  assert.match(
    authErrorMessage("en", { code: "AUTH_CANCELLED" }),
    /not completed/,
  );
  const privateMessage = "database password secret";
  assert.ok(
    !authErrorMessage("en", { message: privateMessage }).includes(
      privateMessage,
    ),
  );
});
