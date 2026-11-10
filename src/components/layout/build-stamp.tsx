"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpRight, GitCommitHorizontal } from "lucide-react";
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
    <a
      className={styles.stamp}
      href={brand.links.mainBranch}
      target="_blank"
      rel="noreferrer noopener"
      title={`${updated?.full ?? updatedAt} · ${hash} · ${message}`}
      aria-label={text(
        locale,
        `Latest update ${hash}. View source on GitHub.`,
        `最近更新 ${hash}，前往 GitHub 查看源代码。`,
      )}
      data-build-stamp
    >
      <GitCommitHorizontal
        size={14}
        className={styles.icon}
        aria-hidden="true"
      />
      <span className={styles.copy}>
        <span className={styles.meta}>
          {updated ? (
            <>
              <span>{text(locale, "Updated", "更新于")}</span>
              <time dateTime={updatedAt}>{updated.label}</time>
              <small>{updated.zone}</small>
            </>
          ) : null}
          <code>{hash}</code>
        </span>
        <span className={styles.subject}>
          {message || text(locale, "Latest version", "最新版本")}
        </span>
      </span>
      <ArrowUpRight size={12} className={styles.arrow} aria-hidden="true" />
    </a>
  );
}
