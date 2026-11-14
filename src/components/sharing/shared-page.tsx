"use client";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Share2, Copy } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { Button } from "@/components/ui/button";
import { CollectionImport } from "./collection-import";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import {
  snapshotSchema,
  itemHref,
  courseForItem,
  type SavedSnapshot,
  type ExchangeItem,
} from "@/lib/saved/exchange";
import {
  linkCapability,
  shareLink,
  copyLink,
  sharingDate,
  ensureActorSession,
} from "@/lib/saved/share-links";
import styles from "@/components/ui/workspace.module.css";
const SharedCourseCard = dynamic(
  () => import("@/components/catalog/course-card").then((m) => m.CourseCard),
  { ssr: false },
);
export function SharedPage({ id }: { id?: string }) {
  const router = useRouter();
  const preferences = usePreferences(),
    { locale } = preferences;
  const [isPublic, setIsPublic] = useState(false);
  const [snapshot, setSnapshot] = useState<SavedSnapshot | null>(null),
    [expiry, setExpiry] = useState(""),
    [loading, setLoading] = useState(!!id),
    [error, setError] = useState(false),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [focused, setFocused] = useState<ExchangeItem | null>(null),
    [capability, setCapability] = useState<string | undefined>();
  const opened = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(),
      cap = linkCapability("share", id);
    fetch("/api/shares/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, capability: cap }),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) throw Error();
        const body = await r.json();
        if (controller.signal.aborted) return;
        setCapability(cap);
        setSnapshot(snapshotSchema.parse(body.snapshot));
        setExpiry(body.expiresAt);
        setIsPublic(body.visibility === "public");
        opened.current = ensureActorSession()
          .then(() =>
            fetch("/api/shares/" + id + "/events", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "open", capability: cap }),
              keepalive: true,
            }),
          )
          .catch(() => {});
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id]);
  async function resolve() {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/shares/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw Error();
      const body = await r.json();
      router.push(("/share/" + encodeURIComponent(body.id)) as Route);
    } catch {
      setNotice(
        text(locale, "Code expired or unavailable.", "分享码已过期或不可用。"),
      );
    } finally {
      setBusy(false);
    }
  }
  function openItem(item: ExchangeItem) {
    const href = itemHref(item);
    if (!href) return;
    const params = new URL(href, location.origin).searchParams;
    params.delete("q");
    setFocused(item);
    history.pushState(
      { courseDetail: courseForItem(item)?.id, courseDetailDepth: 1 },
      "",
      location.pathname + "?" + params,
    );
  }
  const course = focused ? courseForItem(focused) : null;
  return (
    <>
      <AppHeader active="saved" />
      <main className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <h1>{text(locale, "Shared collection", "分享的收藏")}</h1>
            <p>
              {id
                ? text(locale, "Choose what to save", "选择需要转存的项目")
                : text(locale, "Open a public share code", "打开公开分享码")}
            </p>
          </div>
          {id && snapshot && (capability || isPublic) ? (
            <Button
              variant="outline"
              onClick={() =>
                void copyLink(shareLink(location.origin, id, capability)).then(
                  (ok) =>
                    setNotice(
                      ok
                        ? text(locale, "Link copied", "链接已复制")
                        : text(
                            locale,
                            "Copy is unavailable in this browser.",
                            "当前浏览器无法复制。",
                          ),
                    ),
                )
              }
            >
              <Copy size={14} />
              {text(locale, "Copy link", "复制链接")}
            </Button>
          ) : null}
        </div>
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {!id ? (
          <section className={styles.panel}>
            <form
              className={styles.fields}
              onSubmit={(e) => {
                e.preventDefault();
                void resolve();
              }}
            >
              <label>
                {text(locale, "6-digit public code", "六位公开分享码")}
                <input
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </label>
              <Button disabled={busy || code.length !== 6}>
                <Share2 size={14} />
                {text(locale, "Open collection", "打开清单")}
              </Button>
            </form>
          </section>
        ) : loading ? (
          <p>{text(locale, "Loading shared items…", "正在读取分享…")}</p>
        ) : error ? (
          <EmptyResult>
            {text(
              locale,
              "This share expired, was revoked, or needs its original link.",
              "分享已过期、已撤销，或需要使用原始完整链接。",
            )}
          </EmptyResult>
        ) : snapshot ? (
          <>
            <p className={styles.muted}>
              {text(locale, "Expires", "到期")} · {sharingDate(expiry, locale)}
            </p>
            <CollectionImport
              snapshot={snapshot}
              locale={locale}
              onOpen={openItem}
              onImported={(keys) => {
                if (!keys.length) return;
                void (async () => {
                  await opened.current;
                  await fetch("/api/shares/" + id + "/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      action: "import",
                      keys,
                      capability,
                    }),
                  });
                })().catch(() => {});
              }}
            />
          </>
        ) : null}
        {course ? (
          <div className={styles.previewCard}>
            <SharedCourseCard
              key={course.id}
              course={course}
              locale={locale}
              saved={preferences.saved.some((x) => x.id === course.id)}
              onSave={preferences.toggleSaved}
              enrollmentWatch={preferences.enrollmentWatch}
              enrollmentWatchInterval={preferences.enrollmentWatchInterval}
              onEnrollmentWatchChange={preferences.setEnrollmentWatch}
              onEnrollmentWatchIntervalChange={
                preferences.setEnrollmentWatchInterval
              }
            />
          </div>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}
