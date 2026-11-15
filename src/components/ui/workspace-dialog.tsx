"use client";
import { Dialog } from "radix-ui";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  closeLabel: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const mobile = useSyncExternalStore(subscribe, snapshot, () => false);
  const content = <div className={styles.dialogBody}>{children}</div>;
  if (mobile)
    return (
      <Drawer.Root
        open={open}
        onOpenChange={onOpenChange}
        shouldScaleBackground={false}
        repositionInputs={false}
        handleOnly
        autoFocus
      >
        <Drawer.Portal>
          <Drawer.Overlay className={styles.overlay} />
          <Drawer.Content
            className={styles.dialog}
            data-slot="drawer-content"
            data-telemetry-private
          >
            <DrawerDismissHandle
              label={closeLabel}
              onDismiss={() => onOpenChange(false)}
            />
            <div className={styles.dialogHeading}>
              <Drawer.Title className={styles.dialogTitle}>
                {title}
              </Drawer.Title>
              <Drawer.Description className={styles.muted}>
                {description}
              </Drawer.Description>
              <Drawer.Close asChild>
                <Button
                  className={styles.dialogClose}
                  size="icon"
                  variant="ghost"
                  aria-label={closeLabel}
                >
                  <X size={17} />
                </Button>
              </Drawer.Close>
            </div>
            {content}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className={styles.overlay} />
        <Dialog.Content
          className={styles.dialog}
          data-wide={wide || undefined}
          data-telemetry-private
        >
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
