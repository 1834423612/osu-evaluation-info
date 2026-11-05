"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, BookmarkCheck, RotateCcw, X } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";

type ToastDetail = {
  added: boolean;
  label: string;
  undo: () => void;
};

export function ActionToast() {
  const { locale } = usePreferences();
  const [toast, setToast] = useState<ToastDetail | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      setToast((event as CustomEvent<ToastDetail>).detail);
    };
    window.addEventListener("course-atlas:toast", onToast);
    return () => window.removeEventListener("course-atlas:toast", onToast);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  if (!toast) return null;
  return createPortal(
    <div
      className="action-toast"
      data-state={toast.added ? "added" : "removed"}
      role="status"
      aria-live="polite"
      style={{ pointerEvents: "auto" }}
    >
      {toast.added ? (
        <BookmarkCheck size={17} aria-hidden="true" />
      ) : (
        <Bookmark size={17} aria-hidden="true" />
      )}
      <span>
        {toast.added
          ? text(locale, "Saved", "已收藏")
          : text(locale, "Removed", "已取消收藏")}{" "}
        <strong>{toast.label}</strong>
      </span>
      <button
        type="button"
        onClick={() => {
          toast.undo();
          setToast(null);
        }}
      >
        <RotateCcw size={14} aria-hidden="true" />
        {text(locale, "Undo", "撤回")}
      </button>
      <button
        type="button"
        className="action-toast-close"
        aria-label={text(locale, "Dismiss", "关闭提示")}
        onClick={() => setToast(null)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
