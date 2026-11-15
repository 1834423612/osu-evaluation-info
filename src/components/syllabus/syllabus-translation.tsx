"use client";
import { useEffect, useRef, useState } from "react";
import { Languages, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { useTranslationPreferences } from "@/components/translation/translate-text";
import type { TranslationModel } from "@/lib/translation/service";
import { requestTextTranslation } from "@/lib/translation/text-client";
import {
  translateSyllabus,
  type SyllabusTranslationMode,
} from "@/lib/syllabus/translation";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-translation.module.css";
export function SyllabusTranslation({
  document,
  onDocument,
  locale,
}: {
  document: SyllabusDocument;
  onDocument: (document: SyllabusDocument | null) => void;
  locale: Locale;
}) {
  const { model: preferredModel } = useTranslationPreferences();
  const [modelOverride, setModelOverride] = useState<TranslationModel | null>(
    null,
  );
  const model = modelOverride ?? preferredModel;
  const [mode, setMode] = useState<SyllabusTranslationMode>("bilingual"),
    [target, setTarget] = useState<"zh-CN" | "en">("zh-CN"),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState({ done: 0, total: 0 }),
    [notice, setNotice] = useState(""),
    [active, setActive] = useState(false),
    [completed, setCompleted] = useState<{
      mode: SyllabusTranslationMode;
      target: "en" | "zh-CN";
    } | null>(null);
  const controller = useRef<AbortController | null>(null),
    cache = useRef(new Map<string, string>());
  useDraftGuard(busy);
  useEffect(() => () => controller.current?.abort(), []);
  async function run() {
    if (busy) return;
    const job = new AbortController();
    controller.current = job;
    setBusy(true);
    setNotice("");
    try {
      const result = await translateSyllabus(
        document,
        async (source) => {
          const key = model + ":" + target + ":" + source;
          const previous = cache.current.get(key);
          if (previous) return previous;
          const result = await requestTextTranslation(
            source,
            model,
            true,
            { canStart: () => !job.signal.aborted },
            target,
          );
          cache.current.set(key, result.translation);
          return result.translation;
        },
        {
          mode,
          target,
          signal: job.signal,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      if (!job.signal.aborted) {
        onDocument(result);
        setActive(true);
        setCompleted({ mode, target });
      }
    } catch {
      if (!job.signal.aborted)
        setNotice(
          text(
            locale,
            "Translation stopped. Completed paragraphs are cached; retry to continue.",
            "翻译中断，已完成段落已缓存，可重试继续。",
          ),
        );
      job.abort();
    } finally {
      if (controller.current === job) setBusy(false);
    }
  }
  return (
    <section className={styles.bar}>
      <div className={styles.heading}>
        <Languages size={16} />
        <strong>{text(locale, "Syllabus translation", "大纲翻译")}</strong>
        <small>
          {text(
            locale,
            "Machine translation · confirm against the source",
            "机器翻译 · 请核对原文",
          )}
        </small>
      </div>
      <div className={styles.controls}>
        <label>
          {text(locale, "Translation service", "翻译服务")}
          <select
            disabled={busy}
            value={model}
            onChange={(e) =>
              setModelOverride(e.target.value as TranslationModel)
            }
          >
            <option value="auto">
              {text(locale, "Automatic", "自动选择")}
            </option>
            <option value="chrome">
              {text(locale, "Browser model", "浏览器模型")}
            </option>
            <option value="ollama">kjch ai service</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label>
          {text(locale, "Language", "目标语言")}
          <select
            value={target}
            disabled={busy}
            onChange={(e) => setTarget(e.target.value as "zh-CN" | "en")}
          >
            <option value="zh-CN">简体中文</option>
            <option value="en">English</option>
          </select>
        </label>
        <label>
          {text(locale, "Display & PDF", "显示与 PDF")}
          <select
            value={mode}
            disabled={busy}
            onChange={(e) => setMode(e.target.value as SyllabusTranslationMode)}
          >
            <option value="bilingual">
              {text(locale, "Bilingual", "双语对照")}
            </option>
            <option value="replace">
              {text(locale, "Replace original", "替换原文")}
            </option>
          </select>
        </label>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void run()}
        >
          {busy ? (
            <LoaderCircle size={14} className="spin" />
          ) : (
            <Languages size={14} />
          )}{" "}
          {text(
            locale,
            busy ? "Translating…" : "Translate document",
            busy ? "正在翻译…" : "翻译全文",
          )}
        </Button>
        {busy ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              controller.current?.abort();
              setBusy(false);
            }}
          >
            <X size={14} />
            {text(locale, "Cancel", "取消")}
          </Button>
        ) : active ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDocument(null);
              setActive(false);
            }}
          >
            {text(locale, "Show original", "查看原文")}
          </Button>
        ) : null}
      </div>
      {busy ? (
        <div className={styles.progress}>
          <progress value={progress.done} max={progress.total || 1} />
          <span>
            {progress.done}/{progress.total}
          </span>
        </div>
      ) : null}
      {notice ? <p role="status">{notice}</p> : null}
      {active ? (
        <p>
          <strong>
            {text(locale, "Current version: ", "当前译文：")}
            {completed?.target === "en" ? "English" : "简体中文"} ·{" "}
            {text(
              locale,
              completed?.mode === "replace" ? "Replacement" : "Bilingual",
              completed?.mode === "replace" ? "替换原文" : "双语对照",
            )}
          </strong>
          {" · "}
          {text(
            locale,
            "Preview and PDF use this translated version. Change the mode and translate again to switch output.",
            "下方预览与 PDF 下载均使用此译文；切换模式后再次翻译即可更新。",
          )}
        </p>
      ) : null}
    </section>
  );
}
