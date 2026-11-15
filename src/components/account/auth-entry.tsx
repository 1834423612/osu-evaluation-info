"use client";
import { useEffect, useState } from "react";
import {
  Fingerprint,
  ArrowRight,
  LoaderCircle,
  ShieldCheck,
  BookOpen,
  Bookmark,
  Cloud,
  Eye,
  EyeOff,
  Mail,
  KeyRound,
} from "lucide-react";
import { authErrorMessage } from "@/lib/auth/errors";
import { authClient } from "@/lib/auth/client";
import { Button } from "@/components/ui/button";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { text, type Locale } from "@/lib/i18n";
import { OtpInput } from "./otp-input";
import styles from "./account.module.css";
type Mode = "password" | "passkey" | "register" | "email" | "reset";
export function AuthEntry({
  locale,
  emailEnabled,
  onSignedIn,
}: {
  locale: Locale;
  emailEnabled: boolean;
  onSignedIn: () => Promise<unknown>;
}) {
  const [mode, setMode] = useState<Mode>(emailEnabled ? "email" : "password"),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [visible, setVisible] = useState(false),
    [recovery, setRecovery] = useState("");
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(
      () => setCooldown((x) => Math.max(0, x - 1)),
      1000,
    );
    return () => clearTimeout(timer);
  }, [cooldown]);
  function change(next: Mode) {
    setMode(next);
    setSent(false);
    setOtp("");
    setPassword("");
    setNotice("");
    setVisible(false);
  }
  async function run(action: () => Promise<{ error?: unknown } | void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const result = await action();
      if (result?.error) {
        const error = result.error as { status?: number; code?: string };
        if (error.status === 429 || error.code === "TOO_MANY_REQUESTS")
          setCooldown(60);
        setNotice(authErrorMessage(locale, result.error));
      }
    } catch {
      setNotice(
        text(
          locale,
          "Could not connect. Try again in a moment.",
          "暂时无法连接，请稍后重试。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const headers = { "x-waho-locale": locale };
  async function send() {
    if (cooldown) return;
    const result =
      mode === "register" && !sent
        ? await authClient.signUp.email(
            { email: email.trim(), name: name.trim(), password },
            { headers },
          )
        : mode === "reset"
          ? await authClient.emailOtp.requestPasswordReset(
              { email: email.trim() },
              { headers },
            )
          : await authClient.emailOtp.sendVerificationOtp(
              {
                email: email.trim(),
                type: mode === "register" ? "email-verification" : "sign-in",
              },
              { headers },
            );
    if (!result.error) {
      setSent(true);
      setCooldown(60);
      setNotice(
        text(
          locale,
          "If eligible, a code is on its way. It expires in 5 minutes.",
          "符合条件的邮箱将收到验证码，5 分钟内有效。",
        ),
      );
    }
    return result;
  }
  async function submit() {
    if (mode === "passkey") {
      if (!window.isSecureContext || !window.PublicKeyCredential)
        return { error: { code: "PASSKEY_UNAVAILABLE" } };
      const result = await authClient.signIn.passkey({
        fetchOptions: {
          headers: { "x-waho-passkey-email": email.trim().toLowerCase() },
        },
      });
      if (!result.error) await onSignedIn();
      return result;
    }
    if (mode === "password") {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (!result.error) {
        setPassword("");
        await onSignedIn();
      }
      return result;
    }
    if (!sent) return send();
    if (mode === "register") {
      const verified = await authClient.emailOtp.verifyEmail({
        email: email.trim(),
        otp,
      });
      if (verified.error) return verified;
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
      });
      if (!result.error) {
        setPassword("");
        setOtp("");
        await onSignedIn();
      }
      return result;
    }
    if (mode === "reset") {
      const result = await authClient.emailOtp.resetPassword({
        email: email.trim(),
        otp,
        password,
      });
      if (!result.error) {
        change("password");
        setNotice(
          text(
            locale,
            "Password updated. Sign in to continue.",
            "密码已更新，请登录。",
          ),
        );
      }
      return result;
    }
    const result = await authClient.signIn.emailOtp({
      email: email.trim(),
      otp,
    });
    if (!result.error) {
      setOtp("");
      await onSignedIn();
    }
    return result;
  }
  return (
    <div className={styles.authLayout} data-telemetry-private>
      <aside className={styles.authStory}>
        <span className={styles.eyebrow}>YOUR NEXT SEMESTER, TOGETHER</span>
        <h1>
          {text(
            locale,
            "A little planning.\nA better semester.",
            "把心仪课程，\n留给下个学期。",
          )}
        </h1>
        <p>
          {text(
            locale,
            "Your courses, teachers and plans. Always within reach.",
            "收藏课程、了解教授，让每一次选课更从容。",
          )}
        </p>
        <div className={styles.storyScene}>
          <BrandMascot size={164} expression="belly-laugh" eager />
          <div className={styles.storyCard}>
            <BookOpen size={18} />
            <span>
              {text(locale, "Your next great class", "下一门心仪好课")}
              <small>
                {text(
                  locale,
                  "Saved, organized, ready.",
                  "收藏妥当，随时出发。",
                )}
              </small>
            </span>
            <Bookmark size={17} />
          </div>
        </div>
        <div className={styles.storyFoot}>
          <Cloud size={16} />
          {text(
            locale,
            "One account. Your favorites, everywhere.",
            "一个账号，随处接续你的收藏。",
          )}
        </div>
      </aside>
      <section className={styles.authCard}>
        <div className={styles.authTabs}>
          <button
            type="button"
            aria-pressed={mode !== "register"}
            disabled={busy}
            onClick={() => change(emailEnabled ? "email" : "password")}
          >
            {text(locale, "Sign in", "登录")}
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            disabled={busy}
            onClick={() => change("register")}
          >
            {text(locale, "Create account", "注册")}
          </button>
        </div>
        <div className={styles.authHeading}>
          <span className={styles.authIcon}>
            <ShieldCheck size={23} />
          </span>
          <h2>
            {text(
              locale,
              mode === "register"
                ? "Make yourself at home"
                : mode === "reset"
                  ? "A fresh start"
                  : mode === "passkey"
                    ? "Sign in with your device"
                    : sent
                      ? "Check your inbox"
                      : "Welcome back",
              mode === "register"
                ? "开启你的课程收藏"
                : mode === "reset"
                  ? "重置登录密码"
                  : mode === "passkey"
                    ? "使用设备通行密钥"
                    : sent
                      ? "查收你的验证码"
                      : "欢迎回来",
            )}
          </h2>
          <p>
            {text(
              locale,
              sent
                ? "Enter the code sent to your email."
                : mode === "register"
                  ? "Keep your plans close, on every device."
                  : mode === "passkey"
                    ? "Enter your email, then unlock your device. No password needed."
                    : mode === "reset"
                      ? "Verify your email to set a new password."
                      : mode === "email"
                        ? "Sign in with a code sent to your email. No password needed."
                        : "Use the password you set for your account.",
              sent
                ? "输入邮件中的验证码。"
                : mode === "register"
                  ? "在每台设备上，接续你的选课计划。"
                  : mode === "passkey"
                    ? "输入邮箱，再用指纹、面容或设备 PIN 验证，无需密码。"
                    : mode === "reset"
                      ? "通过邮件验证码，为账号设置新密码。"
                      : mode === "email"
                        ? "通过邮件验证码登录，无需设置密码。"
                        : "使用你为此账号设置的密码登录。",
            )}
          </p>
        </div>
        {mode !== "register" && mode !== "reset" ? (
          <div
            className={styles.loginMethods}
            role="group"
            aria-label={text(locale, "Sign-in method", "登录方式")}
          >
            {(
              [
                {
                  value: "email",
                  label: text(locale, "Email code", "验证码"),
                  Icon: Mail,
                },
                {
                  value: "passkey",
                  label: text(locale, "Passkey", "通行密钥"),
                  Icon: Fingerprint,
                },
                {
                  value: "password",
                  label: text(locale, "Password", "密码"),
                  Icon: KeyRound,
                },
              ] as const
            ).map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                disabled={busy}
                onClick={() => change(value)}
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(submit);
          }}
          className={styles.authForm}
          aria-busy={busy}
        >
          {mode === "register" ? (
            <label>
              {text(locale, "Display name", "昵称")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
                autoComplete="nickname"
                disabled={sent || busy}
                placeholder={text(
                  locale,
                  "How should we call you?",
                  "希望我们如何称呼你？",
                )}
              />
            </label>
          ) : null}
          <label>
            {text(locale, "Email", "邮箱")}
            <input
              type="email"
              autoComplete="username"
              name="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              required
              maxLength={254}
              disabled={busy || sent}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {mode === "password" || mode === "register" || mode === "reset" ? (
            <label>
              {text(
                locale,
                mode === "reset" ? "New password" : "Password",
                mode === "reset" ? "新密码" : "密码",
              )}
              <div className={styles.passwordField}>
                <input
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "password" ? "current-password" : "new-password"
                  }
                  value={password}
                  minLength={mode === "password" ? 1 : 12}
                  maxLength={128}
                  required
                  disabled={busy || (mode === "register" && sent)}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "password"
                      ? undefined
                      : text(locale, "At least 12 characters", "至少 12 个字符")
                  }
                />
                <button
                  type="button"
                  aria-label={text(
                    locale,
                    visible ? "Hide password" : "Show password",
                    visible ? "隐藏密码" : "显示密码",
                  )}
                  onClick={() => setVisible((x) => !x)}
                >
                  {visible ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          ) : null}
          {mode === "passkey" ? (
            <div className={styles.passkeyHint}>
              <Fingerprint size={22} aria-hidden="true" />
              <span>
                {text(
                  locale,
                  "Your email + your device",
                  "邮箱 + 设备通行密钥",
                )}
                <small>
                  {text(
                    locale,
                    "Use a passkey already added to this account.",
                    "请选择已为此账号添加的通行密钥。",
                  )}
                </small>
              </span>
            </div>
          ) : null}
          {sent ? (
            <OtpInput
              value={otp}
              onChange={setOtp}
              label={text(locale, "Verification code", "验证码")}
              autoFocus
              disabled={busy}
            />
          ) : null}
          {notice ? (
            <p role="status" className={styles.authNotice}>
              {notice}
            </p>
          ) : null}
          <Button
            type="submit"
            className={styles.fullButton}
            disabled={
              busy ||
              ((mode === "email" || mode === "register" || mode === "reset") &&
                !emailEnabled) ||
              (!sent &&
                mode !== "password" &&
                mode !== "passkey" &&
                cooldown > 0)
            }
          >
            {busy ? (
              <LoaderCircle size={17} className={styles.spin} />
            ) : mode === "passkey" ? (
              <Fingerprint size={18} />
            ) : null}
            {text(
              locale,
              busy
                ? "Please wait…"
                : mode === "passkey"
                  ? "Verify with your device"
                  : mode === "password"
                    ? "Sign in"
                    : !sent
                      ? cooldown > 0
                        ? "Send code in " + cooldown + "s"
                        : "Send verification code"
                      : mode === "register"
                        ? "Create account"
                        : mode === "reset"
                          ? "Reset password"
                          : "Verify and sign in",
              busy
                ? "请稍候…"
                : mode === "passkey"
                  ? "验证设备并登录"
                  : mode === "password"
                    ? "登录"
                    : !sent
                      ? cooldown > 0
                        ? cooldown + " 秒后可发送"
                        : "发送验证码"
                      : mode === "register"
                        ? "完成注册"
                        : mode === "reset"
                          ? "重置密码"
                          : "验证并登录",
            )}
            {!busy ? <ArrowRight size={16} /> : null}
          </Button>
          <div className={styles.authLinks}>
            {sent ? (
              <>
                <button
                  type="button"
                  disabled={busy || cooldown > 0}
                  onClick={() => void run(send)}
                >
                  {cooldown
                    ? text(
                        locale,
                        "Resend in " + cooldown + "s",
                        cooldown + " 秒后重发",
                      )
                    : text(locale, "Resend code", "重新发送")}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setNotice("");
                    setSent(false);
                    setOtp("");
                  }}
                >
                  {text(locale, "Change details", "修改信息")}
                </button>
              </>
            ) : mode === "password" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => change("reset")}
              >
                {text(locale, "Set or reset password", "设置或重置密码")}
              </button>
            ) : mode === "reset" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => change(emailEnabled ? "email" : "password")}
              >
                {text(locale, "Back to sign in", "返回登录")}
              </button>
            ) : null}
          </div>
        </form>
        {!emailEnabled ? (
          <p className={styles.authNotice}>
            {text(
              locale,
              "Email is unavailable. Existing passwords and passkeys still work.",
              "邮件服务暂不可用，可使用已有密码或通行密钥登录。",
            )}
          </p>
        ) : null}
        <details className={styles.recovery}>
          <summary>{text(locale, "Use a recovery code", "使用恢复码")}</summary>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const result = await authClient.$fetch("/recovery/verify", {
                  method: "POST",
                  body: { code: recovery },
                });
                if (!result.error) {
                  setRecovery("");
                  await onSignedIn();
                }
                return result;
              });
            }}
          >
            <label>
              {text(locale, "Recovery code", "恢复码")}
              <input
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                autoComplete="off"
                required
                maxLength={100}
              />
            </label>
            <Button variant="outline" disabled={busy}>
              {text(locale, "Continue", "继续")}
            </Button>
          </form>
        </details>
      </section>
    </div>
  );
}
