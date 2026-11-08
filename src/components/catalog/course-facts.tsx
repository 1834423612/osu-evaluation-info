"use client";
import { useState } from "react";
import { Check, Copy, ReceiptText } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
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
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const [copied, setCopied] = useState(false);
  const ids = courseIdLabel(course);
  const credits =
    course.creditsMin === course.creditsMax
      ? String(course.creditsMin)
      : `${course.creditsMin}–${course.creditsMax}`;
  return (
    <span className={styles.identity}>
      <span>
        {credits} {text(locale, "credits", "学分")}
      </span>
      {ids ? (
        <span className={styles.identifier}>
          <span>
            courseId <code>{ids}</code>
          </span>
          <button
            type="button"
            title={text(locale, "Copy courseId", "复制 courseId")}
            aria-label={text(locale, "Copy courseId", "复制 courseId")}
            onClick={async (event) => {
              event.stopPropagation();
              try {
                await navigator.clipboard.writeText(ids);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              } catch {
                /* The visible code remains selectable. */
              }
            }}
          >
            {copied ? (
              <Check size={12} aria-hidden="true" />
            ) : (
              <Copy size={12} aria-hidden="true" />
            )}
          </button>
        </span>
      ) : (
        <span className={styles.pending}>
          {text(locale, "courseId loading…", "courseId 加载中…")}
        </span>
      )}
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
  const courseFees = course.fees ?? [];
  const fees = [
    ...new Map(
      [
        ...courseFees,
        ...course.sections.flatMap((section) => section.fees ?? []),
      ].map((fee) => [fee.description, fee]),
    ).values(),
  ];
  if (!fees.length) return null;
  if (compact)
    return (
      <div className={styles.feeSummary}>
        <ReceiptText size={13} aria-hidden="true" />
        {fees.slice(0, 2).map((fee) => (
          <span key={fee.description} title={fee.description}>
            {fee.kind === "textbook"
              ? text(locale, "Textbook", "教材费")
              : text(locale, "Course fee", "课程费")}{" "}
            {fee.amount === null
              ? text(locale, "See details", "见详情")
              : `$${fee.amount.toLocaleString("en-US", { minimumFractionDigits: fee.amount % 1 ? 2 : 0 })}`}
          </span>
        ))}
        {fees.length > 2 ? <span>+{fees.length - 2}</span> : null}
        <small>{text(locale, "Varies by section", "以对应班次为准")}</small>
      </div>
    );
  return (
    <div className={styles.fees}>
      <strong>
        <ReceiptText size={14} aria-hidden="true" />
        {text(
          locale,
          "Published course / section fees",
          "官方标注的课程／班次费用",
        )}
      </strong>
      <ul>
        {fees.map((fee) => (
          <li key={fee.description}>
            {fee.description}
            {!courseFees.some(
              (value) => value.description === fee.description,
            ) ? (
              <small>{text(locale, "Section-specific", "对应班次收取")}</small>
            ) : null}
          </li>
        ))}
      </ul>
      <p>
        {text(
          locale,
          "Campus-qualified fees are filtered for this campus. See each section for its listed charges; no total is inferred.",
          "已按当前校区筛选费用；各班次收费见对应条目，不将不同班次费用相加。",
        )}
      </p>
    </div>
  );
}
