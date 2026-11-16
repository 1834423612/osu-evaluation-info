"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Languages, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requestTextTranslation } from "@/lib/translation/text-client";
import { translateSyllabus } from "@/lib/syllabus/translation";
import type { TranslationModel } from "@/lib/translation/service";
import { translationLanguagePair } from "@/lib/translation/service";
import { cleanOfficialSyllabusHtml } from "@/lib/syllabus/official-render";
import { syllabusSectionBody } from "@/lib/syllabus/insights";
import type { SyllabusSection } from "@/lib/syllabus/content";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-highlights.module.css";
export function HighlightTranslation({
  document,
  model,
  section,
  locale,
  children,
}: {
  document: SyllabusDocument;
  model: TranslationModel;
  section: SyllabusSection;
  locale: Locale;
  children: ReactNode;
}) {
  const [html, setHtml] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const job = useRef<AbortController | null>(null);
  useEffect(() => () => job.current?.abort(), []);
  async function translate() {
    if (busy) return;
    if (html) {
      setVisible((value) => !value);
      return;
    }
    const controller = new AbortController();
    job.current = controller;
    setBusy(true);
    setFailed(false);
    const target = translationLanguagePair(section.text).targetLanguage;
    try {
      const result = await translateSyllabus(
        {
          ...document,
          components: [
            {
              id: section.id,
              type: "text",
              order: 0,
              locale: "en-US",
              html: section.html,
            },
          ],
        },
        async (source) =>
          (
            await requestTextTranslation(
              source,
              model,
              true,
              { canStart: () => !controller.signal.aborted },
              target,
            )
          ).translation,
        { mode: "bilingual", target, signal: controller.signal },
      );
      if (!controller.signal.aborted) {
        setHtml(
          cleanOfficialSyllabusHtml(
            syllabusSectionBody(result.components[0].html),
          ),
        );
        setVisible(true);
      }
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <>
      <div className={styles.translationTools}>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void translate()}
        >
          {busy ? (
            <LoaderCircle size={13} className="spin" />
          ) : (
            <Languages size={13} />
          )}
          {text(
            locale,
            busy
              ? "Translating…"
              : visible
                ? "Show original"
                : html
                  ? "Show translation"
                  : "Translate this section",
            busy
              ? "正在翻译…"
              : visible
                ? "查看原文"
                : html
                  ? "查看译文"
                  : "翻译此分区",
          )}
        </Button>
        {visible ? (
          <small>
            {text(
              locale,
              "Bilingual · machine translation",
              "双语对照 · 机器翻译",
            )}
          </small>
        ) : null}
        {failed ? (
          <small role="status">
            {text(
              locale,
              "Translation unavailable. Try again.",
              "翻译暂不可用，请重试。",
            )}
          </small>
        ) : null}
      </div>
      {visible ? (
        <div
          className={styles.sourceBody}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        children
      )}
    </>
  );
}
