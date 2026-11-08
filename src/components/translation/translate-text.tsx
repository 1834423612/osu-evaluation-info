"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ElementType } from "react";
import { DropdownMenu } from "radix-ui";
import {
  Check,
  ChevronRight,
  Languages,
  LaptopMinimal,
  LoaderCircle,
  Settings2,
  Sparkles,
  WandSparkles,
  WholeWord,
} from "lucide-react";
import type { Locale } from "@/lib/i18n";
import {
  MAX_TRANSLATION_LENGTH,
  translationAction,
  translationLanguagePair,
  type TranslationTarget,
  type TranslationProvider,
  type TranslationModel,
  TranslationUnavailableError,
} from "@/lib/translation/service";
import { translateInBrowser } from "@/lib/translation/browser";
import { createRemoteTranslationClient } from "@/lib/translation/client";
import { createBrowserUsageReporter } from "@/lib/translation/browser-usage";
import styles from "./translate-text.module.css";
import { createTranslationScheduler } from "@/lib/translation/scheduler";

type DisplayMode = "bilingual" | "replace";
type TranslationStatus = "idle" | "loading" | "downloading" | "error";
type DisplayTranslation = {
  translation: string;
  provider: TranslationProvider;
};

const MODE_KEY = "course-atlas:translation-mode:v1";
const AUTO_KEY = "course-atlas:translation-auto:v1";
const MODEL_KEY = "course-atlas:translation-model:v1";
const MODELS = ["auto", "chrome", "ollama", "google"] as const;
const MODE_EVENT = "course-atlas:translation-mode";
const scheduler = createTranslationScheduler<DisplayTranslation>();
const remoteTranslation = createRemoteTranslationClient(
  fetch,
  25,
  createBrowserUsageReporter(),
);
let memoryMode: DisplayMode | null = null;
let memoryAuto: boolean | null = null;
let memoryModel: TranslationModel | null = null;

function isTranslationModel(value: unknown): value is TranslationModel {
  return MODELS.some((model) => model === value);
}

