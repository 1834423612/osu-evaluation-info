"use client";
import { useEffect, useState, useId } from "react";
import { History, LoaderCircle, BookOpen, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EmptyResult } from "@/components/brand/empty-result";
import { confirmDiscard } from "@/components/forms/draft-guard";
import { syllabusClient } from "@/lib/syllabus/client";
import type {
  SyllabusReference,
  SyllabusReferenceQuery,
} from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import { SyllabusReader } from "./syllabus-reader";
import styles from "./syllabus.module.css";
export function HistoricalSyllabi({
  query,
  locale,
}: {
  query: SyllabusReferenceQuery;
  locale: Locale;
}) {
  const { subject, catalogNumber, termCode, campusCode, classNumber } = query;
  const documentId = useId();
  const [rows, setRows] = useState<SyllabusReference[] | null>(null),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState(""),
    [reading, setReading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    syllabusClient
      .references(
        { subject, catalogNumber, termCode, campusCode, classNumber },
        controller.signal,
      )
      .then((result) => {
        if (!controller.signal.aborted) setRows(result.data);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [subject, catalogNumber, termCode, campusCode, classNumber, retry]);
  const chosen = rows?.find((row) => row.entry.code === selected) ?? rows?.[0];
  if (failed)
    return (
      <div className={styles.notice} role="status">
        <p>
          {text(
            locale,
            "No current syllabus is available. Historical references are temporarily unavailable.",
            "本学期暂无可用大纲，往年参考暂时无法查询。",
          )}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setFailed(false);
            setRows(null);
            setRetry((value) => value + 1);
          }}
        >
          {text(locale, "Retry historical references", "重试往年参考")}
        </Button>
      </div>
    );
  if (!rows)
    return (
      <p className={styles.loading} role="status">
        <LoaderCircle size={16} className="spin" />
        {text(
          locale,
          "Finding historical syllabus references…",
          "正在查找往年大纲参考…",
        )}
      </p>
    );
  if (!chosen)
    return (
      <EmptyResult layout="stack" size={64}>
        {text(
          locale,
          "No current published syllabus or matching historical reference was found.",
          "暂未找到本学期已发布大纲，也没有匹配的往年参考。",
        )}
      </EmptyResult>
    );
  return (
    <section
      className={styles.historical}
      aria-label={text(
        locale,
        "Historical syllabus references",
        "往年大纲参考",
      )}
    >
      <div className={styles.referenceHeading}>
        <History size={16} />
        <strong>
          {text(locale, "Historical syllabus reference", "往年大纲参考")}
        </strong>
        <span>
          {chosen.sameInstructor
            ? text(locale, "Same instructor", "同一教师")
            : text(locale, "Same course", "同课程参考")}
        </span>
      </div>
      <p className={styles.caption}>
        {text(
          locale,
          "No current published syllabus was found. Past syllabi are for reference; follow this term’s instructor.",
          "本学期暂未找到已发布大纲。往年资料仅供参考，本学期以教师发布内容为准。",
        )}
      </p>
      <div className={styles.referenceControls}>
        <Select
          value={chosen.entry.code}
          onValueChange={(value) => {
            if (!confirmDiscard()) return;
            setSelected(value);
            setReading(false);
          }}
        >
          <SelectTrigger
            aria-label={text(
              locale,
              "Historical class section",
              "往年参考班次",
            )}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {rows.map((row) => (
              <SelectItem key={row.entry.code} value={row.entry.code}>
                {row.entry.termName} ·{" "}
                {row.instructors.join(", ") ||
                  text(locale, "Instructor unspecified", "未注明教师")}{" "}
                · #{row.entry.classNumber || row.entry.sectionIdentifier}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={reading ? "outline" : "default"}
          size="sm"
          aria-expanded={reading}
          aria-controls={documentId}
          onClick={() => {
            if (reading && !confirmDiscard()) return;
            setReading((value) => !value);
          }}
        >
          {reading ? <ChevronUp size={15} /> : <BookOpen size={15} />}
          {text(
            locale,
            reading ? "Hide reference" : "Open selected syllabus",
            reading ? "收起参考" : "打开所选大纲",
          )}
        </Button>
      </div>
      {reading ? (
        <div className={styles.referenceDocument} id={documentId}>
          <p className={styles.referenceTerm}>
            {chosen.entry.termName} · {chosen.entry.title}
          </p>
          <SyllabusReader
            key={chosen.entry.code}
            entry={chosen.entry}
            locale={locale}
          />
        </div>
      ) : null}
    </section>
  );
}
