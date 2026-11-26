"use client";
import { useEffect, useState } from "react";
import { MessageSquareText, ShieldCheck } from "lucide-react";
import type { CatalogCourse } from "@/lib/catalog/types";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { text, type Locale } from "@/lib/i18n";
import type { RmpInsight } from "@/lib/rmp/insights";
import { rmpPreviews } from "@/lib/rmp/preview-client";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Both sources stay visible, with their own sample units and identity context. */
export function EvaluationSourcePicker({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const usernames = [
    ...new Set([
      ...course.sections.flatMap((section) =>
        section.instructors.flatMap((instructor) => {
          const identity = nameDotNumberFromEmail(instructor.email);
          return identity ? [identity] : [];
        }),
      ),
      ...(course.evaluation?.instructors.flatMap((instructor) =>
        instructor.nameDotNumber ? [instructor.nameDotNumber] : [],
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
  const [result, setResult] = useState<{
    key: string;
    insight: RmpInsight | null;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void rmpPreviews.request(JSON.parse(key)).then((insight) => {
      if (active) setResult({ key, insight });
    });
    return () => {
      active = false;
    };
  }, [key]);
  const metric = course.evaluation?.primary;
  const loaded = result?.key === key;
  const insight = loaded ? result.insight : null;
  const t = (en: string, zh: string) => text(locale, en, zh);
  const count = (value: number) =>
    value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  const rmpCount = !loaded
    ? t("Loading review count…", "正在读取评论数量…")
    : insight?.status === "available"
      ? insight.identityBasis === "unconfirmed"
        ? t(
            `${count(insight.reviewCount)} unconfirmed reviews`,
            `${count(insight.reviewCount)} 条待确认评论`,
          )
        : t(
            `${count(insight.reviewCount)} reviews · course history`,
            `${count(insight.reviewCount)} 条评论 · 历届教师`,
          )
      : insight?.status === "no-data"
        ? t("No matching student reviews", "暂无对应学生评论")
        : t("Review count unavailable", "评论数量暂不可用");
  return (
    <TabsList aria-label={t("Evaluation source", "评价来源")}>
      <TabsTrigger value="official">
        <ShieldCheck size={17} aria-hidden="true" />
        <span className="rating-source-label">
          <strong>{t("OSU official", "OSU 官方评价")}</strong>
          <small>
            {metric
              ? `${metric.instrument} · ${count(metric.responseCount)} ${t("responses", "份回答")}`
              : course.evaluation?.status === "no-data"
                ? t("No published evaluations", "暂无公开评价")
                : t("Evaluation count unavailable", "评价数量暂不可用")}
          </small>
        </span>
      </TabsTrigger>
      <TabsTrigger value="rmp">
        <MessageSquareText size={17} aria-hidden="true" />
        <span className="rating-source-label">
          <strong>{t("RMP student reviews", "RMP 学生评论")}</strong>
          <small>{rmpCount}</small>
        </span>
      </TabsTrigger>
    </TabsList>
  );
}
