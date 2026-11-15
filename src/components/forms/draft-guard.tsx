"use client";
import {
  draftRegistry,
  installDraftNavigationGuard,
} from "@/lib/forms/navigation-guard";
import { useEffect, useId, useRef, type ReactNode } from "react";
const drafts = draftRegistry;
const hasDrafts = () => drafts.has();
export function confirmDiscard() {
  return (
    !hasDrafts() ||
    window.confirm(
      document.documentElement.lang.startsWith("zh")
        ? "有尚未保存的修改。确定离开并放弃这些修改？"
        : "You have unsaved changes. Leave and discard them?",
    )
  );
}
export function useDraftGuard(dirty: boolean) {
  const id = useId();
  useEffect(() => {
    if (dirty) drafts.set(id, () => true);
    else drafts.delete(id);
    return () => {
      drafts.delete(id);
    };
  }, [dirty, id]);
}
export function DraftGuard() {
  useEffect(
    () =>
      installDraftNavigationGuard(window, document, hasDrafts, confirmDiscard),
    [],
  );
  return null;
}
export function DraftForm({
  children,
  guard = true,
  ...props
}: React.ComponentProps<"form"> & { children: ReactNode; guard?: boolean }) {
  const form = useRef<HTMLFormElement>(null);
  const initial = useRef<string | null>(null);
  const id = useId();
  useEffect(
    () => () => {
      drafts.delete(id);
    },
    [id],
  );
  const track = () => {
    if (!guard || !form.current) return;
    if (initial.current === null)
      initial.current = formFingerprint(form.current);
    drafts.set(
      id,
      () => !!form.current && formFingerprint(form.current) !== initial.current,
    );
  };
  return (
    <form
      {...props}
      ref={form}
      onFocusCapture={track}
      onInputCapture={track}
      onReset={() => {
        initial.current = null;
        drafts.delete(id);
      }}
    >
      {children}
    </form>
  );
}
export function formFingerprint(root: HTMLElement) {
  return JSON.stringify(
    Array.from(
      root.querySelectorAll("input, textarea, select, [role=combobox]"),
    )
      .filter(
        (el) =>
          !el.closest("[data-draft-ignore]") &&
          !(el as HTMLInputElement).readOnly &&
          !["search", "hidden"].includes((el as HTMLInputElement).type),
      )
      .map((el) => {
        if (el.getAttribute("role") === "combobox")
          return ["choice", el.textContent];
        const field = el as HTMLInputElement;
        return [
          field.name,
          field.type,
          field.type === "checkbox" || field.type === "radio"
            ? field.checked
            : field.value,
        ];
      }),
  );
}
