"use client";
import { useActionNotice } from "@/hooks/use-action-notice";
import { DraftForm } from "@/components/forms/draft-guard";
import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { OtpInput } from "@/components/account/otp-input";
import flow from "@/components/personal/exchange.module.css";
import {
  Share2,
  Copy,
  FolderOpen,
  Clock3,
  UserRound,
  ChevronRight,
  Library,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { EmptyResult } from "@/components/brand/empty-result";
import { MeetingStrip } from "@/components/catalog/meeting-strip";
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
import gallery from "./shared-gallery.module.css";
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
    [expiry, setExpiry] = useState<string | null>(""),
    [loading, setLoading] = useState(!!id),
    [error, setError] = useState(false),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useActionNotice(),
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
      <main className={gallery.page} data-telemetry-private>
        <nav
          className={gallery.breadcrumb}
          aria-label={text(locale, "Breadcrumb", "当前位置")}
        >
          <a href="/saved">{text(locale, "Saved items", "我的收藏")}</a>
          <ChevronRight size={12} />
          <span>{text(locale, "Shared collection", "分享清单")}</span>
        </nav>
        <div className={snapshot ? gallery.hero : styles.heading}>
          {snapshot ? (
            <div className={gallery.heroIdentity}>
              <span className={gallery.heroIcon}>
                <FolderOpen size={28} />
              </span>
              <div>
                <span className={gallery.eyebrow}>
                  {text(locale, "SHARED COLLECTION", "分享的收藏清单")}
                </span>
                <h1>{snapshot.title}</h1>
                <div className={gallery.meta}>
                  <span>
                    <Library size={12} />
                    {snapshot.items.length} {text(locale, "items", "项内容")} ·{" "}
                    {snapshot.collections?.length ?? 0}{" "}
                    {text(locale, "folders", "个分类")}
                  </span>
                  {snapshot.author?.nickname ? (
                    <span>
                      <UserRound size={12} />
                      {snapshot.author.nickname}
                    </span>
                  ) : null}
                  <span>
                    <Clock3 size={12} />
                    {text(locale, "Expires ", "有效期至 ")}
                    {sharingDate(expiry, locale)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <h1>{text(locale, "Shared collection", "分享的收藏")}</h1>
              <p>
                {id
                  ? text(locale, "Choose what to save", "选择需要转存的项目")
                  : text(locale, "Open a public share code", "打开公开分享码")}
              </p>
            </div>
          )}
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
          <section className={flow.codePanel}>
            <div className={flow.codeIcon}>
              <Share2 size={24} />
            </div>
            <h2>
              {text(
                locale,
                "A good class is worth sharing",
                "好课程，一起收藏",
              )}
            </h2>
            <p>
              {text(
                locale,
                "Enter a share code to preview the collection before saving.",
                "输入分享码，先预览清单，再选择喜欢的内容。",
              )}
            </p>
            <DraftForm
              className={styles.fields}
              onSubmit={(e) => {
                e.preventDefault();
                void resolve();
              }}
            >
              <OtpInput
                value={code}
                onChange={setCode}
                label={text(locale, "Share code", "分享码")}
                disabled={busy}
              />
              <Button disabled={busy || code.length !== 6}>
                <Share2 size={14} />
                {text(locale, "Open collection", "打开清单")}
              </Button>
            </DraftForm>
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
            <CollectionImport
              key={id}
              snapshot={snapshot}
              locale={locale}
              renderItem={(item) =>
                item.kind === "course" ? (
                  <SharedCourseCard
                    course={item.payload}
                    locale={locale}
                    saved={preferences.saved.some(
                      (course) => course.id === item.payload.id,
                    )}
                    onSave={preferences.toggleSaved}
                    refreshPreview
                    enrollmentWatch={preferences.enrollmentWatch}
                    enrollmentWatchInterval={
                      preferences.enrollmentWatchInterval
                    }
                    onEnrollmentWatchChange={preferences.setEnrollmentWatch}
                    onEnrollmentWatchIntervalChange={
                      preferences.setEnrollmentWatchInterval
                    }
                  />
                ) : item.kind === "section" ? (
                  <div>
                    <p>
                      {item.payload.section.component} ·{" "}
                      {item.payload.section.section} ·{" "}
                      {item.payload.section.session}
                    </p>
                    {item.payload.section.meetings.map((meeting, index) => (
                      <MeetingStrip
                        key={index}
                        meeting={meeting}
                        instructionMode={item.payload.section.instructionMode}
                        locale={locale}
                      />
                    ))}
                    <p>
                      {item.payload.section.instructors
                        .map((teacher) => teacher.name)
                        .join(" · ")}
                    </p>
                  </div>
                ) : null
              }
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
