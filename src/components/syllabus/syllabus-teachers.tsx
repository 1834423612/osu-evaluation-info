"use client";
import { useEffect, useRef, useState } from "react";
import { Star } from "lucide-react";
import { InstructorAvatar } from "@/components/people/instructor-avatar";
import { usePreferences } from "@/hooks/use-preferences";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { rmpPreviews } from "@/lib/rmp/preview-client";
import type { RmpInsight } from "@/lib/rmp/insights";
import type { CatalogCourse, CatalogInstructor } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-section-picker.module.css";

function Teacher({
  person,
  course,
  locale,
}: {
  person: CatalogInstructor;
  course: CatalogCourse;
  locale: Locale;
}) {
  const { savedInstructors, toggleInstructor } = usePreferences();
  const identity = nameDotNumberFromEmail(person.email);
  const saved = savedInstructors.some((item) =>
    identity
      ? (nameDotNumberFromEmail(item.email) ?? item.id) === identity
      : !item.email &&
        item.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
  );
  const ref = useRef<HTMLDivElement>(null);
  const key = JSON.stringify({
    subject: course.subject,
    catalogNumber: course.catalogNumber,
    campus: course.campusCode,
    usernames: identity ? [identity] : [],
  });
  const [state, setState] = useState<{
    key: string;
    insight: RmpInsight | null;
  } | null>(null);
  useEffect(() => {
    if (!ref.current || !identity) return;
    let active = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        void rmpPreviews.request(JSON.parse(key)).then((insight) => {
          if (active) setState({ key, insight });
        });
      },
      { rootMargin: "100px" },
    );
    observer.observe(ref.current);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [key, identity]);
  const insight = state?.key === key ? state.insight : null;
  return (
    <div
      ref={ref}
      className={styles.teacher}
      data-syllabus-teacher={person.name}
    >
      <InstructorAvatar name={person.name} email={person.email} size={24} />
      <div className={styles.teacherInfo}>
        <span className={styles.teacherName}>
          {person.name}
          {saved ? (
            <span className={styles.savedTeacher}>
              {text(locale, "Saved teacher", "已收藏教师")}
            </span>
          ) : null}
        </span>
        <span
          className={styles.tags}
          aria-label={text(
            locale,
            `RMP tags for ${person.name}`,
            `${person.name} 的 RMP 评价标签`,
          )}
        >
          <small>RMP</small>
          {insight?.tags.length ? (
            insight.tags.slice(0, 2).map((tag) => (
              <span
                key={tag.tag}
                title={text(
                  locale,
                  `${tag.count} student mentions · Unofficial`,
                  `${tag.count} 次学生提及 · 非官方评价`,
                )}
              >
                {tag.tag}
              </span>
            ))
          ) : (
            <small>
              {identity && state?.key !== key
                ? text(locale, "Loading tags…", "正在读取标签…")
                : insight?.status === "unavailable" || (identity && !insight)
                  ? text(locale, "Tags unavailable", "标签暂不可用")
                  : text(locale, "No review tags", "暂无评价标签")}
            </small>
          )}
        </span>
      </div>
      <button
        type="button"
        className={styles.iconButton}
        aria-pressed={saved}
        aria-label={text(
          locale,
          `${saved ? "Unsave" : "Save"} teacher ${person.name}`,
          `${saved ? "取消收藏" : "收藏"}教师 ${person.name}`,
        )}
        onClick={() => toggleInstructor(course, person)}
      >
        <Star size={13} fill={saved ? "currentColor" : "none"} />
      </button>
    </div>
  );
}
export function SyllabusTeachers({
  people,
  course,
  locale,
}: {
  people: CatalogInstructor[];
  course: CatalogCourse;
  locale: Locale;
}) {
  return (
    <div className={styles.teachers}>
      {people.length ? (
        people.map((person) => (
          <Teacher
            key={person.email ?? person.name}
            person={person}
            course={course}
            locale={locale}
          />
        ))
      ) : (
        <span className={styles.muted}>
          {text(locale, "Instructor TBA", "授课教师待定")}
        </span>
      )}
    </div>
  );
}
