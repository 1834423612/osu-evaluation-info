"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Languages, X } from "lucide-react";
import { useLocaleNotice } from "@/hooks/use-preferences";
import styles from "./language-controls.module.css";

export function LanguageNotice() {
  const { locale, dismiss, switchTo } = useLocaleNotice();
  useEffect(() => {
    if (!locale) return;
    const timeout = window.setTimeout(dismiss, 14000);
    return () => window.clearTimeout(timeout);
  }, [locale, dismiss]);
  if (!locale) return null;
  const english = locale === "zh";
  return createPortal(
    <div
      className={styles.notice}
      data-language-notice=""
      role="status"
      aria-live="polite"
      lang={english ? "en" : "zh-CN"}
    >
      <button
        type="button"
        className={styles.message}
        onClick={() => switchTo(english ? "en" : "zh")}
      >
        <Languages size={19} aria-hidden="true" />
        <span>
          {english
            ? "Prefer English? Tap here or use the language button to switch."
            : "更习惯中文？点击此提示或顶部语言按钮即可切换。"}
        </span>
      </button>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismiss}
        aria-label={english ? "Dismiss language hint" : "关闭语言提示"}
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
