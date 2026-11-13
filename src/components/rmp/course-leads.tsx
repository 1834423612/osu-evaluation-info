"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { useRmpResource } from "@/hooks/use-rmp-resource";
import { text, type Locale } from "@/lib/i18n";
import type { RmpCourseLeads } from "@/lib/rmp/course-leads";
import { rating } from "./library-shared";
import styles from "./course-leads.module.css";
export function CourseRmpLeads({
  query,
  locale,
}: {
  query: string;
  locale: Locale;
}) {
  const [offset, setOffset] = useState(0);
  const { data, loading, error, retry } = useRmpResource<RmpCourseLeads>(
    `/api/rmp/course/leads?${query}&offset=${offset}`,
  );
  return (
    <section
      className={styles.section}
      data-rmp-leads
      aria-label={text(locale, "Other course reviews", "其他课程评价")}
    >
      <header>
        <h4>
          {text(locale, "Other RMP profiles", "其他 RMP 档案")}
          {data?.total ? <small>{data.total}</small> : null}
        </h4>
        <Link href="/rmp" target="_blank">
          {text(locale, "Faculty library", "教师库")}
          <ArrowUpRight size={12} />
        </Link>
      </header>
      <p className={styles.note}>
        {text(
          locale,
          "Course labels match; identity or official teaching history is unconfirmed. These ratings stay separate.",
          "课程标注匹配，官方身份或任课记录待确认；评分单独展示。",
        )}
      </p>
      {loading ? (
        <p className={styles.note} role="status">
          {text(locale, "Checking saved profiles…", "正在查找其他档案…")}
        </p>
      ) : error ? (
        <p className={styles.note} role="alert">
          {text(
            locale,
            "Could not load related profiles.",
            "相关档案暂不可用。",
          )}{" "}
          <button onClick={retry}>{text(locale, "Retry", "重试")}</button>
        </p>
      ) : !data?.profiles.length ? (
        <p className={styles.note}>
          {text(
            locale,
            "No other course-labeled profiles.",
            "暂无其他匹配本课程标注的档案。",
          )}
        </p>
      ) : null}
      {data?.profiles.map((p) => (
        <article className={styles.card} key={p.id} data-rmp-lead={p.id}>
          <div className={styles.title}>
            <strong>{p.name}</strong>
            <span>
              <AlertTriangle size={11} />
              {p.username
                ? text(locale, "Teaching link unconfirmed", "任课关联待确认")
                : text(locale, "Identity unconfirmed", "身份待确认")}
            </span>
          </div>
          <p className={styles.department}>
            {p.department} · {p.campuses.join(" / ")}
            {p.username ? ` · ${p.username}` : ""}
          </p>
          <div className={styles.scores}>
            <span>
              {text(locale, "This course on RMP", "RMP 本课程")}{" "}
              <b>{rating(p.courseQuality)}</b>/5
            </span>
            <span>
              {text(locale, "Difficulty", "难度")} {rating(p.courseDifficulty)}
              /5
            </span>
            <span>
              {p.courseReviewCount} {text(locale, "reviews", "条评价")}
            </span>
          </div>
          <div className={styles.links}>
            <span>{text(locale, "RMP labels", "RMP 标注")}</span>
            {p.courseLabels.map((code) => (
              <Link
                key={code}
                href={`/rmp/${p.id}?course=${encodeURIComponent(code)}`}
                target="_blank"
                rel="noopener"
              >
                {code}
                <ArrowUpRight size={11} />
              </Link>
            ))}
            <Link href={`/rmp/${p.id}`} target="_blank" rel="noopener">
              {text(locale, "All course reviews", "全部课程评价")}
              <ArrowUpRight size={11} />
            </Link>
          </div>
        </article>
      ))}
      {data && (offset > 0 || data.nextOffset !== null) ? (
        <nav
          className={styles.pagination}
          aria-label={text(locale, "Other profile pages", "其他档案分页")}
        >
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 24))}
          >
            {text(locale, "Previous", "上一页")}
          </button>
          <span>{Math.floor(offset / 24) + 1}</span>
          <button
            disabled={data.nextOffset === null}
            onClick={() => setOffset(data.nextOffset ?? offset)}
          >
            {text(locale, "Next", "下一页")}
          </button>
        </nav>
      ) : null}
    </section>
  );
}