function getStoredModel(): TranslationModel {
  if (memoryModel) return memoryModel;
  try {
    const value = localStorage.getItem(MODEL_KEY);
    return isTranslationModel(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

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
    memoryModel = null;
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

function subscribeToCompactMenus(callback: () => void) {
  const media = window.matchMedia("(max-width: 600px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getCompactMenus() {
  return window.matchMedia("(max-width: 600px)").matches;
}

function cacheKey(
  source: string,
  target: TranslationTarget,
  model: TranslationModel,
) {
  return `${model}\0${target}\0${source}`;
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
  const retryDelayRef = useRef(5000);
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
  const model = useSyncExternalStore<TranslationModel>(
    subscribeToMode,
    getStoredModel,
    () => "auto",
  );
  const compactMenus = useSyncExternalStore(
    subscribeToCompactMenus,
    getCompactMenus,
    () => false,
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const [translationState, setTranslationState] = useState<{
    key: string;
    value: DisplayTranslation;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const pair = translationLanguagePair(text);
  const key = cacheKey(text, pair.targetLanguage, model);
  const activeKeyRef = useRef(key);
  const [statusState, setStatusState] = useState<{
    key: string;
    value: TranslationStatus;
  } | null>(null);
  const status = statusState?.key === key ? statusState.value : "idle";

  useEffect(() => {
    activeKeyRef.current = key;
  }, [key]);

  useEffect(() => {
    automaticRef.current = automatic;
  }, [automatic]);

  const translate = useCallback(
    async (manual = true, selectedModel = model) => {
      const requestKey = cacheKey(text, pair.targetLanguage, selectedModel);
      const setStatus = (value: TranslationStatus) => {
        if (activeKeyRef.current === requestKey)
          setStatusState({ key: requestKey, value });
      };
      if (!text.trim() || text.length > MAX_TRANSLATION_LENGTH) {
        setStatus("error");
        return;
      }
      setStatus("loading");
      try {
        const result = await scheduler.request(
          requestKey,
          async () => {
            if (activeKeyRef.current !== requestKey)
              throw new DOMException(
                "Translation model changed.",
                "AbortError",
              );
            if (
              !manual &&
              (!isIntersectingRef.current || !automaticRef.current)
            )
              throw new DOMException("Auto translation paused.", "AbortError");
            let result: DisplayTranslation | null = null;
            if (selectedModel === "auto" || selectedModel === "chrome") {
              try {
                const local = await translateInBrowser(
                  text,
                  pair.sourceLanguage,
                  pair.targetLanguage,
                  () => setStatus("downloading"),
                  manual && Boolean(navigator.userActivation?.isActive),
                );
                if (local) result = { translation: local, provider: "chrome" };
              } catch {
                result = null;
              }
            }
            if (!result && selectedModel === "chrome")
              throw new TranslationUnavailableError();
            if (!result) {
              if (activeKeyRef.current !== requestKey)
                throw new DOMException(
                  "Translation model changed.",
                  "AbortError",
                );
              setStatus("loading");
              result = await remoteTranslation.request(
                text,
                pair.targetLanguage,
                selectedModel === "chrome" ? "auto" : selectedModel,
              );
            }
            return {
              translation: result.translation,
              provider: result.provider,
            };
          },
          manual,
        );
        if (activeKeyRef.current !== requestKey) return;
        setTranslationState({ key: requestKey, value: result });
        setVisible(true);
        setStatus("idle");
      } catch (error) {
        if (activeKeyRef.current !== requestKey) return;
        const retryAfter =
          error instanceof Error && "retryAfterMs" in error
            ? Number(error.retryAfterMs)
            : 5000;
        retryDelayRef.current = Math.min(
          60_000,
          Math.max(5000, Number.isFinite(retryAfter) ? retryAfter : 5000),
        );
        if (!manual && (!isIntersectingRef.current || !automaticRef.current)) {
          autoAttemptRef.current = null;
          setStatus("idle");
        } else setStatus("error");
      }
    },
    [model, pair.sourceLanguage, pair.targetLanguage, text],
  );

  useEffect(() => {
    if (!automatic || status !== "error") return;
    const timer = setTimeout(() => {
      if (isIntersectingRef.current && automaticRef.current)
        void translate(false);
    }, retryDelayRef.current);
    return () => clearTimeout(timer);
  }, [automatic, status, translate]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content || !automatic) return;
    const observer = new IntersectionObserver((entries) => {
      const shown = entries.some((entry) => entry.isIntersecting);
      isIntersectingRef.current = shown;
      if (!shown) autoAttemptRef.current = null;
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

  function chooseMode(next: DisplayMode) {
    setMenuOpen(false);
    memoryMode = next;
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      // In-memory preference still applies for this page view.
    }
    window.dispatchEvent(new Event(MODE_EVENT));
  }

  function toggleAutomatic() {
    memoryAuto = !automatic;
    try {
      localStorage.setItem(AUTO_KEY, String(memoryAuto));
    } catch {
      // The current browser session still uses the selected preference.
    }
    setMenuOpen(false);
    window.dispatchEvent(new Event(MODE_EVENT));
  }

  function chooseModel(value: string) {
    if (!isTranslationModel(value) || value === model) return;
    memoryModel = value;
    try {
      localStorage.setItem(MODEL_KEY, value);
    } catch {
      // Keep the selection for this page when browser storage is unavailable.
    }
    activeKeyRef.current = cacheKey(text, pair.targetLanguage, value);
    window.dispatchEvent(new Event(MODE_EVENT));
    // Start from the selection gesture so a local model may be downloaded.
    if (visible || status !== "idle") void translate(true, value);
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
          provider: "翻译服务",
          localProvider: "本机翻译",
          googleProvider: "Google 翻译",
          model: "翻译模型",
          automaticModel: "自动",
          automaticHint: "按可用性自动选择",
          localHint: "浏览器内置模型",
          googleHint: "Google 在线翻译",
          selectedUnavailable: "所选模型暂不可用，可切换为“自动”。",
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
          provider: "Translation service",
          localProvider: "On-device",
          googleProvider: "Google Translate",
          model: "Translation model",
          automaticModel: "Auto",
          automaticHint: "Choose by availability",
          localHint: "Built into your browser",
          googleHint: "Google online translation",
          selectedUnavailable: "Selected model unavailable. Try Auto instead.",
        };
  const modelOptions = [
    {
      value: "auto",
      label: labels.automaticModel,
      hint: labels.automaticHint,
      icon: WandSparkles,
    },
    {
      value: "chrome",
      label: labels.localProvider,
      hint: labels.localHint,
      icon: LaptopMinimal,
    },
    {
      value: "ollama",
      label: "kjch ai service",
      hint: "HY-MT1.5 · 1.8B",
      icon: Sparkles,
    },
    {
      value: "google",
      label: labels.googleProvider,
      hint: labels.googleHint,
      icon: Languages,
    },
  ];
  const selectedModelLabel = modelOptions.find(
    (option) => option.value === model,
  )!.label;
  const translatedResult =
    translationState?.key === key ? translationState.value : null;
  const translation = translatedResult?.translation ?? null;
  const showingTranslation = visible && translation !== null;
  const provider = showingTranslation ? translatedResult?.provider : null;
  const providerKind =
    provider === "ollama" ? "kjch" : provider === "chrome" ? "local" : "google";
  const providerLabel =
    provider === "ollama"
      ? "kjch ai service"
      : provider === "chrome"
        ? labels.localProvider
        : labels.googleProvider;
  const ProviderIcon =
    provider === "ollama"
      ? Sparkles
      : provider === "chrome"
        ? LaptopMinimal
        : Languages;
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
          data-analytics-action="translation_toggle"
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
        <DropdownMenu.Root
          modal={false}
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
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              className={styles.settingsButton}
              data-analytics-action="translation_settings_open"
              ref={settingsRef}
              aria-label={labels.settings}
              title={labels.settings}
              data-auto={automatic ? "true" : undefined}
            >
              <Settings2 size={13} aria-hidden="true" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal container={portalContainer}>
            <DropdownMenu.Content
              className={styles.modeMenu}
              aria-label={labels.settings}
              data-translation-popover
              align="start"
              side="bottom"
              sideOffset={6}
              collisionPadding={10}
              sticky="always"
              onClick={(event) => event.stopPropagation()}
            >
              <DropdownMenu.CheckboxItem
                className={styles.autoChoice}
                data-analytics-action="translation_auto_toggle"
                aria-label={labels.auto}
                checked={automatic}
                onCheckedChange={toggleAutomatic}
              >
                <span>{labels.auto}</span>
                <span className={styles.switchTrack} data-checked={automatic}>
                  <span />
                </span>
              </DropdownMenu.CheckboxItem>
              <span className={styles.menuHint}>{labels.autoHint}</span>
              <DropdownMenu.Separator className={styles.menuDivider} />
              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger
                  className={`${styles.modeChoice} ${styles.modelTrigger}`}
                >
                  <WandSparkles size={13} aria-hidden="true" />
                  <span>{labels.model}</span>
                  <span className={styles.modelValue}>
                    {selectedModelLabel}
                  </span>
                  <ChevronRight
                    size={12}
                    className={styles.submenuArrow}
                    aria-hidden="true"
                  />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.Portal container={portalContainer}>
                  <DropdownMenu.SubContent
                    className={`${styles.modeMenu} ${styles.modelMenu}`}
                    aria-label={labels.model}
                    data-translation-popover
                    data-translation-model-menu
                    // Overlap the parent on phones so every option stays in view.
                    sideOffset={compactMenus ? -218 : 6}
                    alignOffset={-5}
                    collisionPadding={10}
                    sticky="always"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu.RadioGroup
                      value={model}
                      onValueChange={chooseModel}
                    >
                      {modelOptions.map(
                        ({ value, label, hint, icon: Icon }) => (
                          <DropdownMenu.RadioItem
                            key={value}
                            value={value}
                            textValue={label}
                            className={styles.modelChoice}
                            data-translation-model={value}
                          >
                            <Icon
                              size={15}
                              className={styles.modelIcon}
                              data-model={value}
                              aria-hidden="true"
                            />
                            <span className={styles.modelCopy}>
                              <span>{label}</span>
                              <span className={styles.modelHint}>{hint}</span>
                            </span>
                            <DropdownMenu.ItemIndicator
                              className={styles.modelCheck}
                            >
                              <Check size={13} aria-hidden="true" />
                            </DropdownMenu.ItemIndicator>
                          </DropdownMenu.RadioItem>
                        ),
                      )}
                    </DropdownMenu.RadioGroup>
                  </DropdownMenu.SubContent>
                </DropdownMenu.Portal>
              </DropdownMenu.Sub>
              <DropdownMenu.Separator className={styles.menuDivider} />
              <DropdownMenu.RadioGroup
                className={styles.modeChoices}
                value={mode}
                onValueChange={(value) => {
                  if (isDisplayMode(value)) chooseMode(value);
                }}
              >
                <DropdownMenu.RadioItem
                  value="bilingual"
                  className={styles.modeChoice}
                  data-analytics-action="translation_mode_bilingual"
                >
                  {mode === "bilingual" ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <WholeWord size={13} aria-hidden="true" />
                  )}
                  {labels.bilingual}
                </DropdownMenu.RadioItem>
                <DropdownMenu.RadioItem
                  value="replace"
                  className={styles.modeChoice}
                  data-analytics-action="translation_mode_replace"
                >
                  {mode === "replace" ? (
                    <Check size={13} aria-hidden="true" />
                  ) : (
                    <Languages size={13} aria-hidden="true" />
                  )}
                  {labels.replace}
                </DropdownMenu.RadioItem>
              </DropdownMenu.RadioGroup>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
        {provider ? (
          <span
            className={styles.sourceBadge}
            data-translation-provider={provider}
            data-source={providerKind}
            title={`${labels.provider}: ${providerLabel}`}
          >
            <ProviderIcon size={11} strokeWidth={1.8} aria-hidden="true" />
            <span className="sr-only">{labels.provider}: </span>
            <span className={styles.sourceText}>{providerLabel}</span>
          </span>
        ) : null}
        {status === "error" ? (
          <span className={`${styles.status} ${styles.error}`} role="status">
            {model === "auto" ? labels.unavailable : labels.selectedUnavailable}
          </span>
        ) : null}
      </span>
    </Container>
  );
}
