"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";
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
import { usePlanningCatalog } from "./course-catalog";
import {
  planningPrograms,
  programRequirements,
  requirementCodes,
} from "@/lib/planning/programs";
import { readRequirementCourses } from "@/lib/planning/requirement-catalog";
import { requirementSearch } from "@/lib/planning/requirement-search";
import { requirementProgress } from "@/lib/planning/snapshots";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import {
  boardCourses,
  nextSemester,
  currentSemester,
} from "@/lib/planning/workspace";

export function NextTerm({
  plan,
  locale,
  apply,
  onReview,
  initialTarget,
  onTargetChange,
  compact = false,
  inspect,
}: {
  plan: Plan;
  locale: Locale;
  apply: (items: PlanningCandidate[], term: string) => void;
  onReview: () => void;
  initialTarget?: string;
  onTargetChange?: (term: string) => void;
  compact?: boolean;
  inspect?: (course: { subject: string; number: string }) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [programId, setProgramId] = useState("");
  const programs = planningPrograms(plan);
  const major = (p: Plan["programs"][number]) =>
    /-(BA|BS|MN)$/.test(p.code ?? "");
  const program =
    programId === "manual"
      ? undefined
      : (programs.find((p) => p.id === programId) ??
        programs.find(
          (p) =>
            major(p) &&
            plan.documents.some(
              (d) => d.id === p.documentId && d.auditMode === "planned",
            ),
        ) ??
        programs.find(major) ??
        programs[0]);
  const [currentTerm, setCurrentTerm] = useState(currentSemester);
  const [localTarget, setLocalTarget] = useState(nextSemester);
  const targetTerm = initialTarget ?? localTarget;
  const setTargetTerm = onTargetChange ?? setLocalTarget;
  const catalog = usePlanningCatalog();
  const catalogScope = catalog.campus + "|" + catalog.term;
  const [catalogState, setCatalogState] = useState<{
    scope: string;
    credits: Record<string, { min: number; max: number; title?: string }>;
  }>({ scope: "", credits: {} });
  const [maxCredits, setMaxCredits] = useState(15);
  const [maxQuantitative, setMaxQuantitative] = useState(2);
  const [prefixes, setPrefixes] = useState("MATH STAT PHYSICS CHEM CSE");
  const [samples, setSamples] = useState<PublicSample[]>([]);
  const [sampleId, setSampleId] = useState("");
  const [sampleYear, setSampleYear] = useState(1);
  const [campus, setCampus] = useState("COL");
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const [visibleCount, setVisibleCount] = useState(12);
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
  const categoryRules = programRequirements(plan, program?.id ?? "").filter(
    (r) =>
      !requirementCodes(r).length &&
      requirementSearch(r.title ?? "") &&
      requirementProgress(plan, r.id).state !== "satisfied",
  );
  const categoriesKey = JSON.stringify(
    categoryRules.map((r) => [r.id, r.title]),
  );
  const candidateScope = catalogScope + "|" + categoriesKey;
  const [categoryState, setCategoryState] = useState<{
    scope: string;
    rules: Record<string, { subject: string; number: string }[]>;
  }>({ scope: "", rules: {} });
  useEffect(() => {
    const rows = JSON.parse(categoriesKey) as [string, string][];
    if (!rows.length) return;
    const controller = new AbortController();
    const titles = [...new Set(rows.map(([, title]) => title))];
    Promise.allSettled(
      titles.map(
        async (title) =>
          [
            title,
            await readRequirementCourses(
              title,
              catalog,
              fetchCatalogResource,
              controller.signal,
            ),
          ] as const,
      ),
    ).then((responses) => {
      if (controller.signal.aborted) return;
      const results = new Map(
        responses.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
      );
      setCategoryState({
        scope: candidateScope,
        rules: Object.fromEntries(
          rows.map(([id, title]) => [
            id,
            (results.get(title)?.courses ?? []).map((c) => ({
              subject: c.subject,
              number: c.catalogNumber,
            })),
          ]),
        ),
      });
    });
    return () => controller.abort();
  }, [categoriesKey, candidateScope, catalog]);
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
      requirementCandidates:
        categoryState.scope === candidateScope ? categoryState.rules : {},
      catalogCredits:
        catalogState.scope === catalogScope ? catalogState.credits : {},
    });
  } catch {}
  const candidateCodes = [
    ...new Set([
      ...(result?.candidates
        .slice(0, 60)
        .map((c) => c.subject + " " + c.number) ?? []),
      ...boardCourses(plan)
        .filter(
          (row) =>
            row.term === targetTerm &&
            row.course.kind === "course" &&
            row.course.subject &&
            row.course.number,
        )
        .map((row) => row.course.subject + " " + row.course.number),
    ]),
  ]
    .sort()
    .join(",");
  useEffect(() => {
    if (!candidateCodes) return;
    const controller = new AbortController();
    void Promise.allSettled(
      candidateCodes.split(",").map(async (code) => {
        const split = code.lastIndexOf(" ");
        const detail = await catalog.reader.read(
          {
            subject: code.slice(0, split),
            number: code.slice(split + 1),
            campus: catalog.campus,
            term: catalog.term,
          },
          controller.signal,
        );
        return [
          code,
          {
            min: detail.course.creditsMin,
            max: detail.course.creditsMax,
            title: detail.course.title,
          },
        ] as const;
      }),
    ).then((results) => {
      if (controller.signal.aborted) return;
      setCatalogState({
        scope: catalogScope,
        credits: Object.fromEntries(
          results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
        ),
      });
    });
    return () => controller.abort();
  }, [candidateCodes, catalog, catalogScope]);
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
    <section
      className={styles.root}
      data-compact={compact}
      data-analytics-area="planning_recommendations"
    >
      <div className={styles.heading}>
        <div>
          <h2>{t("Course recommendations", "课程推荐")}</h2>
          <p>
            {t(
              "Combine your remaining requirements, an official example, workload limits and course evaluations.",
              "结合剩余学业要求、官方样表、负担限制和课程评价。",
            )}
          </p>
        </div>
        <Sparkles size={30} />
      </div>
      <div className={styles.controls}>
        <label>
          {t("Planning program", "规划专业")}
          <ChoiceSelect
            value={program?.id ?? "manual"}
            onValueChange={(value) => setProgramId(value)}
          >
            <option value="manual">
              {t("Manual plan only", "仅手动规划")}
            </option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {[
                  p.title ?? p.code ?? t("Academic requirements", "学业要求"),
                  p.appliedVersion,
                  plan.documents.find((d) => d.id === p.documentId)?.auditMode,
                ]
                  .filter((v) => v && v !== "unknown")
                  .join(" · ")}
              </option>
            ))}
          </ChoiceSelect>
        </label>
      </div>
      {program &&
        !programRequirements(plan, program.id).some(
          (r) =>
            !/^unmatched courses$/i.test(r.title ?? "") &&
            (requirementCodes(r).length || requirementSearch(r.title ?? "")),
        ) && (
          <p className={styles.notice}>
            {t(
              "This report contains the program heading only. Import Planned Standard with all requirements, or expand the program in Planned Expanded before printing.",
              "这份报告只包含专业标题。请补充含全部要求的 Planned Standard，或在 Planned Expanded 中展开此专业后打印。",
            )}
            <button onClick={onReview}>
              {t("Import program requirements", "导入专业要求")}
            </button>
          </p>
        )}
      <details className={styles.preferences}>
        <summary>
          {t("Semester, workload and ratings", "调整学期、负担与评分")}
        </summary>
        <div className={styles.controls}>
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
            <ChoiceSelect
              value={sampleId}
              onValueChange={(value) => setSampleId(value)}
            >
              <option value="">{t("No example selected", "未选择样表")}</option>
              {samples.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label ?? s.program}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <label>
            {t("Sample year", "样表年级")}
            <ChoiceSelect
              value={sampleYear}
              onValueChange={(value) => setSampleYear(Number(value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </ChoiceSelect>
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
            <ChoiceSelect
              value={campus}
              onValueChange={(value) => {
                request.current?.abort();
                setBusy(false);
                setCampus(value);
                setRatings({});
                setMessage("");
              }}
            >
              {["COL", "LMA", "MNS", "MRN", "NWK", "WST"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </ChoiceSelect>
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
      </details>
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
                {t(
                  `Includes ${result.existingCredits} credits already in this semester.`,
                  `已包含该学期现有 ${result.existingCredits} 学分。`,
                )}
              </p>
              {result.unresolvedExisting > 0 && (
                <p role="status">
                  {t(
                    "Resolve unknown or variable credits already in this semester to calculate a bounded combination.",
                    "请先明确该学期已有的未知或浮动学分，以计算符合上限的组合。",
                  )}
                </p>
              )}
              <p>
                {result.bundle.map((c) => c.key).join(" · ") ||
                  t(
                    "No additional combination fits the current evidence and limits.",
                    "当前依据与上限下没有可追加的组合。",
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
            {result.candidates.slice(0, visibleCount).map((c) => (
              <article key={c.key} className={styles.card}>
                <div className={styles.cardTop}>
                  <h3>
                    {inspect ? (
                      <button
                        className={styles.courseLink}
                        onClick={() => inspect(c)}
                      >
                        {c.key}
                      </button>
                    ) : (
                      c.key
                    )}
                  </h3>
                  <span>
                    {Math.round(c.score)} {t("points", "分")}
                  </span>
                </div>
                {catalogState.scope === catalogScope &&
                  catalogState.credits[c.key]?.title && (
                    <p className={styles.courseTitle}>
                      {catalogState.credits[c.key].title}
                    </p>
                  )}
                <strong>
                  {c.credits === null
                    ? t(
                        "Credits pending lookup or selection",
                        "学分待查询或选择",
                      )
                    : `${c.credits} ${t("credits", "学分")}`}
                </strong>
                <ul>
                  {c.ruleIds.length > 0 && (
                    <li>
                      {t(
                        "Matches a remaining degree requirement",
                        "匹配尚未完成的学业要求",
                      )}
                    </li>
                  )}
                  {c.unreviewed && (
                    <li>
                      {t("Imported requirement option", "导入报告中的可选课程")}
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
                  <button
                    data-analytics-action="planning_recommendation_apply"
                    onClick={() => apply([c], targetTerm)}
                  >
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
      {result && result.candidates.length > visibleCount && (
        <button onClick={() => setVisibleCount((n) => n + 12)}>
          {t("Show more courses", "显示更多课程")}
        </button>
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
          {t("View imported reports", "查看导入报告")}
        </button>
      </details>
    </section>
  );
}
