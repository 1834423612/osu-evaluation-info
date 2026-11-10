"use client";

import { useSyncExternalStore } from "react";
import {
  ArrowUpRight,
  GitCommitHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { Popover } from "radix-ui";
import { brand } from "@/lib/brand";
import { text, type Locale } from "@/lib/i18n";
import { formatReleaseTime } from "@/lib/layout/release-time";
import styles from "./build-stamp.module.css";

function subscribeTimeZone(update: () => void) {
  window.addEventListener("focus", update);
  document.addEventListener("visibilitychange", update);
  return () => {
    window.removeEventListener("focus", update);
    document.removeEventListener("visibilitychange", update);
  };
}
const browserTimeZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export function BuildStamp({ locale = "en" }: { locale?: Locale }) {
  const timeZone = useSyncExternalStore(
    subscribeTimeZone,
    browserTimeZone,
    () => "UTC",
  );
  const hash = process.env.NEXT_PUBLIC_BUILD_HASH;
  if (!hash) return null;
  const message = (process.env.NEXT_PUBLIC_BUILD_MESSAGE ?? "").split(
    /\r?\n/,
  )[0];
  const updatedAt = process.env.NEXT_PUBLIC_BUILD_UPDATED_AT ?? "";
  const updated = formatReleaseTime(updatedAt, locale, timeZone);
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.stamp}
          title={text(locale, "View update details", "查看更新详情")}
          aria-label={text(
            locale,
            `Update details · ${hash}`,
            `查看更新详情 · ${hash}`,
          )}
          data-build-stamp
        >
          <GitCommitHorizontal
            size={14}
            className={styles.icon}
            aria-hidden="true"
          />
          {updated ? (
            <>
              <span>{text(locale, "Updated", "更新于")}</span>
              <time dateTime={updatedAt}>{updated.label}</time>
            </>
          ) : null}
          <code>{hash}</code>
          <ChevronDown size={11} className={styles.arrow} aria-hidden="true" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.details}
          sideOffset={8}
          align="end"
          collisionPadding={16}
          aria-label={text(locale, "Update details", "更新详情")}
          data-update-details
          data-floating-obstacle
        >
          <header>
            <span>
              <GitCommitHorizontal size={16} aria-hidden="true" />
              {text(locale, "Latest update", "最近更新")}
            </span>
            <Popover.Close
              className={styles.close}
              aria-label={text(locale, "Close update details", "关闭更新详情")}
            >
              <X size={15} />
            </Popover.Close>
          </header>
          {updated ? (
            <time dateTime={updatedAt} title={updated.full}>
              {updated.full}
            </time>
          ) : null}
          <p>{message || text(locale, "Latest version", "最新版本")}</p>
          <div className={styles.detailLinks}>
            <a
              href={`${brand.links.repository}/commit/${hash}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <code>{hash}</code>
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
            <a
              href={brand.links.mainBranch}
              target="_blank"
              rel="noopener noreferrer"
            >
              {text(locale, "View source", "查看源码")}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </div>
          <Popover.Arrow className={styles.popoverArrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
