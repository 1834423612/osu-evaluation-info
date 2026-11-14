"use client";
import { useEffect, useState } from "react";
import {
  Fingerprint,
  Mail,
  LogOut,
  KeyRound,
  Monitor,
  Trash2,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
type Status = { enabled: boolean; email: boolean; passkey: boolean };
type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: Date | null;
  deviceType: string;
  backedUp: boolean;
};
type Device = {
  id: string;
  token: string;
  userAgent?: string | null;
  createdAt: Date;
  expiresAt: Date;
};
export function AccountPage() {
  const { data: session } = authClient.useSession();
  return <AccountWorkspace key={session?.user.id ?? "guest"} />;
}
function AccountWorkspace() {
  const { locale } = usePreferences(),
    { data: session, isPending, refetch } = authClient.useSession();
  const [recovery, setRecovery] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [profileName, setProfileName] = useState("");
  const [status, setStatus] = useState<Status | null>(null),
    [email, setEmail] = useState(""),
    [name, setName] = useState(""),
    [otp, setOtp] = useState(""),
    [password, setPassword] = useState(""),
    [oldPassword, setOldPassword] = useState(""),
    [mode, setMode] = useState<"email" | "password" | "reset">("email"),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [keys, setKeys] = useState<Passkey[]>([]),
    [devices, setDevices] = useState<Device[]>([]),
    [keyName, setKeyName] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch("/api/account/status", { signal: c.signal })
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {
        if (!c.signal.aborted)
          setStatus({ enabled: false, email: false, passkey: false });
      });
    return () => c.abort();
  }, []);
  async function refreshDevices() {
    const [k, d] = await Promise.all([
      authClient.passkey.listUserPasskeys(),
      authClient.listSessions(),
    ]);
    if (k.data) setKeys(k.data);
    if (d.data) setDevices(d.data);
  }
  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    Promise.all([
      authClient.passkey.listUserPasskeys(),
      authClient.listSessions(),
    ]).then(([k, d]) => {
      if (active) {
        if (k.data) setKeys(k.data);
        if (d.data) setDevices(d.data);
      }
    });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  async function run(
    action: () => Promise<{ error?: unknown } | void>,
    success?: string,
  ) {
    setBusy(true);
    setNotice("");
    try {
      const result = await action();
      if (result?.error) throw Error();
      if (success) setNotice(success);
    } catch {
      setNotice(
        text(
          locale,
          "Could not complete this. Check the code or sign in again.",
          "操作未完成，请检查验证码或重新登录。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const headers = { "x-waho-locale": locale };
  async function sendCode() {
    await run(async () => {
      const result =
        mode === "reset"
          ? await authClient.emailOtp.requestPasswordReset(
              { email },
              { headers },
            )
          : await authClient.emailOtp.sendVerificationOtp(
              { email, type: "sign-in" },
              { headers },
            );
      if (result.error) return result;
      setSent(true);
      setNotice(
        text(
          locale,
          "Check your email. The code expires in 5 minutes.",
          "请查收邮件，验证码 5 分钟内有效。",
        ),
      );
      return result;
    });
  }
  async function submit() {
    await run(async () => {
      if (mode === "password") {
        const result = await authClient.signIn.email({ email, password });
        if (!result.error) {
          setPassword("");
          await refetch();
        }
        return result;
      }
      if (mode === "reset") {
        const result = await authClient.emailOtp.resetPassword({
          email,
          otp,
          password,
        });
        if (!result.error) {
          setMode("password");
          setSent(false);
          setOtp("");
          setPassword("");
          setNotice(
            text(
              locale,
              "Password reset. Sign in with your new password.",
              "密码已重置，请用新密码登录。",
            ),
          );
        }
        return result;
      }
      const result = await authClient.signIn.emailOtp({
        email,
        otp,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
      if (!result.error) {
        setOtp("");
        await refetch();
      }
      return result;
    });
  }
  return (
    <>
      <AppHeader />
      <main className={styles.shell} data-telemetry-private>
        <div className={styles.heading}>
          <div>
            <h1>{text(locale, "Account & devices", "账号与设备")}</h1>
            <p>
              {text(
                locale,
                "Sign in on your phone or computer",
                "手机、电脑均可登录",
              )}
            </p>
          </div>
          {session ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await authClient.signOut();
                  window.location.reload();
                })
              }
            >
              <LogOut size={15} />
              {text(locale, "Sign out", "退出登录")}
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {!status ? (
          <p>
            {text(locale, "Checking account services…", "正在检查账号服务…")}
          </p>
        ) : !status.enabled ? (
          <section className={styles.panel}>
            <h2>
              {text(locale, "Account service is not ready", "账号服务尚未就绪")}
            </h2>
            <p className={styles.muted}>
              {text(
                locale,
                "Local favorites remain available. The server needs authentication settings and its database migration.",
                "仍可使用本地收藏。服务器需要完成认证配置和数据库迁移。",
              )}
            </p>
          </section>
        ) : isPending ? (
          <p>{text(locale, "Loading…", "正在读取…")}</p>
        ) : !session ? (
          <div className={styles.grid}>
            <section className={styles.panel}>
              <h2>
                <Mail size={18} />{" "}
                {text(locale, "Continue by email", "通过邮箱登录")}
              </h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void (sent || mode === "password" ? submit() : sendCode());
                }}
              >
                <div className={styles.fields}>
                  <label>
                    {text(locale, "Email", "邮箱")}
                    <input
                      className={styles.input}
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setSent(false);
                      }}
                    />
                  </label>
                  {mode === "email" && !sent ? (
                    <label>
                      {text(locale, "Display name (optional)", "昵称（可选）")}
                      <input
                        className={styles.input}
                        maxLength={60}
                        autoComplete="nickname"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </label>
                  ) : null}
                  {sent ? (
                    <label>
                      {text(locale, "Email code", "邮箱验证码")}
                      <input
                        className={styles.input}
                        autoComplete="one-time-code"
                        inputMode="numeric"
                        pattern="[0-9]{6}"
                        maxLength={6}
                        required
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, ""))
                        }
                      />
                    </label>
                  ) : null}
                  {mode !== "email" ? (
                    <label>
                      {text(
                        locale,
                        mode === "reset" ? "New password" : "Password",
                        mode === "reset" ? "新密码" : "密码",
                      )}
                      <input
                        className={styles.input}
                        type="password"
                        minLength={mode === "reset" ? 12 : 1}
                        maxLength={128}
                        required
                        autoComplete={
                          mode === "reset" ? "new-password" : "current-password"
                        }
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  ) : null}
                </div>
                <Button
                  type="submit"
                  disabled={busy || (mode !== "password" && !status.email)}
                >
                  {text(
                    locale,
                    sent && mode === "reset"
                      ? "Reset password"
                      : sent || mode === "password"
                        ? "Sign in"
                        : "Send code",
                    sent && mode === "reset"
                      ? "重置密码"
                      : sent || mode === "password"
                        ? "登录"
                        : "发送验证码",
                  )}
                </Button>
                <div className={styles.actions}>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setMode(mode === "email" ? "password" : "email");
                      setSent(false);
                      setPassword("");
                    }}
                  >
                    {text(
                      locale,
                      mode === "email" ? "Use a password" : "Use an email code",
                      mode === "email" ? "使用密码" : "使用邮箱验证码",
                    )}
                  </Button>
                  {mode === "password" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setMode("reset");
                        setSent(false);
                        setPassword("");
                      }}
                    >
                      {text(locale, "Reset password", "重置密码")}
                    </Button>
                  ) : null}
                  {sent ? (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => void sendCode()}
                    >
                      {text(locale, "Resend code", "重新发送")}
                    </Button>
                  ) : null}
                </div>
                {!status.email ? (
                  <p className={styles.muted}>
                    {text(
                      locale,
                      "Email delivery is not configured. Existing passkeys and passwords still work.",
                      "邮件发送尚未配置，已有通行密钥与密码仍可使用。",
                    )}
                  </p>
                ) : null}
              </form>
            </section>
            <section className={styles.panel}>
              <h2>
                <KeyRound size={18} />
                {text(locale, "Recovery codes", "恢复码")}
              </h2>
              <p className={styles.muted}>
                {text(
                  locale,
                  "Keep these offline. Each code works once, for one year. New codes replace old ones.",
                  "请离线保存，每个恢复码限用一次，一年内有效；生成新码后旧码失效。",
                )}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await authClient.$fetch<{ codes: string[] }>(
                      "/recovery/generate",
                      { method: "POST", body: {} },
                    );
                    if (result.data) setRecoveryCodes(result.data.codes);
                    return result;
                  })
                }
              >
                {text(locale, "Generate new codes", "生成新恢复码")}
              </Button>
              {recoveryCodes.length ? (
                <>
                  <label className={styles.fields}>
                    {text(locale, "Save these codes now", "请立即保存恢复码")}
                    <textarea
                      className={styles.input}
                      readOnly
                      rows={10}
                      value={recoveryCodes.join("\n")}
                    />
                  </label>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const url = URL.createObjectURL(
                          new Blob([recoveryCodes.join("\n")], {
                            type: "text/plain",
                          }),
                        ),
                        link = document.createElement("a");
                      link.href = url;
                      link.download = "waho-recovery-codes.txt";
                      link.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    }}
                  >
                    {text(locale, "Download codes", "下载恢复码")}
                  </Button>
                  <Button variant="ghost" onClick={() => setRecoveryCodes([])}>
                    {text(locale, "Hide codes", "隐藏恢复码")}
                  </Button>
                </>
              ) : null}
            </section>
            <section className={styles.panel}>
              <h2>
                <Fingerprint size={18} />{" "}
                {text(locale, "Use a passkey", "使用通行密钥")}
              </h2>
              <p className={styles.muted}>
                {text(
                  locale,
                  "Choose another device in your browser to use a nearby phone. If unavailable, sign in by email.",
                  "可在浏览器中选择其他设备，调用附近手机的密钥；不支持时使用邮箱登录。",
                )}
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await authClient.signIn.passkey();
                    if (!result.error) await refetch();
                    return result;
                  })
                }
              >
                <Fingerprint size={16} />
                {text(locale, "Sign in with a passkey", "用通行密钥登录")}
              </Button>
              <details>
                <summary>
                  {text(locale, "Use a recovery code", "使用恢复码")}
                </summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      const result = await authClient.$fetch(
                        "/recovery/verify",
                        { method: "POST", body: { code: recovery } },
                      );
                      if (!result.error) {
                        setRecovery("");
                        await refetch();
                      }
                      return result;
                    });
                  }}
                >
                  <label className={styles.fields}>
                    {text(locale, "Recovery code", "恢复码")}
                    <input
                      className={styles.input}
                      autoComplete="off"
                      value={recovery}
                      maxLength={100}
                      required
                      onChange={(e) => setRecovery(e.target.value)}
                    />
                  </label>
                  <Button variant="outline" disabled={busy}>
                    {text(locale, "Recover account", "恢复账号")}
                  </Button>
                </form>
              </details>
              <p className={styles.muted}>
                {text(
                  locale,
                  "Create an account by email first, then add a passkey.",
                  "首次通过邮箱创建账号，再添加通行密钥。",
                )}
              </p>
            </section>
          </div>
        ) : (
          <>
            <section className={styles.panel}>
              <h2>
                {session.user.name || text(locale, "Your account", "我的账号")}
              </h2>
              <p className={styles.muted}>{session.user.email}</p>
              <details>
                <summary>{text(locale, "Edit profile", "编辑资料")}</summary>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      async () => {
                        const result = await authClient.updateUser({
                          name: profileName.trim(),
                        });
                        if (!result.error) {
                          setProfileName("");
                          await refetch();
                        }
                        return result;
                      },
                      text(locale, "Name updated", "昵称已更新"),
                    );
                  }}
                >
                  <label className={styles.fields}>
                    {text(locale, "Display name", "昵称")}
                    <input
                      className={styles.input}
                      value={profileName}
                      placeholder={session.user.name}
                      required
                      maxLength={60}
                      onChange={(e) => setProfileName(e.target.value)}
                    />
                  </label>
                  <Button variant="outline" disabled={busy}>
                    {text(locale, "Save name", "保存昵称")}
                  </Button>
                </form>
              </details>
              <p className={styles.muted}>
                {text(
                  locale,
                  "Cloud sync is optional. Signing in does not replace local favorites.",
                  "云同步可单独启用，登录不会替换本地收藏。",
                )}
              </p>
            </section>
            <div className={styles.grid}>
              <section className={styles.panel}>
                <h2>
                  <Fingerprint size={18} />{" "}
                  {text(locale, "Passkeys", "通行密钥")}
                </h2>
                <label className={styles.fields}>
                  {text(locale, "Device name", "设备名称")}
                  <input
                    className={styles.input}
                    maxLength={60}
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder={text(locale, "My laptop", "我的电脑")}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const result = await authClient.passkey.addPasskey({
                        name:
                          keyName.trim() ||
                          text(locale, "My device", "我的设备"),
                      });
                      if (!result.error) {
                        setKeyName("");
                        await refreshDevices();
                      }
                      return result;
                    })
                  }
                >
                  {text(locale, "Add on this device", "在此设备添加")}
                </Button>
                <ul className={styles.list}>
                  {keys.map((key) => (
                    <li key={key.id} className={styles.row}>
                      <Fingerprint size={17} />
                      <span>
                        <strong>
                          {key.name || text(locale, "Passkey", "通行密钥")}
                        </strong>
                        <small>
                          {text(
                            locale,
                            key.backedUp
                              ? "Synced by your credential provider"
                              : "Device or security key",
                            key.backedUp
                              ? "由密钥提供方同步"
                              : "设备或安全密钥",
                          )}
                        </small>
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={text(locale, "Remove passkey", "移除密钥")}
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result =
                              await authClient.passkey.deletePasskey({
                                id: key.id,
                              });
                            if (!result.error) await refreshDevices();
                            return result;
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={styles.panel}>
                <h2>
                  <KeyRound size={18} />{" "}
                  {text(locale, "Optional password", "可选密码")}
                </h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(
                      async () => {
                        if (oldPassword) {
                          const result = await authClient.changePassword({
                            currentPassword: oldPassword,
                            newPassword: password,
                            revokeOtherSessions: true,
                          });
                          if (result.error) return result;
                        } else {
                          const r = await fetch("/api/account/password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ password }),
                          });
                          if (!r.ok) throw Error();
                        }
                        setPassword("");
                        setOldPassword("");
                      },
                      text(locale, "Password saved", "密码已保存"),
                    );
                  }}
                >
                  <div className={styles.fields}>
                    <label>
                      {text(
                        locale,
                        "Current password (if already set)",
                        "当前密码（已设置时填写）",
                      )}
                      <input
                        className={styles.input}
                        type="password"
                        autoComplete="current-password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                      />
                    </label>
                    <label>
                      {text(
                        locale,
                        "New password · at least 12 characters",
                        "新密码 · 至少 12 个字符",
                      )}
                      <input
                        className={styles.input}
                        type="password"
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </label>
                  </div>
                  <Button variant="outline" disabled={busy}>
                    {text(locale, "Save password", "保存密码")}
                  </Button>
                </form>
              </section>
            </div>
            <section className={styles.panel}>
              <h2>
                <Monitor size={18} />{" "}
                {text(locale, "Signed-in devices", "登录设备")}
              </h2>
              <ul className={styles.list}>
                {devices.map((device) => (
                  <li key={device.id} className={styles.row}>
                    <Monitor size={17} />
                    <span>
                      <strong>
                        {device.id === session.session.id
                          ? text(locale, "This device", "当前设备")
                          : (
                              device.userAgent ||
                              text(locale, "Browser session", "浏览器会话")
                            ).slice(0, 100)}
                      </strong>
                      <small>
                        {new Date(device.createdAt).toLocaleString(
                          locale === "zh" ? "zh-CN" : "en-US",
                        )}
                      </small>
                    </span>
                    {device.id !== session.session.id ? (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void run(async () => {
                            const result = await authClient.revokeSession({
                              token: device.token,
                            });
                            if (!result.error) await refreshDevices();
                            return result;
                          })
                        }
                      >
                        {text(locale, "Revoke", "撤销")}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await authClient.revokeOtherSessions();
                    if (!result.error) await refreshDevices();
                    return result;
                  })
                }
              >
                {text(locale, "Sign out other devices", "退出其他设备")}
              </Button>
            </section>
          </>
        )}
      </main>
      <AppFooter />
    </>
  );
}
