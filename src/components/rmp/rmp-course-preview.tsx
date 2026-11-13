"use client";
import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { Gauge, MessageCircle } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import type { RmpInsight } from "@/lib/rmp/insights";
import { rmpPreviews } from "@/lib/rmp/preview-client";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import { RmpWordCloud } from "./rmp-word-cloud";
import styles from "./rmp-course-preview.module.css";

export function RmpCoursePreview({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<{
    key: string;
    value: RmpInsight | null;
  } | null>(null);
  const usernames = [
    ...new Set([
      ...course.sections.flatMap((section) =>
        section.instructors.flatMap((instructor) => {
          const name = nameDotNumberFromEmail(instructor.email);
          return name ? [name] : [];
        }),
      ),
      ...(course.evaluation?.instructors.flatMap((item) =>
        item.nameDotNumber ? [item.nameDotNumber] : [],
      ) ?? []),
    ]),
  ]
    .sort()
    .slice(0, 120);
  const key = JSON.stringify({
    subject: course.subject,
    catalogNumber: course.catalogNumber,
    campus: course.campusCode,
    usernames,
    instructorScope: "course-history",
  });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        const input = JSON.parse(key);
        void rmpPreviews.request(input).then((value) => {
          if (!cancelled) setState({ key, value });
        });
      },
      { rootMargin: "250px" },
    );
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [key]);
  const insight = state?.key === key ? state.value : null;
  const difficulty = insight?.difficulty ?? null;
  return (
    <div className={styles.preview} ref={ref} data-rmp-preview>
      <div className={styles.heading}>
        <span>
          <MessageCircle size={12} aria-hidden="true" />
          RMP <small>{text(locale, "Student voices", "学生评价")}</small>
        </span>
        {insight?.status === "available" ? (
          <span className={styles.coverage}>
            {insight.matchedInstructorCount}{" "}
            {text(locale, "instructors", "位教师")} · {insight.reviewCount}{" "}
            {text(locale, "reviews", "条评价")}
          </span>
        ) : null}
      </div>
      {insight?.status === "available" ? (
        <>
          <div
            className={styles.difficulty}
            data-period={insight.difficultyPeriod}
          >
            <Gauge size={13} aria-hidden="true" />
            <span>{text(locale, "Difficulty", "课程难度")}</span>
            <strong>
              {difficulty === null ? "—" : difficulty.toFixed(1)}
              <small> / 5</small>
            </strong>
            <span className={styles.meter} aria-hidden="true">
              <i
                style={{
                  width: `${difficulty === null ? 0 : ((difficulty - 1) / 4) * 100}%`,
                }}
              />
            </span>
            <small>
              {difficulty === null
                ? text(locale, "No recent ratings", "暂无近期评分")
                : insight.difficultyPeriod === "historical"
                  ? text(
                      locale,
                      `${insight.difficultyCount} all-time · May be outdated`,
                      `${insight.difficultyCount} 条历史 · 可能过时`,
                    )
                  : text(
                      locale,
                      `${insight.difficultyCount} ratings · 2 years`,
                      `近两年 ${insight.difficultyCount} 条`,
                    )}
            </small>
          </div>
          {insight.tags.length ? (
            <RmpWordCloud tags={insight.tags} locale={locale} seed={key} />
          ) : (
            <p className={styles.empty}>
              {text(locale, "No review tags yet", "暂无评价标签")}
            </p>
          )}
          <p className={styles.note}>
            {text(
              locale,
              "Student opinions · Not official OSU evaluations",
              "学生主观评价 · 非 OSU 官方教学评价",
            )}
          </p>
        </>
      ) : (
        <div className={styles.empty}>
          {state?.key !== key
            ? text(locale, "Loading student voices…", "正在汇总学生评价…")
            : insight?.status === "unavailable" ||
                (state?.key === key && state.value === null)
              ? text(
                  locale,
                  "RMP reviews are temporarily unavailable",
                  "RMP 评价暂不可用",
                )
              : text(locale, "No verified reviews yet", "暂无已确认评价")}
          {state?.key === key && insight?.status !== "unavailable" ? (
            <Link
              className={styles.libraryLink}
              href={{
                pathname: "/rmp",
                query: {
                  q: `${course.subject}${course.catalogNumber}`,
                  campus: course.campusCode,
                },
              }}
            >
              {text(locale, "Search other RMP profiles", "查找其他 RMP 档案")}
            </Link>
          ) : null}
        </div>
      )}
    </div>
  );
}
