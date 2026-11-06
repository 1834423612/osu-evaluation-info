"use client";

import { useEffect, useRef } from "react";
import {
  moveDrawerDrag,
  shouldDismissDrawer,
  type DrawerDrag,
} from "@/lib/gestures/drawer-dismiss";

export function DrawerDismissHandle({
  label,
  onDismiss,
}: {
  label: string;
  onDismiss: () => void;
}) {
  const active = useRef<(DrawerDrag & { pointer: number }) | null>(null);
  const surface = useRef<HTMLElement | null>(null);
  const animation = useRef<Animation | null>(null);

  useEffect(
    () => () => {
      animation.current?.cancel();
      surface.current?.style.removeProperty("translate");
    },
    [],
  );

  function reset() {
    active.current = null;
    const element = surface.current;
    if (!element) return;
    const from = element.style.translate || "0 0";
    element.style.removeProperty("translate");
    animation.current?.cancel();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      animation.current = element.animate(
        [{ translate: from }, { translate: "0 0" }],
        { duration: 180, easing: "ease-out" },
      );
    }
  }

  return (
    <button
      type="button"
      data-slot="drawer-handle"
      data-vaul-handle=""
      aria-label={label}
      onPointerDown={(event) => {
        event.stopPropagation();
        if (!event.isPrimary) {
          reset();
          return;
        }
        if (event.button !== 0) return;
        event.preventDefault();
        animation.current?.cancel();
        surface.current = event.currentTarget.closest<HTMLElement>(
          '[data-slot="drawer-content"]',
        );
        active.current = {
          pointer: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          time: event.timeStamp,
          axis: "pending",
          distance: 0,
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        event.stopPropagation();
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        const distance = moveDrawerDrag(drag, event.clientX, event.clientY);
        if (surface.current)
          surface.current.style.translate = `0 ${distance}px`;
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
        const drag = active.current;
        if (!drag || drag.pointer !== event.pointerId) return;
        moveDrawerDrag(drag, event.clientX, event.clientY);
        active.current = null;
        if (shouldDismissDrawer(drag, event.timeStamp)) onDismiss();
        else reset();
      }}
      onPointerCancel={(event) => {
        event.stopPropagation();
        reset();
      }}
      onLostPointerCapture={() => {
        if (active.current) reset();
      }}
      onClick={(event) => {
        event.stopPropagation();
        // Keyboard and assistive-technology activation also offer dismissal.
        if (event.detail === 0) onDismiss();
      }}
    >
      <span data-slot="drawer-grip" />
    </button>
  );
}
