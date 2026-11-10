"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowUpCircle, RefreshCw, X } from "lucide-react";
import { text, type Locale } from "@/lib/i18n";
import { buildInfoStore } from "@/lib/layout/build-info-client";
import {
  availableUpdate,
  updateNoticeStore,
} from "@/lib/layout/update-notice-client";
import styles from "./update-notice.module.css";

export function UpdateNotice({ locale }: { locale: Locale }) {
  const build = useSyncExternalStore(
    buildInfoStore.subscribe,
    buildInfoStore.getSnapshot,
    buildInfoStore.getServerSnapshot,
  );
  const state = useSyncExternalStore(
    updateNoticeStore.subscribe,
    updateNoticeStore.getSnapshot,
    updateNoticeStore.getServerSnapshot,
  );
  const release = availableUpdate(build, buildInfoStore.getServerSnapshot());
  const preview = state.preview !== null;
  if (!preview && (!release || release.sha === state.dismissed)) return null;
  return createPortal(
    <aside
      className={styles.notice}
      aria-label={text(locale, "Website update", "网站更新")}
      data-update-notice
      data-update-preview={preview || undefined}
      data-floating-obstacle
    >
      <span className={styles.icon}>
        <ArrowUpCircle size={20} aria-hidden="true" />
      </span>
      <div
        className={styles.copy}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <strong>
          {text(locale, "A new version is ready", "网站有新版本啦")}
          {preview ? <small>{text(locale, "Preview", "测试")}</small> : null}
        </strong>
        <p title={preview ? undefined : release?.message}>
          {preview
            ? text(
                locale,
                "Test preview · refresh reloads this page.",
                "测试预览 · 点击刷新会重载当前页面。",
              )
            : release?.message ||
              text(
                locale,
                "Refresh when you’re ready to get the latest improvements.",
                "方便时刷新，即可使用最新改进。",
              )}
        </p>
      </div>
      <button
        type="button"
        className={styles.refresh}
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={14} aria-hidden="true" />
        {text(locale, "Refresh", "刷新")}
      </button>
      <button
        type="button"
        className={styles.close}
        aria-label={text(locale, "Dismiss update notice", "关闭更新提示")}
        onClick={() =>
          preview
            ? updateNoticeStore.dismissPreview()
            : release && updateNoticeStore.dismiss(release.sha)
        }
      >
        <X size={17} aria-hidden="true" />
      </button>
    </aside>,
    document.body,
  );
}
