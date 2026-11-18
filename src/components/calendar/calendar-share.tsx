"use client";
import { useEffect, useState } from "react";
import { Share2, Copy } from "lucide-react";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { planningScope, syncPlanning } from "@/lib/planning/client-sync";
import type { UserCalendar } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar.module.css";
const categories = ["class", "assignment", "exam", "holiday", "event"];
const labels = ["课程", "作业", "考试", "假日", "个人日程"];
type SavedLink = {
  id: string;
  token: string;
  calendarIds: string[];
  expiresAt: string | null;
};
export function CalendarShare({
  calendars,
  selected,
  locale,
  persist,
}: {
  calendars: UserCalendar[];
  selected: string;
  locale: Locale;
  persist: () => Promise<boolean>;
}) {
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [open, setOpen] = useState(false),
    [ids, setIds] = useState([selected]),
    [kinds, setKinds] = useState([...categories]),
    [nickname, setNickname] = useState(""),
    [expiry, setExpiry] = useState("604800"),
    [message, setMessage] = useState("");
  const [links, setLinks] = useState<SavedLink[]>([]),
    [current, setCurrent] = useState<SavedLink | null>(null);
  const [publishing, setPublishing] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    fetch("/api/calendar/links", { signal: c.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) setLinks(d.links);
      })
      .catch(() => {});
    return () => c.abort();
  }, [open]);
  const feed = (link: SavedLink) =>
    `${location.origin}/api/calendar/feed?` +
    new URLSearchParams({ id: link.id, key: link.token });
  const view = (link: SavedLink) =>
    `${location.origin}/calendar/shared?id=${link.id}#k=${link.token}`;
  async function publish() {
    if (publishing) return;
    setPublishing(true);
    try {
      const account = planningScope();
      if (!account) throw Error("account");
      if (!(await persist())) throw Error("storage");
      await syncPlanning(account);
      const response = await fetch("/api/calendar/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarIds: ids,
          categories: kinds,
          nickname,
          expiresIn: Number(expiry),
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw Error(body.error);
      }
      const data = await response.json();
      const link = { ...data, calendarIds: ids };
      setCurrent(link);
      setLinks((rows) => [...rows.filter((r) => r.id !== link.id), link]);
      setMessage(
        t(
          "Link ready. Calendar changes update this same feed.",
          "链接已生成，日历变更会更新到同一个订阅地址。",
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "institution_required"
          ? t(
              "Verify your school email in Account before sharing.",
              "请先在账号页面验证学校邮箱，再创建分享。",
            )
          : t(
              "Sign in and wait for calendar sync, then retry.",
              "请登录并等待日历同步后重试。",
            ),
      );
    } finally {
      setPublishing(false);
    }
  }
  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage(t("Copied", "已复制"));
    } catch {
      setMessage(value);
    }
  }
  return (
    <>
      <button
        onClick={() => {
          setIds([selected]);
          setOpen(true);
        }}
      >
        <Share2 size={13} />
        {t("Share & subscribe", "分享与订阅")}
      </button>
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        title={t("Share calendars", "分享日历")}
        description={t(
          "Choose calendars and visible content",
          "选择日历与可查看内容",
        )}
        closeLabel={t("Close", "关闭")}
      >
        <div className={`${styles.root} ${styles.form}`}>
          {calendars.map((c) => (
            <button
              key={c.id}
              role="checkbox"
              aria-checked={ids.includes(c.id)}
              onClick={() =>
                setIds(
                  ids.includes(c.id)
                    ? ids.filter((id) => id !== c.id)
                    : [...ids, c.id],
                )
              }
            >
              {ids.includes(c.id) ? "✓" : "+"} {c.title}
            </button>
          ))}
          <div className={styles.actions}>
            {categories.map((kind, index) => (
              <button
                key={kind}
                role="checkbox"
                aria-checked={kinds.includes(kind)}
                onClick={() =>
                  setKinds(
                    kinds.includes(kind)
                      ? kinds.filter((k) => k !== kind)
                      : [...kinds, kind],
                  )
                }
              >
                {kinds.includes(kind) ? "✓" : "+"} {t(kind, labels[index])}
              </button>
            ))}
          </div>
          <label>
            {t("Public nickname (optional)", "公开昵称（可选）")}
            <input
              maxLength={80}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <label>
            {t("Link expiry", "链接有效期")}
            <ChoiceSelect value={expiry} onValueChange={setExpiry}>
              <option value="86400">{t("One day", "一天")}</option>
              <option value="604800">{t("One week", "一周")}</option>
              <option value="2592000">{t("30 days", "30 天")}</option>
              <option value="0">
                {t("Until revoked", "长期有效，直到撤销")}
              </option>
            </ChoiceSelect>
          </label>
          <button
            disabled={
              publishing || !ids.length || ids.length > 30 || !kinds.length
            }
            onClick={() => void publish()}
          >
            {t("Create or update link", "生成或更新链接")}
          </button>
          {current && (
            <>
              <div className={styles.actions}>
                <button onClick={() => void copy(view(current))}>
                  <Copy size={13} />
                  {t("Copy share page", "复制分享页面")}
                </button>
                <button onClick={() => void copy(feed(current))}>
                  {t("Copy subscription URL", "复制订阅地址")}
                </button>
                <a
                  className={styles.action}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed(current))}`}
                >
                  Google Calendar ↗
                </a>
                <a
                  className={styles.action}
                  target="_blank"
                  rel="noreferrer"
                  href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed(current))}&name=Calendar`}
                >
                  Outlook ↗
                </a>
                <a
                  className={styles.action}
                  href={feed(current).replace(/^https?:/, "webcal:")}
                >
                  {t("Open system calendar", "打开系统日历")}
                </a>
              </div>
              <p className={styles.status}>
                {t(
                  "If your calendar app does not prefill the address, copy the subscription URL and use its ‘From URL’ or ‘Subscribe from web’ option.",
                  "若日历应用没有自动填入地址，请复制订阅地址，在应用的“通过网址添加”或“从 Web 订阅”中粘贴。",
                )}
              </p>
            </>
          )}
          <p className={styles.status} role="status">
            {message}
          </p>
          <h3>{t("Shared calendars", "已分享日历")}</h3>
          {links.map((link) => (
            <div key={link.id}>
              <strong>
                {link.calendarIds
                  .map((id) => calendars.find((c) => c.id === id)?.title)
                  .filter(Boolean)
                  .join(" + ")}
              </strong>
              <p>{link.expiresAt ?? t("Until revoked", "长期有效")}</p>
              <div className={styles.actions}>
                <button onClick={() => setCurrent(link)}>
                  {t("Show links", "查看链接")}
                </button>
                <button
                  onClick={async () => {
                    const r = await fetch("/api/calendar/links", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: link.id }),
                    });
                    if (r.ok) {
                      setLinks(links.filter((l) => l.id !== link.id));
                      if (current?.id === link.id) setCurrent(null);
                    }
                  }}
                >
                  {t("Revoke", "撤销")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </WorkspaceDialog>
    </>
  );
}
