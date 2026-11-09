"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { CSSProperties, MouseEvent } from "react";
import { createPortal } from "react-dom";
import { DropdownMenu } from "radix-ui";
import { ArrowRight, Check, Languages, Settings2, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import {
  TRANSLATION_GUIDE_KEY,
  TRANSLATION_SUCCESS_EVENT,
} from "@/lib/translation/onboarding";
import { translationGuide } from "./translation-guide-store";
import { useGuideExitGuard } from "./use-guide-exit-guard";
import styles from "./translation-guide.module.css";

type Placement = {
  step: "translate" | "settings";
  target: HTMLButtonElement;
  container: HTMLElement;
  left: number;
  top: number;
  width: number;
  height: number;
  busy: boolean;
  cardWidth: number;
  cardLeft: number;
  cardTop: number;
  arrow: number;
  side: "top" | "bottom";
  detached: boolean;
  contentId: string;
};

function portalOrigin(container: HTMLElement) {
  for (
    let node: HTMLElement | null = container;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const style = getComputedStyle(node);
    if (
      style.transform !== "none" ||
      style.translate !== "none" ||
      style.perspective !== "none" ||
      style.filter !== "none" ||
      /transform|perspective|filter/.test(style.willChange) ||
      /layout|paint|strict|content/.test(style.contain)
    ) {
      const rect = node.getBoundingClientRect();
      return {
        left: rect.left + node.clientLeft - node.scrollLeft,
        top: rect.top + node.clientTop - node.scrollTop,
      };
    }
  }
  return { left: 0, top: 0 };
}

/** A single unobtrusive coachmark shared by all visible translation controls. */
export function TranslationGuide({ locale }: { locale: Locale }) {
  const guide = useSyncExternalStore(
    translationGuide.subscribe,
    translationGuide.getSnapshot,
    translationGuide.getServerSnapshot,
  );
  const [placement, setPlacement] = useState<Placement | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const scheduleRef = useRef<(() => void) | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const hasShownRef = useRef(false);
  const pointerIntentRef = useRef<Placement | null>(null);
  const canExit = useGuideExitGuard(
    `${guide?.step}:${placement?.contentId}:${placement?.detached}`,
  );

  useEffect(() => {
    translationGuide.activate(locale);
    const onSuccess = (event: Event) => {
      const detail = (
        event as CustomEvent<{ contentId: string; manual: boolean }>
      ).detail;
      if (detail) translationGuide.translated(detail.contentId, detail.manual);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === TRANSLATION_GUIDE_KEY || event.key === null)
        translationGuide.sync();
    };
    window.addEventListener(TRANSLATION_SUCCESS_EVENT, onSuccess);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(TRANSLATION_SUCCESS_EVENT, onSuccess);
      window.removeEventListener("storage", onStorage);
    };
  }, [locale]);

  useEffect(() => {
    if (!guide || guide.step === "preferences") return;
    const step = guide.step;
    const selector =
      step === "translate"
        ? "[data-translation-action]:not([data-translation-visible])"
        : "[data-translation-settings]";
    const initialDeadline = performance.now() + (hasShownRef.current ? 0 : 650);
    let frame = 0;
    let wakeup = 0;
    let scrollTimer = 0;
    let lastScroll = -Infinity;
    let highlighted: HTMLButtonElement | null = null;
    let previousDescription: string | null = null;
    let preferred: HTMLButtonElement | null = null;
    let revealed = false;
    let scrollingLayer: HTMLDivElement | null = null;

    function clearHighlight() {
      if (!highlighted) return;
      highlighted.removeAttribute("data-translation-guide-target");
      if (previousDescription === null)
        highlighted.removeAttribute("aria-describedby");
      else highlighted.setAttribute("aria-describedby", previousDescription);
      highlighted = null;
    }

    function visible(button: HTMLButtonElement) {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const top = viewport?.offsetTop ?? 0;
      const left = viewport?.offsetLeft ?? 0;
      if (
        !rect.width ||
        !rect.height ||
        rect.top < top + 8 ||
        rect.bottom > top + (viewport?.height ?? window.innerHeight) - 8 ||
        rect.left < left ||
        rect.right > left + (viewport?.width ?? window.innerWidth)
      )
        return false;
      const hit = document.elementFromPoint(
        rect.left + rect.width / 2,
        rect.top + rect.height / 2,
      );
      return (
        hit !== null &&
        (button.contains(hit) ||
          Boolean(hit.closest("[data-translation-guide]")))
      );
    }

    function measure() {
      frame = 0;
      if (document.visibilityState === "hidden") return;
      // Wait for scrolling to settle before the first appearance, then keep the
      // same card mounted even when its anchor leaves the viewport.
      const deadline = Math.max(initialDeadline, lastScroll + 250);
      if (!hasShownRef.current && performance.now() < deadline) {
        clearTimeout(wakeup);
        wakeup = window.setTimeout(schedule, deadline - performance.now());
        return;
      }
      const dialog = [
        ...document.querySelectorAll<HTMLElement>(
          '[role="dialog"][data-state="open"]',
        ),
      ].at(-1);
      const scope = dialog ?? document;
      const buttons = [...scope.querySelectorAll<HTMLButtonElement>(selector)];
      const matching = guide?.contentId
        ? buttons.find(
            (button) =>
              button.closest<HTMLElement>("[data-translation-id]")?.dataset
                .translationId === guide.contentId,
          )
        : null;
      // Lock onto one control per step and focus scope; scrolling must not pick
      // a different snippet or tear down and recreate the guide.
      const target =
        matching ??
        (preferred?.isConnected &&
        scope.contains(preferred) &&
        preferred.matches(selector)
          ? preferred
          : null) ??
        buttons.find(visible) ??
        buttons[0] ??
        (hasShownRef.current && preferred && !preferred.isConnected
          ? preferred
          : null);
      if (!target) {
        clearHighlight();
        // Already translated content is no longer an eligible first step.
        if (preferred?.isConnected && !preferred.matches(selector))
          setPlacement(null);
        return;
      }
      preferred = target;
      const container = dialog ?? document.body;
      const rect = target.getBoundingClientRect();
      if (matching && !revealed) {
        revealed = true;
        if (
          rect.width &&
          (rect.top < 8 || rect.bottom > window.innerHeight - 8)
        ) {
          matching.scrollIntoView({
            block: "center",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? "instant"
              : "smooth",
          });
        }
      }
      const viewport = window.visualViewport;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const bounds = dialog?.getBoundingClientRect();
      const left = Math.max(viewportLeft, bounds?.left ?? viewportLeft);
      const top = Math.max(viewportTop, bounds?.top ?? viewportTop);
      const right = Math.min(
        viewportLeft + (viewport?.width ?? window.innerWidth),
        bounds?.right ?? Infinity,
      );
      const bottom = Math.min(
        viewportTop + (viewport?.height ?? window.innerHeight),
        bounds?.bottom ?? Infinity,
      );
      const cardWidth = Math.min(288, right - left - 24);
      const cardHeight = cardRef.current?.offsetHeight ?? 164;
      const below = rect.bottom + 12 + cardHeight <= bottom - 12;
      const above = rect.top - cardHeight - 12 >= top + 12;
      const menuOpen = Boolean(
        document.querySelector(
          '[data-translation-popover][role="menu"][data-state="open"]',
        ),
      );
      const detached =
        !target.isConnected ||
        !visible(target) ||
        (!below && !above) ||
        menuOpen;
      if (detached) clearHighlight();
      else if (highlighted !== target) {
        clearHighlight();
        highlighted = target;
        previousDescription = target.getAttribute("aria-describedby");
        target.setAttribute(
          "aria-describedby",
          [previousDescription, descriptionId].filter(Boolean).join(" "),
        );
        target.setAttribute("data-translation-guide-target", "");
      }
      const cardLeft = detached
        ? right - cardWidth - 12
        : Math.max(left + 12, Math.min(rect.left - 8, right - cardWidth - 12));
      const side = below ? "bottom" : "top";
      const cardTop = detached
        ? Math.max(top + 12, bottom - cardHeight - 12)
        : below
          ? rect.bottom + 12
          : rect.top - cardHeight - 12;
      const origin =
        layerRef.current?.parentElement === container
          ? layerRef.current.getBoundingClientRect()
          : portalOrigin(container);
      const next: Placement = {
        step,
        target,
        container,
        detached,
        contentId:
          target.closest<HTMLElement>("[data-translation-id]")?.dataset
            .translationId ?? "",
        left: rect.left - origin.left - 3,
        top: rect.top - origin.top - 3,
        width: rect.width + 6,
        height: rect.height + 6,
        busy: target.disabled || !target.isConnected,
        cardWidth,
        cardLeft: cardLeft - origin.left,
        cardTop: cardTop - origin.top,
        arrow: Math.max(
          22,
          Math.min(rect.left + rect.width / 2 - cardLeft, cardWidth - 22),
        ),
        side,
      };
      hasShownRef.current = true;
      setPlacement((previous) =>
        previous &&
        Object.keys(next).every(
          (key) =>
            previous[key as keyof Placement] === next[key as keyof Placement],
        )
          ? previous
          : next,
      );
    }

    function schedule() {
      if (!frame) frame = requestAnimationFrame(measure);
    }
    function onScroll() {
      lastScroll = performance.now();
      scrollingLayer = layerRef.current;
      scrollingLayer?.setAttribute("data-scrolling", "");
      clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        layerRef.current?.removeAttribute("data-scrolling");
        schedule();
      }, 180);
      schedule();
    }
    scheduleRef.current = schedule;
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            !(record.target instanceof Element) ||
            !record.target.closest("[data-translation-guide]"),
        )
      )
        schedule();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: [
        "data-state",
        "data-translation-id",
        "data-translation-visible",
        "aria-hidden",
        "disabled",
        "aria-busy",
      ],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(document.documentElement);
    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", onScroll);
    document.addEventListener("visibilitychange", schedule);
    const onMotionEnd = (event: Event) => {
      if (
        event.target instanceof Element &&
        !event.target.closest("[data-translation-guide]")
      )
        schedule();
    };
    document.addEventListener("animationend", onMotionEnd, true);
    document.addEventListener("transitionend", onMotionEnd, true);
    schedule();
    return () => {
      clearTimeout(wakeup);
      clearTimeout(scrollTimer);
      scrollingLayer?.removeAttribute("data-scrolling");
      if (scheduleRef.current === schedule) scheduleRef.current = null;
      cancelAnimationFrame(frame);
      clearHighlight();
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", schedule);
      document.removeEventListener("animationend", onMotionEnd, true);
      document.removeEventListener("transitionend", onMotionEnd, true);
    };
  }, [guide, descriptionId]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new ResizeObserver(() => scheduleRef.current?.());
    observer.observe(card);
    return () => observer.disconnect();
  }, [placement?.container, guide?.step]);

  if (!guide || guide.step === "preferences" || !placement) return null;
  const first = guide.step === "translate";
  const busy = placement.step !== guide.step || (first && placement.busy);
  const title = first ? "试试一键翻译" : "按你的习惯阅读";
  const description = first
    ? "点击「翻译」，查看这段内容的译文。"
    : "点击右侧设置，可开启自动翻译、选择原处替换或并列显示，以及切换模型。";

  function activateTarget(event: MouseEvent<HTMLButtonElement>) {
    if (event.detail > 1) return;
    const intent = event.detail > 0 ? pointerIntentRef.current : placement;
    if (
      !intent ||
      intent.step !== guide?.step ||
      intent.contentId !== placement?.contentId
    )
      return;
    const target = placement?.target;
    if (
      !target?.isConnected ||
      target.disabled ||
      placement?.step !== guide?.step
    )
      return;
    if (intent.detached || placement?.detached) {
      target.scrollIntoView({
        block: "center",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
      return;
    }
    target.focus({ preventScroll: true });
    if (first) {
      if (!target.hasAttribute("data-translation-visible")) target.click();
    } else if (target.getAttribute("aria-expanded") !== "true")
      target.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          bubbles: true,
          cancelable: true,
        }),
      );
  }

  function dismissGuide(event: MouseEvent<HTMLButtonElement>) {
    if (!canExit(event)) return;
    if (cardRef.current?.contains(document.activeElement))
      placement?.target.focus({ preventScroll: true });
    translationGuide.dismiss();
  }

  return createPortal(
    <div
      data-translation-guide
      data-translation-popover
      data-detached={placement.detached ? "" : undefined}
      ref={layerRef}
      className={styles.layer}
      onClick={(event) => event.stopPropagation()}
    >
      <span
        aria-hidden="true"
        hidden={placement.detached}
        className={styles.spotlight}
        style={{
          left: placement.left,
          top: placement.top,
          width: placement.width,
          height: placement.height,
        }}
      />
      <div
        ref={cardRef}
        className={styles.card}
        data-side={placement.side}
        data-detached={placement.detached ? "" : undefined}
        style={
          {
            left: placement.cardLeft,
            top: placement.cardTop,
            width: placement.cardWidth,
            "--guide-arrow": `${placement.arrow}px`,
          } as CSSProperties
        }
        role="region"
        aria-labelledby={titleId}
        lang="zh-CN"
      >
        <div key={guide.step} className={styles.cardContent}>
          <div className={styles.topline}>
            <span className={styles.eyebrow}>
              {first ? <Languages size={13} /> : <Check size={13} />}{" "}
              {first ? "阅读小提示" : "翻译成功"}
            </span>
            <span
              className={styles.counter}
              aria-label={`第 ${first ? 1 : 2} 步，共 2 步`}
            >
              {first ? "01" : "02"}
              <span> / 02</span>
            </span>
            <button
              type="button"
              className={styles.close}
              aria-label="跳过翻译引导"
              onClick={dismissGuide}
            >
              <X size={14} />
            </button>
          </div>
          <div className={styles.copy} aria-live="polite" aria-atomic="true">
            <h2 id={titleId}>{title}</h2>
            <p id={descriptionId}>{description}</p>
          </div>
          <div className={styles.footer}>
            <span className={styles.dots} aria-hidden="true">
              <i data-active={first} />
              <i data-active={!first} />
            </span>
            <button
              type="button"
              className={styles.skip}
              onClick={dismissGuide}
            >
              跳过
            </button>
            <button
              type="button"
              className={styles.primary}
              disabled={busy}
              onPointerDown={() => {
                pointerIntentRef.current = placement;
              }}
              onClick={activateTarget}
            >
              {busy
                ? "等待译文…"
                : placement.detached
                  ? "回到按钮"
                  : first
                    ? "试试翻译"
                    : "打开设置"}
              <ArrowRight size={13} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </div>,
    placement.container,
  );
}

