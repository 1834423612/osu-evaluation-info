"use client";
import { useEffect, useState } from "react";
import {
  Share2,
  Copy,
  Check,
  CalendarDays,
  Link2,
  Globe2,
  Trash2,
  LoaderCircle,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { Button } from "@/components/ui/button";
import {
  planningScope,
  planningState,
  syncPlanning,
} from "@/lib/planning/client-sync";
import { readSyncState } from "@/lib/sync/client";
import { syncFeatures } from "@/lib/sync/features";
import { copyLink } from "@/lib/saved/share-links";
import { notify } from "@/lib/notify";
import type { UserCalendar } from "@/lib/calendar/model";
import type { Locale } from "@/lib/i18n";
import styles from "./calendar-share.module.css";
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
    [ids, setIds] = useState<string[]>([]),
    [kinds, setKinds] = useState([...categories]),
    [nickname, setNickname] = useState(""),
    [expiry, setExpiry] = useState("604800");
  const [links, setLinks] = useState<SavedLink[]>([]),
    [current, setCurrent] = useState<SavedLink | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [failed, setFailed] = useState(false),
    [revision, setRevision] = useState(0),
    [copied, setCopied] = useState(false),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    fetch("/api/calendar/links", { signal: c.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) setLinks(d.links);
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, revision]);
  const feed = (link: SavedLink) =>
    `${location.origin}/api/calendar/feed?` +
    new URLSearchParams({ id: link.id, key: link.token });
  const view = (link: SavedLink) =>
    `${location.origin}/calendar/shared?id=${link.id}#k=${link.token}`;
  async function copy(value: string) {
    const ok = await copyLink(value);
    setCopied(ok);
    notify(
      ok
        ? t("Link copied", "链接已复制")
        : t("Select the link and copy it manually.", "请选择链接后手动复制。"),
      ok ? "success" : "info",
    );
  }
  async function publish() {
    if (busy) return;
    setBusy(true);
    try {
      const account = planningScope();
      if (!account) throw Error("account");
      const state = await readSyncState(account);
      if (!state.enabled || !syncFeatures(state).calendars)
        throw Error("sync_paused");
      if (!(await persist())) throw Error("storage");
      await syncPlanning(account);
      if (planningState(account).conflict) throw Error("conflict");
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
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      const link = { ...data, calendarIds: [...ids] };
      setCurrent(link);
      setLinks((rows) => [link, ...rows.filter((r) => r.id !== link.id)]);
      setDirty(false);
      await copy(view(link));
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      notify(
        code === "institution_required"
          ? t(
              "Verify your school email in Account before sharing.",
              "请先在账号页面验证学校邮箱，再创建分享。",
            )
          : code === "sync_paused"
            ? t(
                "Enable calendar sync in Account before sharing.",
                "请先在账号设置中开启日历同步。",
              )
            : code === "conflict"
              ? t(
                  "Resolve the calendar sync conflict first.",
                  "请先处理日历同步冲突。",
                )
              : t(
                  "Could not publish. Check sign-in and calendar sync, then retry.",
                  "发布未完成，请检查登录与日历同步后重试。",
                ),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(link: SavedLink) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/calendar/links", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: link.id }),
      });
      if (!r.ok) throw Error();
      setLinks((rows) => rows.filter((l) => l.id !== link.id));
      if (current?.id === link.id) setCurrent(null);
      notify(t("Share revoked", "分享已撤销"), "success");
    } catch {
      notify(t("Could not revoke. Try again.", "撤销失败，请重试。"), "error");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setLoading(true);
          setFailed(false);
          setIds(calendars.some((c) => c.id === selected) ? [selected] : []);
          setCurrent(null);
          setCopied(false);
          setDirty(false);
          setOpen(true);
        }}
        data-analytics-action="calendar_share_open"
      >
        <Share2 size={14} />
        {t("Share & subscribe", "分享与订阅")}
      </Button>
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        title={t("Share calendars", "分享日历")}
        description={t(
          "Choose calendars and the content recipients can see.",
          "选择要分享的日历与允许查看的内容。 ",
        )}
        closeLabel={t("Close", "关闭")}
        dirty={dirty}
        detectFormChanges={false}
      >
        <div className={styles.root} data-telemetry-private>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <CalendarDays size={16} />
              <h3>{t("Calendars", "分享哪些日历")}</h3>
              <small>
                {ids.length} {t("selected", "个已选")}
              </small>
            </div>
            <div className={styles.choices}>
              {calendars.map((c) => (
                <button
                  key={c.id}
                  className={styles.calendar}
                  role="checkbox"
                  aria-checked={ids.includes(c.id)}
                  onClick={() => {
                    setIds((old) =>
                      old.includes(c.id)
                        ? old.filter((id) => id !== c.id)
                        : [...old, c.id],
                    );
                    setDirty(true);
                  }}
                >
                  <span className={styles.checkbox}>
                    {ids.includes(c.id) && <Check size={13} />}
                  </span>
                  <span>
                    <strong>{c.title}</strong>
                    <small>
                      {c.events.length} {t("events", "个日程")}
                    </small>
                  </span>
                </button>
              ))}
            </div>
            {!calendars.length && (
              <p className={styles.hint}>
                {t(
                  "Create a personal calendar first.",
                  "请先创建一个个人日历。",
                )}
              </p>
            )}
          </section>
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <ShieldCheck size={16} />
              <h3>{t("Visible content", "允许查看的内容")}</h3>
            </div>
            <div className={styles.chips}>
              {categories.map((kind, index) => (
                <button
                  key={kind}
                  role="checkbox"
                  aria-checked={kinds.includes(kind)}
                  onClick={() => {
                    setKinds((old) =>
                      old.includes(kind)
                        ? old.filter((k) => k !== kind)
                        : [...old, kind],
                    );
                    setDirty(true);
                  }}
                >
                  {kinds.includes(kind) ? (
                    <Check size={13} />
                  ) : (
                    <span className={styles.unchecked} />
                  )}{" "}
                  {t(kind, labels[index])}
                </button>
              ))}
            </div>
            <p className={styles.hint}>
              {t(
                "Private subscription addresses are excluded.",
                "私密订阅来源地址不会出现在分享内容中。",
              )}
            </p>
          </section>
          <div className={styles.fields}>
            <label>
              {t("Public nickname (optional)", "公开昵称（可选）")}
              <input
                maxLength={80}
                value={nickname}
                placeholder={t("Anonymous", "匿名")}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setDirty(true);
                }}
              />
            </label>
            <label>
              {t("Link expiry", "链接有效期")}
              <ChoiceSelect
                value={expiry}
                onValueChange={(value) => {
                  setExpiry(value);
                  setDirty(true);
                }}
              >
                <option value="86400">{t("One day", "一天")}</option>
                <option value="604800">{t("One week", "一周")}</option>
                <option value="2592000">{t("30 days", "30 天")}</option>
                <option value="0">
                  {t("Until revoked", "长期有效，直到撤销")}
                </option>
              </ChoiceSelect>
            </label>
          </div>
          <Button
            disabled={busy || !ids.length || ids.length > 30 || !kinds.length}
            onClick={() => void publish()}
            data-analytics-action="calendar_share_publish"
          >
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Link2 size={15} />
            )}{" "}
            {busy
              ? t("Publishing…", "正在生成…")
              : t("Create or update link", "生成或更新分享链接")}
          </Button>
          {current && (
            <section className={styles.result}>
              <div className={styles.sectionTitle}>
                <Check size={16} />
                <h3>{t("Share link ready", "分享链接已生成")}</h3>
              </div>
              <div className={styles.copyRow}>
                <input
                  readOnly
                  value={view(current)}
                  aria-label={t("Calendar share link", "日历分享链接")}
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(view(current))}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}{" "}
                  {copied ? t("Copied", "已复制") : t("Copy", "复制")}
                </Button>
              </div>
              <p className={styles.hint}>
                {t(
                  "This subscription URL stays the same as the calendar changes.",
                  "日历更新时沿用同一个订阅地址。",
                )}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy(feed(current))}
                >
                  <Copy size={13} />
                  {t("Copy subscription URL", "复制订阅地址")}
                </Button>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feed(current))}`}
                >
                  Google Calendar <ExternalLink size={12} />
                </a>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed(current))}&name=Calendar`}
                >
                  Outlook <ExternalLink size={12} />
                </a>
                <a href={feed(current).replace(/^https?:/, "webcal:")}>
                  <Globe2 size={13} />
                  {t("System calendar", "系统日历")}
                </a>
              </div>
            </section>
          )}
          <section className={styles.section}>
            <div className={styles.sectionTitle}>
              <Share2 size={16} />
              <h3>{t("Existing shares", "已分享日历")}</h3>
              <small>{links.length}</small>
            </div>
            {loading ? (
              <p className={styles.hint}>{t("Loading…", "正在加载…")}</p>
            ) : failed ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setFailed(false);
                  setRevision((n) => n + 1);
                }}
              >
                {t("Could not load · Retry", "加载失败 · 重试")}
              </Button>
            ) : !links.length ? (
              <p className={styles.hint}>
                {t("No calendar links yet.", "还没有日历分享链接。")}
              </p>
            ) : (
              links.map((link) => (
                <div className={styles.shareRow} key={link.id}>
                  <div>
                    <strong>
                      {link.calendarIds
                        .map(
                          (id) =>
                            calendars.find((c) => c.id === id)?.title ??
                            t("Removed calendar", "已移除日历"),
                        )
                        .join(" + ")}
                    </strong>
                    <small>
                      {link.expiresAt
                        ? new Date(link.expiresAt).toLocaleDateString(
                            locale === "zh" ? "zh-CN" : "en-US",
                          )
                        : t("Until revoked", "长期有效")}
                    </small>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrent(link);
                      setCopied(false);
                    }}
                  >
                    {t("View links", "查看链接")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={busy}
                    aria-label={t("Revoke calendar share", "撤销日历分享")}
                    onClick={() => void revoke(link)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))
            )}
          </section>
        </div>
      </WorkspaceDialog>
    </>
  );
}
