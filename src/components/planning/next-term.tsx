"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Plus, Sparkles } from "lucide-react";
import { courseSearchHref, type Plan } from "@/lib/planning/model";
import {
  recommendCourses,
  ratingRequest,
  type PublicSample,
  type Rating,
  type PlanningCandidate,
} from "@/lib/planning/recommendation";
import { text, type Locale } from "@/lib/i18n";
import styles from "./next-term.module.css";

export function NextTerm({
  plan,
  locale,
  apply,
  onReview,
}: {
  plan: Plan;
  locale: Locale;
  apply: (items: PlanningCandidate[], term: string) => void;
  onReview: () => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [programId, setProgramId] = useState("");
  const program =
    programId === "manual"
      ? undefined
      : (plan.programs.find((p) => p.id === programId) ??
        plan.programs.find((p) =>
          plan.requirements.some((r) => r.programId === p.id),
        ));
  const year = new Date().getUTCFullYear();
  const [currentTerm, setCurrentTerm] = useState("Autumn" + year);
  const [targetTerm, setTargetTerm] = useState("Spring" + (year + 1));
  const [maxCredits, setMaxCredits] = useState(15);
  const [maxQuantitative, setMaxQuantitative] = useState(2);
  const [prefixes, setPrefixes] = useState("MATH STAT PHYSICS CHEM CSE");
  const [samples, setSamples] = useState<PublicSample[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [sampleYear, setSampleYear] = useState(1);
  const [campus, setCampus] = useState("COL");
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/planning/curricula?samples=1", { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((data) => {
        if (!controller.signal.aborted) setSamples(data.samples);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setMessage(t("Public examples unavailable.", "公开样表暂不可用。"));
      });
    return () => {
      controller.abort();
      request.current?.abort();
    };
    // Language changes do not restart public fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  let result: ReturnType<typeof recommendCourses> | null = null;
  try {
    result = recommendCourses(plan, {
      programId: program?.id ?? "",
      currentTerm,
      targetTerm,
      maxCredits,
      maxQuantitative,
      quantitativeSubjects: prefixes.split(/[ ,]+/),
      sample: samples.find((s) => s.id === sampleId),
      sampleYear,
      ratings,
    });
  } catch {}
  async function lookupRatings() {
    if (!result) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ratingRequest(result.candidates, campus)),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(15000),
        ]),
      });
      if (!response.ok) throw Error();
      const data = await response.json();
      const next: Record<string, Rating> = {};
      for (const c of result.candidates.slice(0, 24)) {
        const metric = data.summaries?.[c.key]?.primary;
        if (
          metric &&
          ["SEI", "SSLE"].includes(metric.instrument) &&
          Number.isFinite(metric.score) &&
          Number.isFinite(metric.responseCount)
        )
          next[c.key] = {
            score: metric.score,
            responses: metric.responseCount,
            instrument: metric.instrument,
          };
      }
      if (controller.signal.aborted) return;
      setRatings(next);
      setMessage(
        Object.keys(next).length
          ? t("Ratings loaded for ", "已获取评分课程数：") +
              Object.keys(next).length
          : t(
              "No ratings available for these courses.",
              "这些课程暂无可用评分。",
            ),
      );
    } catch {
      if (!controller.signal.aborted)
        setMessage(
          t(
            "Ratings unavailable. Local ranking still works.",
            "评分暂不可用，本地排序仍可使用。",
          ),
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className={styles.root}>
      <div className={styles.heading}>
        <div>
          <span className={styles.eyebrow}>
            {t("NEXT SEMESTER", "下一学期")}
          </span>
          <h2>{t("Build a balanced shortlist", "组合适合你的候选课")}</h2>
          <p>
            {t(
              "Combine reviewed requirements, an optional official example, workload limits and course evaluations.",
              "结合已核对要求、可选官方样表、负担限制和课程评价。",
            )}
          </p>
        </div>
        <Sparkles size={30} />
      </div>
      <div className={styles.controls}>
        <label>
          {t("Program snapshot", "项目快照")}
          <select
            value={program?.id ?? "manual"}
            onChange={(e) => setProgramId(e.target.value)}
          >
            <option value="manual">
              {t("Manual plan only", "仅手动规划")}
            </option>
            {plan.programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code ?? t("Unlabelled program", "未命名项目")} ·{" "}
                {p.appliedVersion ?? "?"} ·{" "}
                {p.declaration === "declared"
                  ? t("declared", "已申报")
                  : p.declaration === "undeclared"
                    ? t("undeclared", "未申报")
                    : t("unknown", "未知")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Current semester", "当前学期")}
          <input
            value={currentTerm}
            onChange={(e) => setCurrentTerm(e.target.value)}
            placeholder="Autumn2026"
          />
        </label>
        <label>
          {t("Target semester", "目标学期")}
          <input
            value={targetTerm}
            onChange={(e) => setTargetTerm(e.target.value)}
            placeholder="Spring2027"
          />
        </label>
        <label>
          {t("Credit ceiling", "学分上限")}
          <input
            type="number"
            min="1"
            max="30"
            value={maxCredits}
            onChange={(e) => setMaxCredits(Number(e.target.value))}
          />
        </label>
        <label>
          {t("Official sample (optional)", "官方样表（可选）")}
          <select
            value={sampleId}
            onChange={(e) => setSampleId(e.target.value)}
          >
            <option value="">{t("No example selected", "未选择样表")}</option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label ?? s.program} · {t("pending review", "待核对")}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Sample year", "样表年级")}
          <select
            value={sampleYear}
            onChange={(e) => setSampleYear(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Limit these prefixes", "限制这些课程前缀")}
          <input
            value={prefixes}
            maxLength={150}
            onChange={(e) => setPrefixes(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          {t("Maximum courses with those prefixes", "这些前缀的课程数量上限")}
          <input
            type="number"
            min="0"
            max="8"
            value={maxQuantitative}
            onChange={(e) => setMaxQuantitative(Number(e.target.value))}
          />
        </label>
      </div>
      <div className={styles.notice}>
        {t(
          "Draft suggestions require prerequisite, session, seat and meeting-time checks. Prefix limits reflect your preference; evaluations do not measure difficulty. Unknown credits cannot enter the automatic combination.",
          "候选组合仍需核对先修、session、余位和上课时间。前缀限制由你设置；课程评价不等于难度。未知学分课程不进入自动组合。",
        )}
      </div>
      <div className={styles.ratingBar}>
        <label>
          {t("Evaluation campus", "评价校区")}
          <select
            value={campus}
            onChange={(e) => {
              request.current?.abort();
              setBusy(false);
              setCampus(e.target.value);
              setRatings({});
              setMessage("");
            }}
          >
            {["COL", "LMA", "MNS", "MRN", "NWK", "WST"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          disabled={busy || !result?.candidates.length}
          onClick={() => void lookupRatings()}
        >
          {busy
            ? t("Loading…", "加载中…")
            : t("Load ratings for top 24", "查询前 24 门的评分")}
        </button>
        <p>
          {t(
            "Sends only those course codes and campus to this site's evaluation service.",
            "仅向本站评价服务发送这些课程代码和校区。",
          )}
        </p>
      </div>
      {message && <p role="status">{message}</p>}
      {!result ? (
        <p role="alert">
          {t(
            "Use semester labels such as Autumn2026 and choose a later target; check workload limits.",
            "请使用 Autumn2026 格式，目标须晚于当前学期，并检查负担限制。",
          )}
        </p>
      ) : (
        <>
          <div className={styles.bundle}>
            <div>
              <h3>{t("Draft combination", "候选组合")}</h3>
              <strong>
                {result.credits} / {maxCredits} {t("credits", "学分")}
              </strong>
              <p>
                {result.bundle.map((c) => c.key).join(" · ") ||
                  t(
                    "Add course evidence or select an example to start.",
                    "添加课程依据或选择样表后开始。",
                  )}
              </p>
            </div>
            <button
              disabled={!result.bundle.length}
              onClick={() => apply(result!.bundle, targetTerm)}
            >
              <Plus size={16} />
              {t("Add combination to board", "将组合加入看板")}
            </button>
          </div>
          <div className={styles.cards}>
            {result.candidates.slice(0, 60).map((c) => (
              <article key={c.key} className={styles.card}>
                <div className={styles.cardTop}>
                  <h3>{c.key}</h3>
                  <span>
                    {Math.round(c.score)} {t("points", "分")}
                  </span>
                </div>
                <strong>
                  {c.credits ?? "?"} {t("credits", "学分")}
                </strong>
                <ul>
                  {c.ruleIds.length > 0 && (
                    <li>
                      {t(
                        "Matches reviewed requirement options",
                        "匹配已核对要求的可选课程",
                      )}
                    </li>
                  )}
                  {c.unreviewed && (
                    <li>
                      {t(
                        "Unreviewed requirement candidate",
                        "尚未核对的要求候选",
                      )}
                    </li>
                  )}
                  {c.sample && (
                    <li>
                      {c.sampleMatch
                        ? t(
                            "Matches the selected sample semester",
                            "匹配所选样表学期",
                          )
                        : t(
                            "Appears elsewhere in the sample",
                            "出现在样表其他学期",
                          )}
                    </li>
                  )}
                  {c.planned && (
                    <li>
                      {t(
                        "Appears in your planned observations",
                        "已出现在计划课程记录中",
                      )}
                    </li>
                  )}
                  {c.conflict && (
                    <li>
                      {t(
                        "Conflicting observations; excluded from combination",
                        "记录存在冲突，未加入自动组合",
                      )}
                    </li>
                  )}
                  <li>
                    {c.rating
                      ? `${c.rating.instrument} ${c.rating.score.toFixed(2)} / 5 · n=${c.rating.responses}`
                      : t("Evaluation unknown", "评分未知")}
                  </li>
                </ul>
                <div className={styles.actions}>
                  <button onClick={() => apply([c], targetTerm)}>
                    <Plus size={15} />
                    {t("Add draft", "加入草稿")}
                  </button>
                  <a
                    href={
                      courseSearchHref({
                        subject: c.subject,
                        number: c.number,
                        kind: "course",
                        credits: c.credits,
                        status: "planned",
                        page: null,
                      }) ?? undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("Check course / sessions", "核对课程 / sessions")}
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <details className={styles.methods}>
        <summary>{t("Scoring and evidence", "排序与依据")}</summary>
        <p>
          {t(
            "Reviewed requirement option +45; unreviewed option +15; matching sample semester +25, another sample semester +8; existing planned course +10; evaluation 0–15 using (score × responses + 3.6 × 20) / (responses + 20); conflicting observations −20. Missing ratings receive a neutral ranking baseline and remain labelled unknown. Instruments are never pooled. A 128-state beam search proposes a workload-limited combination; it does not guarantee the optimum or degree applicability.",
            "已核对要求可选课 +45；未核对候选 +15；对应样表学期 +25，其他样表学期 +8；已有计划记录 +10；评价按 (评分 × 回答数 + 3.6 × 20) / (回答数 + 20) 收缩后计 0–15 分；记录冲突 −20。缺失评价使用中性排序基准，仍显示未知。不同评价工具不混合。保留 128 个状态的束搜索提供受负担限制的组合，不保证全局最优或毕业适用性。",
          )}
        </p>
        <p>
          {t(
            "Samples are pending human review, may omit GE or electives, and have not been matched to your Applied Version. Choose the relevant document with your advisor.",
            "样表尚待人工核对，可能省略通识或选修，且尚未与你的 Applied Version 匹配。请和顾问选择适用文件。",
          )}
        </p>
        {samples.find((s) => s.id === sampleId) && (
          <a
            href={samples.find((s) => s.id === sampleId)!.url}
            target="_blank"
            rel="noreferrer"
          >
            {t("Open selected official source", "打开所选官方来源")}
          </a>
        )}
        <button onClick={onReview}>
          {t("Review requirement evidence", "核对要求依据")}
        </button>
      </details>
    </section>
  );
}
