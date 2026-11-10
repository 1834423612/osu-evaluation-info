"use client";
import { useState } from "react";
import {
  BookOpen,
  Check,
  Copy,
  GraduationCap,
  Hash,
  ReceiptText,
} from "lucide-react";
import type { CatalogCourse, CatalogFee } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./course-facts.module.css";

export function courseIdLabel(course: CatalogCourse) {
  return [
    ...new Set([...(course.courseIds ?? []), course.courseId].filter(Boolean)),
  ].join(" / ");
}

export function CourseIdentityFacts({
  course,
  locale,
  compact = false,
}: {
  course: CatalogCourse;
  locale: Locale;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const ids = courseIdLabel(course);
  const credits =
    course.creditsMin === course.creditsMax
      ? String(course.creditsMin)
      : `${course.creditsMin}–${course.creditsMax}`;
  return (
    <span
      className={styles.identity}
      data-compact={compact ? "true" : undefined}
    >
      <span className={`${styles.factChip} ${styles.credit}`}>
        <GraduationCap size={13} aria-hidden="true" />
        {credits} {text(locale, "credits", "学分")}
      </span>
      {ids ? (
        <button
          className={`${styles.factChip} ${styles.identifier}`}
          type="button"
          title={text(locale, "Copy course code", "复制课程代码")}
          aria-label={text(
            locale,
            `Copy course code ${ids}`,
            `复制课程代码 ${ids}`,
          )}
          onClick={async (event) => {
            event.stopPropagation();
            try {
              await navigator.clipboard.writeText(ids);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            } catch {
              /* Visible identifiers remain selectable. */
            }
          }}
        >
          <Hash size={12} aria-hidden="true" />
          {!compact ? <span>{text(locale, "Code", "课程代码")}</span> : null}
          <code>{ids}</code>
          {copied ? (
            <Check size={12} aria-hidden="true" />
          ) : (
            <Copy size={12} aria-hidden="true" />
          )}
        </button>
      ) : !compact ? (
        <span className={styles.pending}>
          {text(locale, "Code loading…", "课程代码加载中…")}
        </span>
      ) : null}
    </span>
  );
}

function feeAmount(fee: CatalogFee, locale: Locale) {
  return fee.amount === null
    ? text(locale, "See fee details", "查看费用")
    : `$${fee.amount.toLocaleString("en-US", { minimumFractionDigits: fee.amount % 1 ? 2 : 0 })}`;
}

export function FeePills({
  fees,
  locale,
}: {
  fees: CatalogFee[];
  locale: Locale;
}) {
  if (!fees.length) return null;
  return (
    <span className={styles.feePills}>
      {fees.map((fee) => {
        const Icon = fee.kind === "textbook" ? BookOpen : ReceiptText;
        return (
          <span
            className={styles.feePill}
            key={fee.description}
            title={fee.description}
          >
            <Icon size={11} aria-hidden="true" />
            {fee.kind === "textbook"
              ? text(locale, "Textbook", "教材")
              : text(locale, "Course fee", "课程费")}
            <strong>{feeAmount(fee, locale)}</strong>
          </span>
        );
      })}
    </span>
  );
}

export function CourseFees({
  course,
  locale,
  compact = false,
}: {
  course: CatalogCourse;
  locale: Locale;
  compact?: boolean;
}) {
  const fees = [
    ...new Map(
      [
        ...(course.fees ?? []),
        ...course.sections.flatMap((s) => s.fees ?? []),
      ].map((f) => [f.description, f]),
    ).values(),
  ];
  if (!fees.length) return null;
  const limit = compact ? 2 : 3;
  const sectionSpecific = fees.some(
    (f) => !(course.fees ?? []).some((v) => v.description === f.description),
  );
  return (
    <div
      className={`${styles.feeContainer}${compact ? "" : ` ${styles.fees}`}`}
      aria-label={text(locale, "Course fees", "课程费用")}
    >
      <FeePills fees={fees.slice(0, limit)} locale={locale} />
      {fees.length > limit ? (
        <details className={styles.moreFees}>
          <summary>
            +{fees.length - limit} {text(locale, "fees", "项费用")}
          </summary>
          <FeePills fees={fees.slice(limit)} locale={locale} />
        </details>
      ) : null}
      {sectionSpecific ? (
        <small>{text(locale, "Varies by section", "按班次收取")}</small>
      ) : null}
    </div>
  );
}
