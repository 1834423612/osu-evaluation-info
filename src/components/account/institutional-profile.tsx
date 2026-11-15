"use client";
import { useEffect, useState } from "react";
import { Mail, ShieldCheck } from "lucide-react";
import { DraftForm } from "@/components/forms/draft-guard";
import { Button } from "@/components/ui/button";
import { OtpInput } from "./otp-input";
import { text, type Locale } from "@/lib/i18n";
import ui from "@/components/ui/workspace.module.css";
import styles from "./account.module.css";
type Profile = {
  display_name: string;
  show_name: boolean;
  show_nickname: boolean;
  show_email: boolean;
};
type State = {
  institution: {
    verified: boolean;
    email: string | null;
    primary: boolean;
    verifiedAt?: string;
  };
  profile: Profile;
};
export function InstitutionalProfile({ locale }: { locale: Locale }) {
  const [data, setData] = useState<State | null>(null),
    [profile, setProfile] = useState<Profile>({
      display_name: "",
      show_name: false,
      show_nickname: false,
      show_email: false,
    }),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [cooldown, setCooldown] = useState(0),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const c = new AbortController();
    void fetch("/api/account/institution", {
      signal: c.signal,
      cache: "no-store",
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((value) => {
        setData(value);
        setProfile(value.profile);
      })
      .catch(() => {
        if (!c.signal.aborted)
          setNotice(
            text(locale, "Email settings unavailable.", "邮箱设置暂不可用。"),
          );
      });
    return () => c.abort();
  }, [locale]);
  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((n) => Math.max(0, n - 1)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);
  async function submit(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/account/institution", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-waho-locale": locale,
        },
        body: JSON.stringify(body),
      });
      const result = await r.json();
      if (!r.ok) {
        if (r.status === 429) {
          setCooldown(60);
          throw Error("rate");
        }
        throw Error(result.error);
      }
      if (body.action === "send") {
        setSent(true);
        setCooldown(60);
        setNotice(
          text(
            locale,
            "Check your school inbox. Code expires in 5 minutes.",
            "请查收学校邮箱，验证码五分钟内有效。",
          ),
        );
      } else {
        setData((old) =>
          old ? { ...old, institution: result.institution } : old,
        );
        setEmail("");
        setCode("");
        setSent(false);
        setRevision((n) => n + 1);
        setNotice(text(locale, "Saved.", "已保存。"));
      }
    } catch (e) {
      setNotice(
        text(
          locale,
          e instanceof Error && e.message === "rate"
            ? "Wait a minute before trying again."
            : "Could not verify or save. Check your email and latest code.",
          e instanceof Error && e.message === "rate"
            ? "请稍等一分钟再试。"
            : "未能验证或保存，请检查学校邮箱及最新验证码。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={ui.panel}>
      <h2>
        <Mail size={18} />
        {text(locale, "School email & public identity", "学校邮箱与公开身份")}
      </h2>
      <p className={styles.sectionIntro}>
        {text(
          locale,
          "School-email verification is required for on-site contributions. It does not connect a university account.",
          "本站投稿需验证学校邮箱，不会关联学校账号。",
        )}
      </p>
      {data?.institution.verified ? (
        <div className={styles.verifiedMail}>
          <ShieldCheck size={17} />
          <span>
            <strong>{text(locale, "Email verified", "邮箱已验证")}</strong>
            <small>
              {data.institution.email}
              {data.institution.verifiedAt
                ? " · " +
                  new Date(data.institution.verifiedAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )
                : ""}
            </small>
          </span>
        </div>
      ) : (
        <DraftForm
          key={"mail" + revision}
          onSubmit={(e) => {
            e.preventDefault();
            void submit(
              sent ? { action: "verify", code } : { action: "send", email },
            );
          }}
        >
          <div className={ui.fields}>
            <label>
              {text(locale, "OSU / OSUMC email", "OSU／OSUMC 邮箱")}
              <input
                className={ui.input}
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={busy || sent || !data}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@osu.edu"
              />
            </label>
          </div>
          {sent ? (
            <OtpInput
              value={code}
              onChange={setCode}
              label={text(locale, "Verification code", "验证码")}
              disabled={busy}
              autoFocus
            />
          ) : null}
          <div className={ui.actions}>
            <Button
              variant="outline"
              disabled={busy || !data || (!sent && cooldown > 0)}
            >
              {text(
                locale,
                sent
                  ? "Verify school email"
                  : cooldown
                    ? "Resend in " + cooldown + "s"
                    : "Send verification code",
                sent
                  ? "验证学校邮箱"
                  : cooldown
                    ? cooldown + " 秒后可重发"
                    : "发送验证码",
              )}
            </Button>
            {sent ? (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSent(false);
                  setCode("");
                }}
              >
                {text(locale, "Change email", "修改邮箱")}
              </Button>
            ) : null}
          </div>
        </DraftForm>
      )}
      {data ? (
        <DraftForm
          key={"profile" + revision}
          className={styles.publicProfile}
          onSubmit={(e) => {
            e.preventDefault();
            void submit({ action: "profile", ...profile });
          }}
        >
          <h3>{text(locale, "Public identity", "公开身份")}</h3>
          <p>
            {text(
              locale,
              "Anonymous by default. This does not remove private security records.",
              "默认匿名；公开范围不影响必要的后台安全记录。",
            )}
          </p>
          <label>
            {text(locale, "Optional public name", "可选公开姓名")}
            <input
              className={ui.input}
              value={profile.display_name}
              maxLength={60}
              onChange={(e) =>
                setProfile({ ...profile, display_name: e.target.value })
              }
            />
          </label>
          <div className={styles.privacyChoices}>
            {(
              [
                ["show_name", "Name", "姓名"],
                ["show_nickname", "Nickname", "昵称"],
                ["show_email", "Email", "邮箱"],
              ] as const
            ).map(([key, en, zh]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={profile[key]}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.checked })
                  }
                />
                {text(locale, "Show " + en, "公开" + zh)}
              </label>
            ))}
          </div>
          <Button size="sm" variant="outline" disabled={busy}>
            {text(locale, "Save visibility", "保存公开范围")}
          </Button>
        </DraftForm>
      ) : null}
      {notice ? (
        <p className={ui.notice} role="status">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
