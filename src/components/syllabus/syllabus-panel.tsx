"use client";

import { useEffect, useState } from "react";
import { useSyllabusScroll } from "@/hooks/use-syllabus-scroll";
import { EmptyResult } from "@/components/brand/empty-result";
import { ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CatalogCourse } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import { syllabusClient } from "@/lib/syllabus/client";
import {
  entryMatches,
  matchedCatalogClassNumber,
  officialSyllabusUrl,
} from "@/lib/syllabus/normalize";
import type { SyllabusEntry, SyllabusResult } from "@/lib/syllabus/types";
import { SyllabusReader } from "./syllabus-reader";
import { SyllabusSectionPicker } from "./syllabus-section-picker";
import styles from "./syllabus.module.css";

export default function SyllabusPanel({
  course,
  locale,
  focusClassNumber,
}: {
  course: CatalogCourse;
  locale: Locale;
  focusClassNumber?: string | null;
}) {
  const { subject, catalogNumber, termCode } = course;
  const scrollRef = useSyllabusScroll();
  const [result, setResult] = useState<SyllabusResult<SyllabusEntry[]> | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    syllabusClient
      .entries({ subject, catalogNumber, termCode }, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) {
          setResult(value);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [subject, catalogNumber, termCode, retry]);

  const classNumbers = course.sections.map((section) => section.classNumber);
  const matchedClass = (entry: SyllabusEntry) =>
    matchedCatalogClassNumber(
      entry,
      { subject, catalogNumber, termCode },
      classNumbers,
    );
  // Campus identity comes from the catalog's exact section, never a guessed title.
  const entries =
    result?.data.filter((entry) =>
      entryMatches(entry, { subject, catalogNumber, termCode }, classNumbers),
    ) ?? [];
  const chosen =
    entries.find((entry) => entry.code === selected) ??
    entries.find((entry) => matchedClass(entry) === focusClassNumber) ??
    entries[0];
  const choices = entries.flatMap((entry) => {
    const section = course.sections.find(
      (section) => section.classNumber === matchedClass(entry),
    );
    return section ? [{ entry, section }] : [];
  });

  return (
    <div ref={scrollRef} className={styles.panel} data-syllabus-reader>
      {error ? (
        <div className={styles.notice} role="status">
          <p>
            {text(
              locale,
              "Official syllabus search is unavailable and no usable backup was found.",
              "官方大纲查询暂不可用，且未找到可用备份。",
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(false);
              setRetry((value) => value + 1);
            }}
          >
            {text(locale, "Retry", "重试")}
          </Button>
        </div>
      ) : !result ? (
        <p className={styles.loading} role="status">
          <LoaderCircle size={16} className="spin" />
          {text(
            locale,
            "Finding syllabi for this term…",
            "正在查找本学期大纲…",
          )}
        </p>
      ) : (
        <>
          <SyllabusSectionPicker
            course={course}
            items={choices}
            value={chosen?.code ?? ""}
            onChange={setSelected}
            locale={locale}
          />
          {chosen ? (
            <SyllabusReader key={chosen.code} entry={chosen} locale={locale} />
          ) : (
            <EmptyResult layout="stack" size={64}>
              {text(
                locale,
                "No matching published syllabus was found for this term and these class sections. It may be unpublished or not indexed yet.",
                "未找到与本学期、当前班次匹配的已发布大纲，可能尚未发布或收录。",
              )}
            </EmptyResult>
          )}
        </>
      )}
      {course.sectionsPartial ? (
        <p className={styles.caption}>
          {text(
            locale,
            "Only currently loaded class sections are matched. Refresh class sections to check the complete course.",
            "当前仅匹配已加载的班次；可在开课班次页刷新完整课程后再查看。",
          )}
        </p>
      ) : null}
      <a
        className={styles.libraryLink}
        href={officialSyllabusUrl()}
        target="_blank"
        rel="noopener noreferrer"
      >
        {text(locale, "Browse the official syllabus library", "浏览官方大纲库")}{" "}
        <ExternalLink size={13} />
      </a>
      {result?.source === "backup" ? (
        <p className={styles.caption}>
          {text(
            locale,
            "Section matches come from an archived index.",
            "班次匹配使用的是已归档的索引。",
          )}
        </p>
      ) : null}
    </div>
  );
}
