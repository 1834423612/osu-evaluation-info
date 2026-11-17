"use client";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  Plus,
  Search,
} from "lucide-react";
import type { z } from "zod";
import type { curriculumSchema } from "@/lib/planning/curriculum";
import { creditLabel } from "@/lib/planning/course-catalog";
import { text, type Locale } from "@/lib/i18n";
import styles from "./sample-gallery.module.css";
type Code = { subject: string; number: string };
type Sample = Omit<z.infer<typeof curriculumSchema>, "semesters"> & {
  college: string;
  comparison: string | null;
  downloadUrl: string | null;
  semesters: {
    label: string;
    credits: { min: number; max: number } | null;
    entries: {
      evidence: string;
      credits: { min: number; max: number } | null;
      courses: Code[];
    }[];
  }[];
};

export function SampleGallery({
  locale,
  addCourse,
}: {
  locale: Locale;
  addCourse: (course: Code) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/planning/curricula?gallery=1", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const data = await response.json();
        if (!controller.signal.aborted) {
          setSamples(data.samples);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const selected = samples.find((sample) => sample.id === selectedId);
  return (
    <section className={styles.root}>
      <header className={styles.heading}>
        <div>
          <h2>{t("Four-year sample schedules", "四年示例课表")}</h2>
          <p>
            {t(
              "Explore semester-by-semester sequencing. Use your BDP audit for your own degree requirements.",
              "参考各学期的课程顺序，个人毕业要求以导入的 BDP 审核为依据。",
            )}
          </p>
        </div>
        <span>
          {samples.length} {t("samples available", "份可用示例")}
        </span>
      </header>
      {error && (
        <button onClick={() => setAttempt((n) => n + 1)}>
          {t("Retry loading examples", "重新加载示例")}
        </button>
      )}
      {!samples.length && !error && (
        <p role="status">{t("Loading examples…", "正在加载示例…")}</p>
      )}
      {selected ? (
        <>
          <button className={styles.back} onClick={() => setSelectedId("")}>
            <ArrowLeft size={16} />
            {t("All examples", "所有示例")}
          </button>
          <div className={styles.sampleHeading}>
            <div>
              <p>{selected.college}</p>
              <h3>{selected.program}</h3>
              {selected.specialization && <p>{selected.specialization}</p>}
              <p>
                {selected.academicYear} {selected.campus}{" "}
                {selected.scheduleScope === "major-sequence"
                  ? t("Major course sequence", "专业课程顺序示例")
                  : ""}
              </p>
              <span>
                {selected.geSystem ??
                  t("GE version unspecified", "未注明 GE 版本")}{" "}
                · {t("Retrieved", "获取于")}{" "}
                {selected.source.fetchedAt.slice(0, 10)}
              </span>
            </div>
            <div className={styles.links}>
              <a href={selected.source.url} target="_blank" rel="noreferrer">
                {t("Official source", "官方来源")}
                <ArrowUpRight size={15} />
              </a>
              {selected.downloadUrl && (
                <a href={selected.downloadUrl} target="_blank" rel="noreferrer">
                  {t("Download original", "下载原件")}
                  <ArrowUpRight size={15} />
                </a>
              )}
            </div>
          </div>
          {selected.comparison && (
            <p className={styles.note}>
              <strong>{t("Source difference: ", "原件差异：")}</strong>
              {selected.comparison}
            </p>
          )}
          <p className={styles.note}>
            {t(
              "Source totals may include conditional choices. Confirm prerequisites, your catalog year and remaining BDP requirements before adding courses.",
              "来源总学分可能包含条件选项。添加前请核对先修要求、适用年份和 BDP 中尚未满足的要求。",
            )}
          </p>
          <div className={styles.semesters}>
            {selected.semesters.map((semester) => (
              <section key={semester.label} className={styles.semester}>
                <header>
                  <h4>{semester.label}</h4>
                  <span>
                    {creditLabel(semester.credits)}{" "}
                    {t("source credits", "原表学分")}
                  </span>
                </header>
                <ul>
                  {semester.entries.map((entry, index) => (
                    <li key={index}>
                      <p>{entry.evidence}</p>
                      {entry.courses.length > 0 && (
                        <div className={styles.choices}>
                          {entry.courses.map((course) => (
                            <button
                              key={course.subject + course.number}
                              onClick={() => addCourse(course)}
                              aria-label={`${t("Add", "添加")} ${course.subject} ${course.number}`}
                            >
                              <Plus size={13} />
                              {course.subject} {course.number}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <details className={styles.evidence}>
            <summary>
              {t("Source structure & version", "来源结构与版本")}
            </summary>
            {selected.evidence.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
            <code>{selected.version}</code>
          </details>
        </>
      ) : (
        <>
          <label className={styles.search}>
            <Search size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Find a major or college", "搜索专业或学院")}
              aria-label={t("Find a sample schedule", "查找示例课表")}
            />
          </label>
          <div className={styles.samples}>
            {samples
              .filter((sample) =>
                (
                  sample.program +
                  " " +
                  sample.college +
                  " " +
                  (sample.specialization ?? "")
                )
                  .toLowerCase()
                  .includes(query.trim().toLowerCase()),
              )
              .map((sample) => (
                <button
                  key={sample.id}
                  className={styles.sample}
                  onClick={() => setSelectedId(sample.id)}
                >
                  <span className={styles.college}>{sample.college}</span>
                  <h3>{sample.program}</h3>
                  {sample.specialization && <p>{sample.specialization}</p>}
                  <p>
                    {sample.academicYear} {sample.geSystem}{" "}
                    {sample.scheduleScope === "major-sequence"
                      ? t("Major sequence", "专业课顺序")
                      : ""}
                  </p>
                  {sample.evidence.find((line) => /^Example \d/.test(line)) && (
                    <p>
                      {sample.evidence.find((line) => /^Example \d/.test(line))}
                    </p>
                  )}
                  <footer>
                    <span>
                      <CalendarDays size={15} />
                      {sample.semesters.length} {t("semesters", "个学期")}
                    </span>
                    <span>
                      {t("View schedule", "查看课表")}
                      <ArrowUpRight size={15} />
                    </span>
                  </footer>
                </button>
              ))}
          </div>
          <p className={styles.note}>
            {t(
              "Coverage is expanding. Majors without an inspected semester schedule are omitted from this gallery.",
              "示例正在持续补充，当前列表仅展示已检查且具有明确学期安排的专业。",
            )}
          </p>
        </>
      )}
    </section>
  );
}
