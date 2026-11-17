"use client";
import { Dialog } from "radix-ui";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import {
  useSyncExternalStore,
  useCallback,
  useRef,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useDraftGuard, formFingerprint } from "@/components/forms/draft-guard";
import { Button } from "./button";
import { DrawerDismissHandle } from "./drawer-dismiss-handle";
import styles from "./workspace.module.css";
const subscribe = (change: () => void) => {
  const media = window.matchMedia("(max-width: 600px)");
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
};
const snapshot = () => window.matchMedia("(max-width: 600px)").matches;
export function WorkspaceDialog({
  open,
  onOpenChange,
  title,
  description,
  closeLabel,
  children,
  wide = false,
  dirty = false,
  guard = true,
  closeOnly = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  closeLabel: string;
  children: ReactNode;
  wide?: boolean;
  dirty?: boolean;
  guard?: boolean;
  closeOnly?: boolean;
}) {
  const mobile = useSyncExternalStore(subscribe, snapshot, () => false);
  const body = useRef<HTMLDivElement>(null);
  const baseline = useRef<string | null>(null);
  const observer = useRef<MutationObserver | null>(null);
  const [edited, setEdited] = useState(false);
  const [previousOpen, setPreviousOpen] = useState(open);
  if (previousOpen !== open) {
    setPreviousOpen(open);
    if (!open) setEdited(false);
  }
  useDraftGuard(guard && open && (dirty || edited));
  useEffect(() => {
    if (!open) baseline.current = null;
    else if (body.current && baseline.current === null)
      baseline.current = formFingerprint(body.current);
  }, [open]);
  const bindBody = useCallback((node: HTMLDivElement | null) => {
    body.current = node;
    observer.current?.disconnect();
    if (!node) return;
    if (baseline.current === null) baseline.current = formFingerprint(node);
    observer.current = new MutationObserver(() =>
      setEdited(formFingerprint(node) !== baseline.current),
    );
    observer.current.observe(node, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["checked", "value"],
    });
  }, []);
  const change = (next: boolean) => {
    if (
      !next &&
      guard &&
      (dirty || edited) &&
      !window.confirm(
        closeLabel === "关闭"
          ? "有尚未保存的修改，确定放弃？"
          : "Discard your unsaved changes?",
      )
    )
      return;
    if (!next) setEdited(false);
    onOpenChange(next);
  };
  const content = (
    <div
      ref={bindBody}
      className={styles.dialogBody}
      onInputCapture={() => {
        if (body.current)
          setEdited(formFingerprint(body.current) !== baseline.current);
      }}
    >
      {children}
    </div>
  );
  if (mobile && !closeOnly)
    return (
      <Drawer.Root
        open={open}
        onOpenChange={change}
        shouldScaleBackground={false}
        repositionInputs={false}
        dismissible={!closeOnly}
        handleOnly
        autoFocus
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.overlay} />
          <Drawer.Content
            className={styles.dialog}
            onInteractOutside={(event) => {
              if (closeOnly) event.preventDefault();
            }}
            onEscapeKeyDown={(event) => {
              if (closeOnly) event.preventDefault();
            }}
            data-slot="drawer-content"
            data-telemetry-private
          >
            {!closeOnly && (
              <DrawerDismissHandle
                label={closeLabel}
                onDismiss={() => change(false)}
              />
            )}
            <div className={styles.dialogHeading}>
              <Drawer.Title className={styles.dialogTitle}>
                {title}
              </Drawer.Title>
              <Drawer.Description className={styles.muted}>
                {description}
              </Drawer.Description>
              <Button
                className={styles.dialogClose}
                size="icon"
                variant="ghost"
                aria-label={closeLabel}
                onClick={() => change(false)}
              >
                <X size={17} />
              </Button>
            </div>
            {content}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  return (
    <Dialog.Root open={open} onOpenChange={change}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          onInteractOutside={(event) => {
            if (closeOnly) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (closeOnly) event.preventDefault();
          }}
          data-wide={wide || undefined}
          data-slot="sheet-content"
          data-telemetry-private
        >
          {mobile && (
            <DrawerDismissHandle
              label={
                closeLabel === "关闭" ? "向下拖动关闭" : "Drag down to close"
              }
              onDismiss={() => change(false)}
            />
          )}
          <div className={styles.dialogHeading}>
            <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
            <Dialog.Description className={styles.muted}>
              {description}
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button
                className={styles.dialogClose}
                size="icon"
                variant="ghost"
                aria-label={closeLabel}
              >
                <X size={17} />
              </Button>
            </Dialog.Close>
          </div>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
