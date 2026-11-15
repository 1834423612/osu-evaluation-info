"use client";
import { confirmDiscard, DraftForm } from "@/components/forms/draft-guard";
import { useEffect, useState } from "react";
import {
  Fingerprint,
  LogOut,
  KeyRound,
  Monitor,
  Smartphone,
  Trash2,
  Cloud,
  UserRound,
  History,
  Bookmark,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { SyncPanel } from "@/components/sync/sync-panel";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { InstitutionalProfile } from "./institutional-profile";
import { AuthEntry } from "./auth-entry";
import styles from "@/components/ui/workspace.module.css";
import layout from "./account.module.css";
type Status = { enabled: boolean; email: boolean; passkey: boolean };
type Passkey = {
  id: string;
  name?: string | null;
  createdAt?: Date | null;
  backedUp: boolean;
};
type Device = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date;
  updatedAt?: Date;
};
type Metadata = {
  id: string;
  ip: string | null;
  agent: string | null;
  location?: { city?: string; region?: string; country?: string } | null;
  context?: { model?: string; platform?: string };
};
function deviceName(agent: string, model?: string) {
  const browser = /Edg\//.test(agent)
    ? "Edge"
    : /Firefox\//.test(agent)
      ? "Firefox"
      : /Chrome\//.test(agent)
        ? "Chrome"
        : /Safari\//.test(agent)
          ? "Safari"
          : "Browser";
  const os = /iPhone/.test(agent)
    ? "iPhone"
    : /iPad/.test(agent)
      ? "iPad"
      : /Android/.test(agent)
        ? "Android"
        : /Windows/.test(agent)
          ? "Windows"
          : /Mac/.test(agent)
            ? "macOS"
            : /Linux/.test(agent)
              ? "Linux"
              : "";
  return [model || os, browser].filter(Boolean).join(" · ");
}
export function AccountPage() {
  const { data: session } = authClient.useSession();
  return <AccountWorkspace key={session?.user.id ?? "guest"} />;
}
function AccountWorkspace() {
  const { locale } = usePreferences(),
    { data: session, isPending, refetch } = authClient.useSession();
  const [status, setStatus] = useState<Status | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [keys, setKeys] = useState<Passkey[]>([]),
    [devices, setDevices] = useState<Device[]>([]),
    [metadata, setMetadata] = useState<Metadata[]>([]),
    [profileName, setProfileName] = useState(""),
    [keyName, setKeyName] = useState(""),
    [password, setPassword] = useState(""),
    [oldPassword, setOldPassword] = useState(""),
    [codes, setCodes] = useState<string[]>([]),
    [deviceError, setDeviceError] = useState(false);
  const date = (value: Date | string | null | undefined) =>
    value
      ? new Date(value).toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : text(locale, "Date unavailable", "时间不可用");
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
    const [k, d, m] = await Promise.all([
      authClient.passkey.listUserPasskeys(),
      authClient.listSessions(),
      fetch("/api/account/devices", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);
    if (k.error || d.error) throw Error();
    if (k.data) setKeys(k.data);
    if (d.data) setDevices(d.data);
    if (m) setMetadata(m.devices);
    setDeviceError(false);
  }
  useEffect(() => {
    if (!session?.user.id) return;
    let active = true;
    Promise.all([
      authClient.passkey.listUserPasskeys(),
      authClient.listSessions(),
      fetch("/api/account/devices", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([k, d, m]) => {
        if (!active) return;
        if (k.data) setKeys(k.data);
        if (d.data) setDevices(d.data);
        if (m) setMetadata(m.devices);
        setDeviceError(!!k.error || !!d.error);
      })
      .catch(() => {
        if (active) setDeviceError(true);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);
  async function run(
    action: () => Promise<{ error?: unknown } | void>,
    success?: string,
  ) {
    if (busy) return;
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
          "Could not complete this action. Sign in again or retry.",
          "操作未完成，请重新登录或稍后重试。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeader active="account" />
      <main className={styles.shell} data-telemetry-private>
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {!status || isPending ? (
          <div className={styles.empty} role="status">
            {text(locale, "Loading your space…", "正在打开你的空间…")}
          </div>
        ) : !status.enabled ? (
          <section className={styles.panel}>
            <h1>{text(locale, "Your account", "我的账号")}</h1>
            <p className={styles.muted}>
              {text(
                locale,
                "Account services are temporarily unavailable. Your local favorites are still here.",
                "账号服务暂不可用，本地收藏仍可正常使用。",
              )}
            </p>
            <Button asChild variant="outline">
              <Link href="/saved">
                {text(locale, "Open favorites", "查看收藏")}
              </Link>
            </Button>
          </section>
        ) : !session ? (
          <AuthEntry
            locale={locale}
            emailEnabled={status.email}
            onSignedIn={refetch}
          />
        ) : (
          <>
            <div className={layout.profile}>
              <div className={layout.avatar} aria-hidden="true">
                {(session.user.name || "W").slice(0, 1).toUpperCase()}
              </div>
              <div className={layout.profileCopy}>
                <h1>{session.user.name}</h1>
                <p>{session.user.email}</p>
              </div>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (!confirmDiscard()) return;
                    const result = await authClient.signOut();
                    if (!result.error) await refetch();
                    return result;
                  })
                }
              >
                <LogOut size={15} />
                {text(locale, "Sign out", "退出登录")}
              </Button>
            </div>
            <div className={layout.accountLayout}>
              <nav
                className={layout.accountNav}
                aria-label={text(locale, "Account sections", "账号设置")}
              >
                <a href="#profile">
                  <UserRound size={16} />
                  {text(locale, "Profile", "个人资料")}
                </a>
                <a href="#sync">
                  <Cloud size={16} />
                  {text(locale, "Sync", "收藏同步")}
                </a>
                <a href="#security">
                  <ShieldCheck size={16} />
                  {text(locale, "Security", "登录安全")}
                </a>
                <a href="#devices">
                  <Monitor size={16} />
                  {text(locale, "Devices", "登录设备")}
                </a>
                <Link href="/saved">
                  <Bookmark size={16} />
                  {text(locale, "Favorites", "我的收藏")}
                </Link>
                <Link href="/history">
                  <History size={16} />
                  {text(locale, "Recent activity", "最近记录")}
                </Link>
              </nav>
              <div>
                <section
                  className={styles.panel + " " + layout.section}
                  id="profile"
                >
                  <h2>
                    <UserRound size={18} />
                    {text(locale, "Profile", "个人资料")}
                  </h2>
                  <DraftForm
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
                    <div className={styles.fields}>
                      <label>
                        {text(locale, "Display name", "昵称")}
                        <input
                          className={styles.input}
                          value={profileName}
                          placeholder={session.user.name}
                          onChange={(e) => setProfileName(e.target.value)}
                          maxLength={60}
                          required
                          autoComplete="nickname"
                        />
                      </label>
                    </div>
                    <Button
                      variant="outline"
                      disabled={busy || !profileName.trim()}
                    >
                      {text(locale, "Save changes", "保存更改")}
                    </Button>
                  </DraftForm>
                </section>
                <InstitutionalProfile locale={locale} />
                <div id="sync" className={layout.section}>
                  <SyncPanel accountId={session.user.id} locale={locale} />
                </div>
                <section id="security" className={layout.section}>
                  <h2>
                    <ShieldCheck size={18} />
                    {text(locale, "Sign-in & security", "登录与安全")}
                  </h2>
                  <div className={layout.securityGrid}>
                    <section className={styles.panel}>
                      <h2>
                        <Fingerprint size={18} />
                        {text(locale, "Passkeys", "通行密钥")}
                      </h2>
                      <p className={layout.sectionIntro}>
                        {text(
                          locale,
                          "Use your fingerprint, face or security key to sign in.",
                          "使用指纹、面容或安全密钥，轻松完成登录。",
                        )}
                      </p>
                      <ul className={styles.list}>
                        {keys.map((key) => (
                          <li className={styles.row} key={key.id}>
                            <Fingerprint size={19} />
                            <div className={layout.deviceCopy}>
                              <strong>
                                {key.name ||
                                  text(locale, "Passkey", "通行密钥")}
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
                                <br />
                                {text(locale, "Added · ", "添加于 · ")}
                                {date(key.createdAt)}
                              </small>
                            </div>
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={text(
                                locale,
                                "Remove passkey",
                                "移除通行密钥",
                              )}
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
                      {!keys.length ? (
                        <p className={styles.muted}>
                          {text(
                            locale,
                            "No passkeys added yet.",
                            "尚未添加通行密钥。",
                          )}
                        </p>
                      ) : null}
                      <div className={styles.fields}>
                        <label>
                          {text(locale, "Passkey name", "密钥名称")}
                          <input
                            className={styles.input}
                            value={keyName}
                            maxLength={60}
                            onChange={(e) => setKeyName(e.target.value)}
                            placeholder={text(locale, "My laptop", "我的电脑")}
                          />
                        </label>
                      </div>
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
                        <Fingerprint size={15} />
                        {text(locale, "Add a passkey", "添加通行密钥")}
                      </Button>
                    </section>
                    <section className={styles.panel}>
                      <h2>
                        <KeyRound size={18} />
                        {text(locale, "Password", "登录密码")}
                      </h2>
                      <DraftForm
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
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                  body: JSON.stringify({ password }),
                                });
                                if (!r.ok) throw Error();
                              }
                              setOldPassword("");
                              setPassword("");
                              await refreshDevices();
                            },
                            text(locale, "Password updated", "密码已更新"),
                          );
                        }}
                      >
                        <div className={styles.fields}>
                          <label>
                            {text(
                              locale,
                              "Current password (if set)",
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
                              "New password · at least 8 characters",
                              "新密码 · 至少 8 个字符",
                            )}
                            <input
                              className={styles.input}
                              type="password"
                              autoComplete="new-password"
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required
                              minLength={8}
                              maxLength={128}
                            />
                          </label>
                        </div>
                        <Button variant="outline" disabled={busy}>
                          {text(locale, "Update password", "更新密码")}
                        </Button>
                      </DraftForm>
                      <details className={layout.recovery}>
                        <summary>
                          {text(locale, "Recovery codes", "恢复码")}
                        </summary>
                        <p className={styles.muted}>
                          {text(
                            locale,
                            "Each code works once for one year. Generating new codes invalidates the previous set.",
                            "每个恢复码限用一次，一年内有效。生成新码后，旧码立即失效。",
                          )}
                        </p>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void run(async () => {
                              const result = await authClient.$fetch<{
                                codes: string[];
                              }>("/recovery/generate", {
                                method: "POST",
                                body: {},
                              });
                              if (result.data) setCodes(result.data.codes);
                              return result;
                            })
                          }
                        >
                          {text(
                            locale,
                            "Generate recovery codes",
                            "生成恢复码",
                          )}
                        </Button>
                        {codes.length ? (
                          <>
                            <textarea
                              className={styles.input}
                              readOnly
                              rows={10}
                              value={codes.join("\n")}
                              aria-label={text(
                                locale,
                                "Recovery codes — save privately",
                                "恢复码，请妥善保存",
                              )}
                            />
                            <div className={styles.actions}>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  const url = URL.createObjectURL(
                                    new Blob([codes.join("\n")], {
                                      type: "text/plain",
                                    }),
                                  );
                                  const a = document.createElement("a");
                                  a.href = url;
                                  a.download = "waho-recovery-codes.txt";
                                  a.click();
                                  setTimeout(
                                    () => URL.revokeObjectURL(url),
                                    1000,
                                  );
                                }}
                              >
                                {text(locale, "Download codes", "下载恢复码")}
                              </Button>
                              <Button
                                variant="ghost"
                                onClick={() => setCodes([])}
                              >
                                {text(locale, "Hide codes", "隐藏恢复码")}
                              </Button>
                            </div>
                          </>
                        ) : null}
                      </details>
                    </section>
                  </div>
                </section>
                <section
                  className={styles.panel + " " + layout.section}
                  id="devices"
                >
                  <h2>
                    <Monitor size={18} />
                    {text(locale, "Signed-in devices", "登录设备")}
                  </h2>
                  <p className={layout.sectionIntro}>
                    {text(
                      locale,
                      "Review where you are signed in. Location is estimated from the network address.",
                      "查看登录设备；归属地根据网络地址估算。",
                    )}
                  </p>
                  {deviceError ? (
                    <p role="status" className={styles.notice}>
                      {text(
                        locale,
                        "Devices could not be loaded.",
                        "设备列表暂不可用。",
                      )}
                      <Button
                        variant="ghost"
                        onClick={() => void run(refreshDevices)}
                      >
                        {text(locale, "Retry", "重试")}
                      </Button>
                    </p>
                  ) : null}
                  <ul className={styles.list}>
                    {devices.map((device) => {
                      const meta = metadata.find((m) => m.id === device.id),
                        agent = device.userAgent ?? meta?.agent ?? "",
                        location = [
                          meta?.location?.city,
                          meta?.location?.region,
                          meta?.location?.country,
                        ]
                          .filter(Boolean)
                          .join(" · ");
                      const Mobile = /Android|iPhone|iPad/.test(agent)
                        ? Smartphone
                        : Monitor;
                      return (
                        <li key={device.id} className={styles.row}>
                          <Mobile size={20} />
                          <div className={layout.deviceCopy}>
                            <strong>
                              {deviceName(agent, meta?.context?.model)}
                              {device.id === session.session.id ? (
                                <span className={layout.current}>
                                  {text(locale, "This device", "当前设备")}
                                </span>
                              ) : null}
                            </strong>
                            <small>
                              {device.ipAddress ||
                                meta?.ip ||
                                text(locale, "IP unavailable", "IP 暂不可用")}
                              {location ? " · " + location : ""}
                              <br />
                              {text(locale, "Signed in · ", "登录于 · ")}
                              {date(device.createdAt)}
                              {device.updatedAt ? (
                                <>
                                  <br />
                                  {text(
                                    locale,
                                    "Last active · ",
                                    "最近活动 · ",
                                  )}
                                  {date(device.updatedAt)}
                                </>
                              ) : null}
                            </small>
                          </div>
                          {device.id !== session.session.id ? (
                            <Button
                              variant="ghost"
                              disabled={busy}
                              onClick={() =>
                                void run(async () => {
                                  const result = await authClient.revokeSession(
                                    { token: device.token },
                                  );
                                  if (!result.error) await refreshDevices();
                                  return result;
                                })
                              }
                            >
                              {text(locale, "Sign out", "退出")}
                            </Button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <Button
                    variant="outline"
                    disabled={busy || devices.length < 2}
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
              </div>
            </div>
          </>
        )}
      </main>
      <AppFooter />
    </>
  );
}
