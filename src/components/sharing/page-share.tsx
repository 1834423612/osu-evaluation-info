"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Share2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import type { CatalogCourse } from "@/lib/catalog/types";
import { courseSnapshotSchema } from "@/lib/saved/exchange";
import { pageShareHref, courseShareHref } from "@/lib/saved/page-link";
import { copyLink, ensureActorSession } from "@/lib/saved/share-links";
import { text, type Locale } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
export function PageShare({
  locale,
  course,
  compact = false,
}: {
  locale: Locale;
  course?: CatalogCourse;
  compact?: boolean;
}) {
  const pathname = usePathname();
  const [busy, setBusy] = useState(false),
    [copied, setCopied] = useState(false),
    [url, setUrl] = useState(""),
    [open, setOpen] = useState(false),
    [notice, setNotice] = useState("");
  if (!course) {
    try {
      pageShareHref(pathname);
    } catch {
      return null;
    }
  }
  const title = course
    ? course.subject + " " + course.catalogNumber + " · " + course.title
    : undefined;
  async function publish() {
    setBusy(true);
    setNotice("");
    try {
      const href = course
        ? courseShareHref(course, location.search)
        : pageShareHref(location.pathname + location.search + location.hash);
      let link = location.origin + href;
      try {
        await ensureActorSession();
        const response = await fetch("/api/page-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            href,
            title: (title ?? document.title).slice(0, 200),
            course: course
              ? courseSnapshotSchema.parse({
                  ...course,
                  description: course.description.slice(0, 4000),
                  sections: [],
                  sectionsPartial: true,
                })
              : undefined,
          }),
          signal: AbortSignal.timeout(4000),
        });
        if (response.ok) {
          const data = await response.json();
          if (/^[a-f0-9-]{36}$/.test(data.id))
            link = location.origin + "/l/" + data.id;
        }
      } catch {
        /* A canonical link remains usable if attribution is unavailable. */
      }
      setUrl(link);
      if (navigator.share) {
        try {
          await navigator.share({ title: title ?? document.title, url: link });
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          setOpen(true);
        }
      } else {
        try {
          await copyLink(link);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        } catch {
          setOpen(true);
        }
      }
    } catch {
      setNotice(
        text(
          locale,
          "This page cannot be shared as a public link.",
          "此页面无法生成公开链接。",
        ),
      );
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size={compact ? "icon-sm" : "sm"}
        disabled={busy}
        onClick={() => void publish()}
        aria-label={text(
          locale,
          course ? "Share course" : "Share this page",
          course ? "分享课程" : "分享此页",
        )}
        data-analytics-action="share_link_create"
      >
        <Share2 size={14} />
        {!compact
          ? copied
            ? text(locale, "Copied", "已复制")
            : text(locale, "Share", "分享")
          : null}
      </Button>
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        title={text(locale, "Share link", "分享链接")}
        description={title ?? text(locale, "Current page", "当前页面")}
        closeLabel={text(locale, "Close", "关闭")}
      >
        <input
          readOnly
          className={styles.input}
          value={url}
          aria-label={text(locale, "Link", "链接")}
        />
        <div className={styles.actions}>
          {url &&
          typeof navigator !== "undefined" &&
          typeof navigator.share === "function" ? (
            <Button
              variant="outline"
              onClick={() =>
                void navigator
                  .share({ title: title ?? document.title, url })
                  .then(() => setOpen(false))
                  .catch((error) => {
                    if (!(
                      error instanceof Error && error.name === "AbortError"
                    ))
                      setNotice(
                        text(
                          locale,
                          "Use Copy link on this device.",
                          "请在此设备使用复制链接。",
                        ),
                      );
                  })
              }
            >
              <Share2 size={14} />
              {text(locale, "Share via device", "通过设备分享")}
            </Button>
          ) : null}
          {url ? (
            <Button
              variant="outline"
              onClick={() =>
                void copyLink(url)
                  .then(() =>
                    setNotice(text(locale, "Link copied", "链接已复制")),
                  )
                  .catch(() =>
                    setNotice(
                      text(
                        locale,
                        "Select the link and copy it.",
                        "请选择链接后复制。",
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
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
      </WorkspaceDialog>
    </>
  );
}
