"use client";
import { Star } from "lucide-react";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
import { useSyllabusTeachers } from "@/hooks/use-syllabus-teachers";
import {
  syllabusTeacherKey,
  teacherScoreTone,
  type SyllabusTeacherData,
  type SyllabusTeacherMap,
} from "@/lib/syllabus/teacher-data";
import { usePreferences } from "@/hooks/use-preferences";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import type { CatalogCourse, CatalogInstructor } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-section-picker.module.css";

function Teacher({
  person,
  course,
  locale,
  data,
}: {
  person: CatalogInstructor;
  course: CatalogCourse;
  locale: Locale;
  data: SyllabusTeacherData | undefined;
}) {
  const { savedInstructors, toggleInstructor } = usePreferences();
  const identity = nameDotNumberFromEmail(person.email);
  const saved = savedInstructors.some((item) =>
    identity
      ? (nameDotNumberFromEmail(item.email) ?? item.id) === identity
      : !item.email &&
        item.name.trim().toLowerCase() === person.name.trim().toLowerCase(),
  );
  const insight = data?.rmp;
  return (
    <div className={styles.teacher} data-syllabus-teacher={person.name}>
      <div className={styles.teacherInfo}>
        <div className={styles.teacherName}>
          <InstructorDirectoryIdentity
            name={person.name}
            email={person.email}
            subject={course.subject}
            locale={locale}
            size={24}
            showUnknownLabel
          />
          {saved ? (
            <span className={styles.savedTeacher}>
              {text(locale, "Saved teacher", "已收藏教师")}
            </span>
          ) : null}
        </div>
        <div
          className={styles.scores}
          aria-label={text(
            locale,
            `Scores for ${person.name}`,
            `${person.name} 的评分`,
          )}
        >
          {(["RMP", "SEI", "SSLE"] as const).map((source) => {
            const value =
              source === "RMP" ? insight?.quality : data?.[source]?.score;
            const count =
              source === "RMP"
                ? insight?.qualityCount
                : data?.[source]?.responseCount;
            return (
              <span
                key={source}
                className={styles.score}
                data-tone={teacherScoreTone(value)}
                title={text(
                  locale,
                  `${source} · Current course · ${source === "RMP" ? "Recent two years · Student reviews" : "Official response-weighted score"} · ${count ?? 0} responses`,
                  `${source} · 本课程 · ${source === "RMP" ? "近两年学生评价" : "官方按回答数量及时间加权"} · ${count ?? 0} 份回答`,
                )}
              >
                <span>{source}</span>
                <b>{value == null ? "—" : value.toFixed(2)}</b>
                <small>/ 5</small>
              </span>
            );
          })}
        </div>
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
              {identity && insight === undefined
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
  data,
}: {
  people: CatalogInstructor[];
  course: CatalogCourse;
  locale: Locale;
  data?: SyllabusTeacherMap;
}) {
  const loaded = useSyllabusTeachers(course, people, data === undefined);
  const teachers = data ?? loaded;
  return (
    <div className={styles.teachers}>
      {people.length ? (
        people.map((person) => (
          <Teacher
            key={person.email ?? person.name}
            person={person}
            course={course}
            locale={locale}
            data={teachers[syllabusTeacherKey(person)]}
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
