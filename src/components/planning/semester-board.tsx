"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Plus,
  CalendarDays,
  LockKeyhole,
  GripVertical,
} from "lucide-react";
import { courseSearchHref, type Plan } from "@/lib/planning/model";
import {
  placeCourse,
  scheduledTerm,
  semesterCredits,
  termOrder,
} from "@/lib/planning/schedule";
import { text, type Locale } from "@/lib/i18n";
import styles from "./semester-board.module.css";
type Props = {
  plan: Plan;
  locale: Locale;
  update: (fn: (p: Plan) => Plan) => void;
  onReview: () => void;
};
export function SemesterBoard({ plan, locale, update, onReview }: Props) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [source, setSource] = useState("");
  const [query, setQuery] = useState("");
  const [season, setSeason] = useState("Autumn");
  const [year, setYear] = useState(new Date().getFullYear());
  const [target, setTarget] = useState(18);
  const [message, setMessage] = useState("");
  const all = plan.semesters.flatMap((s) =>
    s.courses
      .filter((c) => c.evidenceRole !== "option")
      .map((c) => ({
        course: c,
        source: c.documentId ?? s.documentId,
        original: s.term,
        origin: s.creditOrigin,
        term: ["transfer", "exam"].includes(s.creditOrigin ?? "")
          ? "credit"
          : ((c.id ? scheduledTerm(plan, c.id, s.term) : s.term)?.replace(
              / /g,
              "",
            ) ?? "unassigned"),
      })),
  );
  const rows = all.filter(
    (r) =>
      (!source || r.source === source) &&
      `${r.course.subject ?? ""} ${r.course.number ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const terms = [
    ...new Set([
      ...plan.schedule.terms,
      ...all
        .filter((r) => !["credit", "unassigned"].includes(r.term))
        .map((r) => r.term),
    ]),
  ].sort(termOrder);
  function move(id: string, term: string) {
    try {
      update((p) => placeCourse(p, id, term === "unassigned" ? null : term));
      setMessage(
        t(
          "Course placement updated. Imported semester retained in source review.",
          "已更新课程安排，导入的原始学期保留在来源核对中。",
        ),
      );
    } catch {
      setMessage(
        t(
          "Check this course in source review before moving it.",
          "请先在来源核对中检查这门课程。",
        ),
      );
    }
  }
  const termLabel = (term: string) =>
    term === "unassigned"
      ? t("To arrange", "待安排")
      : term === "credit"
        ? t("Transfer & exam credit", "转学分与考试学分")
        : locale === "zh"
          ? term
              .replace("Autumn", "秋季 ")
              .replace("Spring", "春季 ")
              .replace("Summer", "夏季 ")
          : term.replace(/(\D+)(\d+)/, "$1 $2");
  return (
    <section
      className={styles.root}
      aria-label={t("Semester board", "学期看板")}
    >
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            {t("PLAN YOUR PATH", "安排你的路径")}
          </span>
          <h2>{t("A semester at a time.", "一学期，一步向前。")}</h2>
          <p>
            {t(
              "Move a card with its semester menu, or drag it on desktop. Review imported facts before using credit totals.",
              "通过课程上的学期菜单移动课程，电脑端也支持拖放。使用学分汇总前请核对导入记录。",
            )}
          </p>
        </div>
        <button onClick={onReview}>
          {t("Review sources", "核对来源")} <ArrowUpRight size={16} />
        </button>
      </div>
      <div className={styles.toolbar}>
        <label>
          {t("Course prefix or number", "课程前缀或课号")}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="CSE 2221"
          />
        </label>
        <label>
          {t("Source", "来源")}
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t("All observations", "全部课程记录")}</option>
            {plan.documents.map((d, i) => (
              <option value={d.id} key={d.id}>
                {i + 1} · {d.source}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("My credit target", "我的学分目标")}
          <input
            type="number"
            min={1}
            max={40}
            value={target}
            onChange={(e) => setTarget(Number(e.target.value))}
          />
        </label>
      </div>
      <form
        className={styles.addTerm}
        onSubmit={(e) => {
          e.preventDefault();
          const term = season + year;
          if (
            !/^(Autumn|Spring|Summer)20\d{2}$/.test(term) ||
            terms.includes(term) ||
            plan.schedule.terms.length >= 24
          ) {
            setMessage(
              t(
                "Choose a new semester between 2000 and 2099.",
                "请选择 2000 至 2099 年之间的新学期。",
              ),
            );
            return;
          }
          update((p) => ({
            ...p,
            schedule: {
              ...p.schedule,
              terms: [...p.schedule.terms, term].sort(termOrder),
            },
          }));
          setMessage(t("Semester added.", "已添加学期。"));
        }}
      >
        <CalendarDays size={18} />
        <label>
          <span className={styles.srOnly}>
            {t("New semester season", "新学期季节")}
          </span>
          <select value={season} onChange={(e) => setSeason(e.target.value)}>
            {["Autumn", "Spring", "Summer"].map((s, i) => (
              <option key={s} value={s}>
                {locale === "zh" ? ["秋季", "春季", "夏季"][i] : s}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.srOnly}>
            {t("New semester year", "新学期年份")}
          </span>
          <input
            type="number"
            min={2000}
            max={2099}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </label>
        <button type="submit">
          <Plus size={16} />
          {t("Add semester", "添加学期")}
        </button>
      </form>
      {!all.length && (
        <div className={styles.empty}>
          <CalendarDays size={34} />
          <h3>{t("Your path starts with a course", "从一门课程开始规划")}</h3>
          <p>
            {t(
              "Import a Student Plan, or add a course from the official curriculum directory.",
              "导入 Student Plan，或从官方培养方案目录添加课程。",
            )}
          </p>
          <button onClick={onReview}>{t("Import a plan", "导入规划")}</button>
        </div>
      )}
      <div className={styles.board}>
        {[
          "unassigned",
          ...terms,
          ...(rows.some((r) => r.term === "credit") ? ["credit"] : []),
        ].map((term) => {
          const group = rows.filter((r) => r.term === term),
            credits = semesterCredits(group.map((r) => r.course));
          return (
            <section
              key={term}
              className={styles.column}
              onDragOver={(e) => {
                if (term !== "credit") e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (term !== "credit")
                  move(e.dataTransfer.getData("text/plain"), term);
              }}
              aria-label={termLabel(term)}
            >
              <div className={styles.columnHead}>
                <h3>{termLabel(term)}</h3>
                <span>{group.length}</span>
              </div>
              <p
                className={styles.credits}
                data-over={
                  term !== "credit" &&
                  term !== "unassigned" &&
                  target > 0 &&
                  credits.known > target
                }
              >
                {credits.known} {t("known credits", "已知学分")}
                {credits.unknown
                  ? ` + ${credits.unknown} ${t("unknown", "待定")}`
                  : ""}
                {term !== "credit" &&
                term !== "unassigned" &&
                target > 0 &&
                credits.known > target
                  ? ` · ${t("Above your target", "超过你的目标")}`
                  : ""}
              </p>
              {!group.length && (
                <p className={styles.dropHint}>
                  {t(
                    "Drop a course here or use a card’s semester menu.",
                    "拖入课程，或使用课程的学期菜单。",
                  )}
                </p>
              )}
              {group.map((r, i) => {
                const c = r.course,
                  locked =
                    c.status === "completed" || term === "credit" || !c.id;
                const href = courseSearchHref(c);
                return (
                  <article
                    className={styles.card}
                    key={c.id ?? i}
                    draggable={!locked}
                    onDragStart={(e) => {
                      if (c.id) e.dataTransfer.setData("text/plain", c.id);
                    }}
                    data-placeholder={c.kind === "placeholder"}
                  >
                    <div className={styles.cardTop}>
                      <span className={styles.code}>
                        <b>{c.subject ?? t("Requirement", "要求")}</b>{" "}
                        {c.number}
                      </span>
                      {locked ? (
                        <LockKeyhole size={14} />
                      ) : (
                        <GripVertical size={16} />
                      )}
                    </div>
                    <div className={styles.facts}>
                      <span>
                        {c.credits ?? "—"} {t("credits", "学分")}
                      </span>
                      <span>
                        {c.kind === "placeholder"
                          ? t("Placeholder", "占位项")
                          : t(
                              c.status,
                              {
                                planned: "计划",
                                completed: "已完成",
                                "in-progress": "进行中",
                                unknown: "待核对",
                              }[c.status],
                            )}
                      </span>
                    </div>
                    <small>
                      {t("Source", "来源")}{" "}
                      {r.source
                        ? plan.documents.findIndex((d) => d.id === r.source) + 1
                        : t("Manual", "手动")}
                      {c.page ? ` · ${t("p.", "页")} ${c.page}` : ""}
                    </small>
                    {!locked && (
                      <label className={styles.move}>
                        <span>{t("Semester", "安排学期")}</span>
                        <select
                          aria-label={`${t("Move", "移动")} ${c.subject ?? ""} ${c.number ?? t("placeholder", "占位项")}`}
                          value={term}
                          onChange={(e) => move(c.id!, e.target.value)}
                        >
                          <option value="unassigned">
                            {termLabel("unassigned")}
                          </option>
                          {terms.map((s) => (
                            <option key={s} value={s}>
                              {termLabel(s)}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                    {href && (
                      <a href={href} target="_blank" rel="noreferrer">
                        {t("Course & ratings", "课程与评分")}
                        <ArrowUpRight size={14} />
                      </a>
                    )}
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>
      <p className={styles.message} role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
