"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Bookmark, RotateCcw, X, CircleAlert } from "lucide-react";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";

type ToastDetail = {
  added?: boolean;
  label?: string;
  undo?: () => void;
  error?: "capacity" | "storage" | "failed";
  limit?: number;
};

export function ActionToast() {
  const { locale } = usePreferences();
  const [toast, setToast] = useState<ToastDetail | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const onToast = (event: Event) => {
      setLeaving(false);
      setToast((event as CustomEvent<ToastDetail>).detail);
    };
    window.addEventListener("course-atlas:toast", onToast);
    window.addEventListener("course-atlas:save-error", onToast);
    return () => {
      window.removeEventListener("course-atlas:toast", onToast);
      window.removeEventListener("course-atlas:save-error", onToast);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setLeaving(true), 4500);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(() => setToast(null), 170);
    return () => window.clearTimeout(timeout);
  }, [leaving]);

  if (!toast) return null;
  return createPortal(
    <div
      className="action-toast"
      data-state={toast.error ? "error" : toast.added ? "added" : "removed"}
      data-phase={leaving ? "closing" : "open"}
      role="status"
      aria-live="polite"
      style={{ pointerEvents: "auto" }}
    >
      {toast.error ? (
        <CircleAlert size={17} aria-hidden="true" />
      ) : toast.added ? (
        <BrandMascot expression="belly-laugh" size={32} eager />
      ) : (
        <Bookmark size={17} aria-hidden="true" />
      )}
      <span>
        {toast.error
          ? toast.error === "capacity"
            ? text(
                locale,
                `Collection is full (${toast.limit}).`,
                `收藏已满（${toast.limit}）。`,
              )
            : toast.error === "storage"
              ? text(locale, "Browser storage is full.", "浏览器存储空间已满。")
              : text(locale, "Could not save this item.", "未能保存此项目。")
          : toast.added
            ? text(locale, "Saved", "已收藏")
            : text(locale, "Removed", "已取消收藏")}{" "}
        <strong>{toast.label}</strong>
      </span>
      {toast.undo ? (
        <button
          type="button"
          onClick={() => {
            setLeaving(true);
            toast.undo?.();
          }}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {text(locale, "Undo", "撤回")}
        </button>
      ) : null}
      <button
        type="button"
        className="action-toast-close"
        aria-label={text(locale, "Dismiss", "关闭提示")}
        onClick={() => setLeaving(true)}
      >
        <X size={15} aria-hidden="true" />
      </button>
    </div>,
    document.body,
  );
}