/** Explain the real settings in place, without adding a second overlay. */
export function TranslationSettingsGuide({
  contentId,
  onDone,
}: {
  contentId: string;
  onDone?: () => void;
}) {
  const guide = useSyncExternalStore(
    translationGuide.subscribe,
    translationGuide.getSnapshot,
    translationGuide.getServerSnapshot,
  );
  const canExit = useGuideExitGuard(`${guide?.step}:${contentId}`);
  if (guide?.step !== "preferences" || guide.contentId !== contentId)
    return null;
  if (onDone)
    return (
      <DropdownMenu.Item asChild onSelect={(event) => event.preventDefault()}>
        <button
          type="button"
          className={styles.done}
          onClick={(event) => {
            if (!canExit(event)) return;
            translationGuide.completeSettings(contentId);
            onDone();
          }}
        >
          <Check size={13} aria-hidden="true" />
          知道了
        </button>
      </DropdownMenu.Item>
    );
  return (
    <div
      className={styles.menuIntro}
      data-translation-settings-guide
      role="status"
    >
      <span className={styles.menuIcon}>
        <Settings2 size={15} aria-hidden="true" />
      </span>
      <span>
        <strong>让翻译更顺手</strong>
        <span>自动翻译、显示方式和模型，随时可改。</span>
      </span>
    </div>
  );
}
