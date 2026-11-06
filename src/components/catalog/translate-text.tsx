"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ElementType, MouseEvent } from "react";
import { Popover } from "radix-ui";
import {
  Check,
  Languages,
  LoaderCircle,
  Settings2,
  WholeWord,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import {
  MAX_TRANSLATION_LENGTH,
  translationAction,
  translationLanguagePair,
  validTranslationResult,
  type TranslationTarget,
} from "@/lib/translation/service";
import styles from "./translate-text.module.css";
import { createTranslationScheduler } from "@/lib/translation/scheduler";

type DisplayMode = "bilingual" | "replace";
type TranslationStatus = "idle" | "loading" | "downloading" | "error";

type TranslatorInstance = {
  translate(text: string, options?: { signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
};
type TranslatorConstructor = {
  availability(options: {
    sourceLanguage: string;
    targetLanguage: string;
  }): Promise<string>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
    signal?: AbortSignal;
  }): Promise<TranslatorInstance>;
};

declare global {
  interface Window {
    Translator?: TranslatorConstructor;
  }
}

const MODE_KEY = "course-atlas:translation-mode:v1";
const AUTO_KEY = "course-atlas:translation-auto:v1";
const MODE_EVENT = "course-atlas:translation-mode";
const scheduler = createTranslationScheduler();
let memoryMode: DisplayMode | null = null;
let memoryAuto: boolean | null = null;

function isDisplayMode(value: unknown): value is DisplayMode {
  return value === "bilingual" || value === "replace";
}

function getStoredMode(): DisplayMode {
  if (memoryMode) return memoryMode;
  try {
    const value = localStorage.getItem(MODE_KEY);
    return isDisplayMode(value) ? value : "bilingual";
  } catch {
    return "bilingual";
  }
}

function getStoredAuto() {
  if (memoryAuto !== null) return memoryAuto;
  try {
    return localStorage.getItem(AUTO_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeToMode(callback: () => void) {
  const onStorage = () => {
    memoryMode = null;
    memoryAuto = null;
    callback();
  };
  window.addEventListener(MODE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MODE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getServerMode(): DisplayMode {
  return "bilingual";
}

function cacheKey(source: string, target: TranslationTarget) {
  return `${target}\0${source}`;
}

async function translateInBrowser(
  source: string,
  sourceLanguage: "en" | "zh",
  targetLanguage: TranslationTarget,
  onDownload: () => void,
  allowDownload: boolean,
) {
  const translator = window.Translator;
  if (!translator) return null;
  const controller = new AbortController();
  let instance: TranslatorInstance | null = null;
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error("Local translation timed out."));
    }, 12_000);
  });
  const target = targetLanguage === "zh-CN" ? "zh" : "en";
  try {
    const availabilityRequest = translator.availability({
      sourceLanguage,
      targetLanguage: target,
    });
    if (!allowDownload) {
      const availability = await Promise.race([availabilityRequest, deadline]);
      // Automatic translation must never initiate a language-model download.
      if (availability !== "available") return null;
    }
    const instanceRequest = translator.create({
      sourceLanguage,
      targetLanguage: target,
      signal: controller.signal,
      monitor: (monitor) => {
        monitor.addEventListener("downloadprogress", () => {
          if (!controller.signal.aborted) onDownload();
        });
      },
    });
    void instanceRequest.then(
      (created) => {
        if (controller.signal.aborted) created.destroy?.();
      },
      () => undefined,
    );
    const [availability, created] = await Promise.race([
      Promise.all([availabilityRequest, instanceRequest]),
      deadline,
    ]);
    instance = created;
    if (availability === "unavailable") return null;
    const result = (
      await Promise.race([
        instance.translate(source, { signal: controller.signal }),
        deadline,
      ])
    ).trim();
    return validTranslationResult(result, source, targetLanguage)
      ? result
      : null;
  } finally {
    clearTimeout(timer!);
    controller.abort();
    instance?.destroy?.();
  }
}

async function translateRemotely(source: string, target: TranslationTarget) {
  const response = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ text: source, target }),
    signal: AbortSignal.timeout(18_000),
  });
  if (!response.ok) throw new Error("translation unavailable");
  const value: unknown = await response.json();
  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as { translation?: unknown }).translation !== "string"
  )
    throw new Error("invalid translation response");
  const translation = (value as { translation: string }).translation.trim();
  if (!validTranslationResult(translation, source, target))
    throw new Error("invalid translation response");
  return translation;
}

