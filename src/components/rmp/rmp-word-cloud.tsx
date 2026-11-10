"use client";

import { useEffect, useRef, useState } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { text, type Locale } from "@/lib/i18n";
import {
  CLOUD_COLORS,
  cloudFontSize,
  cloudWordAngle,
  packWordCloud,
} from "@/lib/rmp/word-cloud";
import { requestTextTranslation } from "@/lib/translation/text-client";
import { translationLanguagePair } from "@/lib/translation/service";
import { useTranslationPreferences } from "@/components/translation/translate-text";
import { browserModel } from "@/components/translation/browser-model-store";
import styles from "./rmp-word-cloud.module.css";

export function RmpWordCloud({
  tags,
  locale,
  seed,
}: {
  tags: { tag: string; count: number }[];
  locale: Locale;
  seed: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const generation = useRef(0);
  const pending = useRef(false);
  const { model, automatic } = useTranslationPreferences();
  const sourceKey = JSON.stringify(tags);
  const key = `${model}\0${sourceKey}`;
  const currentKey = useRef(key);
  const [state, setState] = useState<{
    key: string;
    words?: string[];
    busy?: boolean;
    error?: boolean;
    visible?: boolean;
  } | null>(null);
  const [layout, setLayout] = useState<ReturnType<typeof packWordCloud> | null>(
    null,
  );
  const active = state?.key === key ? state : null;
  const translated = !!active?.visible && !!active.words;
  const labels = tags.map((item, index) =>
    translated ? active!.words![index] : item.tag,
  );
  const labelsKey = JSON.stringify(labels);

  useEffect(() => {
    currentKey.current = key;
    generation.current++;
    pending.current = false;
    return () => {
      currentKey.current = "";
    };
  }, [key]);

  useEffect(() => {
    const element = root.current,
      measurements = measure.current;
    if (!element || !measurements) return;
    let frame = 0;
    let mounted = true;
    const arrange = () => {
      if (!mounted) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const boxes = [...measurements.children].map((child, index) => {
          const bounds = child.getBoundingClientRect();
          return {
            id: `${seed}:${tags[index].tag}`,
            width: bounds.width,
            height: bounds.height,
            angle: cloudWordAngle(tags[index].tag, index),
          };
        });
        setLayout(packWordCloud(boxes, element.clientWidth));
      });
    };
    const observer = new ResizeObserver(arrange);
    observer.observe(element);
    observer.observe(measurements);
    arrange();
    void document.fonts.ready.then(arrange);
    return () => {
      mounted = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
    // The serialized inputs cover content changes without rerunning on identical tag arrays.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [labelsKey, sourceKey, seed]);

  async function translate(manual = true) {
    if (pending.current) return;
    if (active?.words) {
      setState({ ...active, visible: !active.visible });
      return;
    }
    pending.current = true;
    const version = generation.current;
    const isCurrent = () =>
      version === generation.current && currentKey.current === key;
    setState({ key, busy: true });
    try {
      let chosen = model;
      const pairs = [
        ...new Map(
          tags.map((item) => {
            const pair = translationLanguagePair(item.tag);
            return [pair.targetLanguage, pair] as const;
          }),
        ).values(),
      ];
      if (chosen === "chrome") {
        for (const pair of pairs) {
          await browserModel.check(pair, manual);
          const support = browserModel.availability(pair);
          if (!isCurrent()) return;
          if (support === "unsupported" || support === "unavailable") {
            chosen = "auto";
            break;
          }
          if (support !== "available") {
            if (
              !manual ||
              !(await browserModel.request(
                pair,
                locale,
                root.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
              ))
            ) {
              if (isCurrent()) setState({ key });
              return;
            }
          }
        }
      }
      const words = await Promise.all(
        tags.map(async (item) => {
          // The shared client keeps each tag's identity; no delimiter or JSON parsing is needed.
          const result = await requestTextTranslation(
            item.tag,
            chosen,
            manual,
            { canStart: isCurrent },
          );
          return result.translation;
        }),
      );
      if (isCurrent()) setState({ key, words, visible: true });
    } catch {
      if (isCurrent()) {
        setState({ key, error: true });
        generation.current++;
        pending.current = false;
      }
    } finally {
      if (isCurrent()) pending.current = false;
    }
  }
  const translateRef = useRef(translate);
  useEffect(() => {
    translateRef.current = translate;
  });
  useEffect(() => {
    const element = root.current;
    if (!element || !automatic) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        void translateRef.current(false);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [automatic, key]);

  return (
    <div
      ref={root}
      className={styles.root}
      data-rmp-cloud
      data-translated={translated ? "true" : undefined}
    >
      <div className={styles.toolbar}>
        <span>
          {text(locale, "Bigger words · more mentions", "词越大，提及越多")}
        </span>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            void translate();
          }}
          disabled={active?.busy}
          aria-busy={!!active?.busy}
          data-rmp-cloud-translate
          data-analytics-action="rmp_cloud_translate"
          title={text(locale, "Translate tags in place", "词云统一原位翻译")}
        >
          {active?.busy ? (
            <LoaderCircle size={12} className={styles.spinner} />
          ) : (
            <Languages size={12} />
          )}
          {active?.busy
            ? text(locale, "Translating…", "翻译中…")
            : translated
              ? text(locale, "Show original", "显示原文")
              : active?.error
                ? text(locale, "Retry translation", "重试翻译")
                : text(locale, "Translate tags", "翻译词云")}
        </button>
      </div>
      <div ref={measure} className={styles.measure} aria-hidden="true">
        {tags.map((item, index) => (
          <span
            key={item.tag}
            className={styles.word}
            style={{
              fontSize: cloudFontSize(
                item.count,
                tags.map((tag) => tag.count),
              ),
            }}
          >
            {labels[index]}
          </span>
        ))}
      </div>
      <ul
        className={styles.cloud}
        style={{ height: layout?.height ?? 140 }}
        aria-label={text(locale, "Student review word cloud", "学生评价词云")}
        aria-busy={!!active?.busy}
      >
        {tags.map((item, index) => {
          const box = layout?.words[index];
          return (
            <li
              key={item.tag}
              className={styles.word}
              data-cloud-word
              data-count={item.count}
              data-original={item.tag}
              lang={
                translated
                  ? translationLanguagePair(item.tag).targetLanguage
                  : undefined
              }
              title={`${item.tag} · ${item.count} ${text(locale, "mentions", "次提及")}`}
              style={{
                color: CLOUD_COLORS[index % CLOUD_COLORS.length],
                fontSize: cloudFontSize(
                  item.count,
                  tags.map((tag) => tag.count),
                ),
                left: box?.x,
                top: box?.y,
                width: box?.width,
                visibility: box ? "visible" : "hidden",
                transform: `translate(-50%, -50%) rotate(${box?.angle ?? 0}deg)`,
              }}
            >
              {labels[index]}
            </li>
          );
        })}
      </ul>
      {active?.error ? (
        <p className={styles.error} role="status">
          {text(
            locale,
            "Translation unavailable. Original tags are preserved.",
            "暂时无法翻译，已保留原文。",
          )}
        </p>
      ) : null}
    </div>
  );
}
