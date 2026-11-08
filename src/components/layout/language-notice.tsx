"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CircleCheck, Languages, RotateCcw, X } from "lucide-react";
import { useLocaleNotice } from "@/hooks/use-preferences";
import styles from "./language-controls.module.css";

export function LanguageNotice() {
  const { notice, dismiss, switchTo } = useLocaleNotice();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!notice || hovered || focused) return;
    const timeout = window.setTimeout(
      dismiss,
      notice.kind === "suggestion" ? 10000 : 8000,
    );
    return () => window.clearTimeout(timeout);
  }, [notice, dismiss, hovered, focused]);
  if (!notice) return null;
  const changed = notice.kind === "changed";
  const target = changed
    ? notice.previousLocale
    : notice.locale === "zh"
      ? "en"
      : "zh";
  const displayLocale = changed ? notice.locale : target;
  const english = displayLocale === "en";
  const actionLabel = changed
    ? target === "en"
      ? "Back to English"
      : "切回中文"
    : target === "en"
      ? "Switch to English"
      : "切换到中文";
  function dismissNotice() {
    setHovered(false);
    setFocused(false);
    dismiss();
  }
  return createPortal(
    <div
      className={styles.notice}
      data-language-notice=""
      data-kind={notice.kind}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      lang={english ? "en" : "zh-CN"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <p className={styles.message}>
        {changed ? <CircleCheck size={17} aria-hidden="true" /> : null}
        <span>
          {changed
            ? english
              ? "Switched to English"
              : "已切换为中文"
            : english
              ? "Prefer English?"
              : "更习惯中文？"}
        </span>
      </p>
      <button
        type="button"
        className={styles.noticeAction}
        onClick={() => switchTo(target)}
        aria-label={actionLabel}
        title={actionLabel}
        lang={target === "en" ? "en" : "zh-CN"}
        data-analytics-action="locale_switch"
      >
        {changed ? (
          <>
            <RotateCcw size={14} aria-hidden="true" />
            {actionLabel}
          </>
        ) : (
          <Languages size={17} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismissNotice}
        aria-label={english ? "Dismiss language notification" : "关闭语言提示"}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