export function TranslateText({
  text,
  locale,
  className,
  as = "p",
  preview = false,
}: {
  text: string;
  locale: Locale;
  className?: string;
  as?: "p" | "div";
  preview?: boolean;
}) {
  const Container = as as ElementType;
  const contentRef = useRef<HTMLElement>(null);
  const settingsRef = useRef<HTMLButtonElement>(null);
  const autoAttemptRef = useRef<string | null>(null);
  const isIntersectingRef = useRef(false);
  const automaticRef = useRef(false);
  const mode = useSyncExternalStore(
    subscribeToMode,
    getStoredMode,
    getServerMode,
  );
  const automatic = useSyncExternalStore(
    subscribeToMode,
    getStoredAuto,
    () => false,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [translationState, setTranslationState] = useState<{
    key: string;
    value: string;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<TranslationStatus>("idle");
  const pair = translationLanguagePair(text);
  const key = cacheKey(text, pair.targetLanguage);

  useEffect(() => {
    automaticRef.current = automatic;
  }, [automatic]);

  const translate = useCallback(
    async (manual = true) => {
      if (!text.trim() || text.length > MAX_TRANSLATION_LENGTH) {
        setStatus("error");
        return;
      }
      setStatus("loading");
      try {
        const result = await scheduler.request(key, async () => {
          if (!manual && (!isIntersectingRef.current || !automaticRef.current))
            throw new DOMException("Auto translation paused.", "AbortError");
          let result: string | null = null;
          try {
            result = await translateInBrowser(
              text,
              pair.sourceLanguage,
              pair.targetLanguage,
              () => setStatus("downloading"),
              manual && navigator.userActivation.isActive,
            );
          } catch {
            result = null;
          }
          if (!result) {
            setStatus("loading");
            result = await translateRemotely(text, pair.targetLanguage);
          }
          return result;
        });
        setTranslationState({ key, value: result });
        setVisible(true);
        setStatus("idle");
      } catch {
        if (!manual && (!isIntersectingRef.current || !automaticRef.current)) {
          autoAttemptRef.current = null;
          setStatus("idle");
        } else setStatus("error");
      }
    },
    [key, pair.sourceLanguage, pair.targetLanguage, text],
  );

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !automatic) return;
    const observer = new IntersectionObserver((entries) => {
      const shown = entries.some((entry) => entry.isIntersecting);
      isIntersectingRef.current = shown;
      if (shown && autoAttemptRef.current !== key) {
        autoAttemptRef.current = key;
        void translate(false);
      }
    });
    observer.observe(content);
    return () => {
      isIntersectingRef.current = false;
      observer.disconnect();
    };
  }, [automatic, key, translate]);

  function chooseMode(next: DisplayMode, event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setMenuOpen(false);
    memoryMode = next;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // In-memory preference still applies for this page view.
    }
    window.dispatchEvent(new Event(MODE_EVENT));
  }

  function toggleAutomatic(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    memoryAuto = !automatic;
    try {
      localStorage.setItem(AUTO_KEY, String(memoryAuto));
    } catch {
      // The current browser session still uses the selected preference.
    }
    setMenuOpen(false);
    window.dispatchEvent(new Event(MODE_EVENT));
  }

  const labels =
    locale === "zh"
      ? {
          translate: "翻译",
          showTranslation: "显示译文",
          hideTranslation: "隐藏译文",
          original: "显示原文",
          settings: "翻译显示设置",
          bilingual: "原文与译文对照",
          replace: "仅显示译文",
          unavailable: "翻译暂不可用，原文已保留。",
          loading: "正在翻译…",
          downloading: "正在准备语言模型…",
          auto: "自动翻译",
          autoHint: "自动翻译当前可见内容",
        }
      : {
          translate: "Translate",
          showTranslation: "Show translation",
          hideTranslation: "Hide translation",
          original: "Show original",
          settings: "Translation display settings",
          bilingual: "Show original and translation",
          replace: "Replace with translation",
          unavailable:
            "Translation is unavailable. The original text is unchanged.",
          loading: "Translating…",
          downloading: "Preparing the language model…",
          auto: "Translate automatically",
          autoHint: "Translate visible content automatically",
        };
  const translation =
    translationState?.key === key ? translationState.value : null;
  const showingTranslation = visible && translation !== null;
  const action = translationAction(
    mode,
    showingTranslation,
    translation !== null,
  );
  const actionLabel =
    action === "show-original"
      ? labels.original
      : action === "hide-translation"
        ? labels.hideTranslation
        : action === "show-translation"
          ? labels.showTranslation
          : labels.translate;

  return (
    <Container
      className={[className, styles.content].filter(Boolean).join(" ")}
      data-translation-content
      ref={contentRef}
      data-preview={preview ? "true" : undefined}
      style={{
        display: "block",
        overflow: "visible",
        WebkitLineClamp: "unset",
      }}
    >
      {mode === "bilingual" || !showingTranslation ? (
        <span className={styles.original}>{text}</span>
      ) : null}
      {showingTranslation && mode === "bilingual" ? (
        <span className={styles.translated} lang={pair.targetLanguage}>
          {translation}
        </span>
      ) : null}
      {showingTranslation && mode === "replace" ? (
        <span className={styles.replaced} lang={pair.targetLanguage}>
          {translation}
        </span>
      ) : null}
      <span
        className={styles.actions}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={styles.actionButton}
          onClick={() => {
            if (showingTranslation) setVisible(false);
            else if (translation !== null) setVisible(true);
            else void translate();
          }}
          disabled={status === "loading" || status === "downloading"}
          aria-busy={status === "loading" || status === "downloading"}
          aria-label={actionLabel}
          title={actionLabel}
        >
          {status === "loading" || status === "downloading" ? (
            <LoaderCircle
              size={13}
              className={styles.busyIcon}
              aria-hidden="true"
            />
          ) : (
            <Languages size={13} aria-hidden="true" />
          )}
          <span>
            {status === "loading" || status === "downloading"
              ? status === "downloading"
                ? labels.downloading
                : labels.loading
              : actionLabel}
          </span>
        </button>
        <Popover.Root
          open={menuOpen}
          onOpenChange={(open) => {
            if (open)
              setPortalContainer(
                settingsRef.current?.closest<HTMLElement>('[role="dialog"]') ??
                  null,
              );
            setMenuOpen(open);
          }}
        >
          <Popover.Trigger asChild>
            <button
              type="button"
              className={styles.settingsButton}
              ref={settingsRef}
              aria-label={labels.settings}
              title={labels.settings}
              data-auto={automatic ? "true" : undefined}
            >
              <Settings2 size={13} aria-hidden="true" />
            </button>
          </Popover.Trigger>
          <Popover.Portal container={portalContainer}>
            <Popover.Content
              className={styles.modeMenu}
              role="group"
              aria-label={labels.settings}
              data-translation-popover
              align="start"
              side="bottom"
              sideOffset={6}
              collisionPadding={10}
              sticky="always"
              onClick={(event) => event.stopPropagation()}
              onOpenAutoFocus={(event) => event.preventDefault()}
            >
              <button
                type="button"
                className={styles.autoChoice}
                role="switch"
                aria-label={labels.auto}
                aria-checked={automatic}
                onClick={toggleAutomatic}
              >
                <span>{labels.auto}</span>
                <span className={styles.switchTrack} data-checked={automatic}>
                  <span />
                </span>
              </button>
              <span className={styles.menuHint}>{labels.autoHint}</span>
              <div className={styles.menuDivider} />
              <button
                type="button"
                className={styles.modeChoice}
                aria-pressed={mode === "bilingual"}
                onClick={(event) => chooseMode("bilingual", event)}
              >
                {mode === "bilingual" ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <WholeWord size={13} aria-hidden="true" />
                )}
                {labels.bilingual}
              </button>
              <button
                type="button"
                className={styles.modeChoice}
                aria-pressed={mode === "replace"}
                onClick={(event) => chooseMode("replace", event)}
              >
                {mode === "replace" ? (
                  <Check size={13} aria-hidden="true" />
                ) : (
                  <Languages size={13} aria-hidden="true" />
                )}
                {labels.replace}
              </button>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        {status === "error" ? (
          <span className={`${styles.status} ${styles.error}`} role="status">
            {labels.unavailable}
          </span>
        ) : null}
      </span>
    </Container>
  );
}
