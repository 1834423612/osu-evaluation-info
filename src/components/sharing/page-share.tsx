"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Popover } from "radix-ui";
import { Share2, Copy, Check, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogCourse } from "@/lib/catalog/types";
import { courseSnapshotSchema } from "@/lib/saved/exchange";
import { pageShareHref, courseShareHref } from "@/lib/saved/page-link";
import { copyLink, ensureActorSession } from "@/lib/saved/share-links";
import { text, type Locale } from "@/lib/i18n";
import styles from "./page-share.module.css";
import { notify } from "@/lib/notify";
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
    [url, setUrl] = useState(""),
    [open, setOpen] = useState(false),
    [copied, setCopied] = useState(false),
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
    setCopied(false);
    try {
      const href = course
        ? courseShareHref(course, location.search)
        : pageShareHref(location.pathname + location.search + location.hash);
      let link = location.origin + href;
      setUrl(link);
      try {
        await ensureActorSession();
        const r = await fetch("/api/page-links", {
          method: "POST",
          headers: { "content-type": "application/json" },
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
        if (r.ok) {
          const data = await r.json();
          if (/^[a-f0-9-]{36}$/.test(data.id))
            link = location.origin + "/l/" + data.id;
        }
      } catch {}
      setUrl(link);
      const copied = await copyLink(link);
      setCopied(copied);
      if (copied) notify(text(locale, "Link copied", "链接已复制"), "success");
      else
        setNotice(
          text(locale, "Select the link to copy it.", "请选择链接后手动复制。"),
        );
    } catch {
      setNotice(
        text(locale, "A link could not be created.", "暂时无法生成链接。"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void publish();
      }}
    >
      <Popover.Trigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon-sm" : "sm"}
          aria-label={text(
            locale,
            course ? "Share course" : "Share this page",
            course ? "分享课程" : "分享此页",
          )}
          data-analytics-action="share_link_create"
        >
          <Share2 size={14} />
          {compact ? null : text(locale, "Share", "分享")}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.popover}
          data-page-share
          sideOffset={8}
          collisionPadding={12}
          onClick={(e) => e.stopPropagation()}
        >
          <strong>{text(locale, "Share link", "分享链接")}</strong>
          <p>{title ?? text(locale, "Current page", "当前页面")}</p>
          <div className={styles.copyRow}>
            <input
              readOnly
              value={url}
              aria-label={text(locale, "Share link", "分享链接")}
              onFocus={(e) => e.target.select()}
            />
            <Button
              size="icon-sm"
              variant="outline"
              disabled={!url || busy}
              aria-label={text(locale, "Copy link", "复制链接")}
              onClick={async () => {
                const ok = await copyLink(url);
                setCopied(ok);
                if (ok) {
                  window.dispatchEvent(
                    new CustomEvent("course-atlas:toast", {
                      detail: {
                        message: text(
                          locale,
                          "Link copied. Share it with a friend.",
                          "链接已复制，发给好友一起看看。",
                        ),
                      },
                    }),
                  );
                } else
                  setNotice(
                    text(
                      locale,
                      "Select the link to copy it.",
                      "请选择链接后手动复制。",
                    ),
                  );
              }}
            >
              {busy ? (
                <LoaderCircle size={15} className="spin" />
              ) : copied ? (
                <Check size={15} />
              ) : (
                <Copy size={15} />
              )}
            </Button>
          </div>
          {notice ? <small role="status">{notice}</small> : null}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
