"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  CircleHelp,
  Database,
  ShieldCheck,
} from "lucide-react";
import type {
  CourseEvaluationSummary,
  EvaluationMetric,
} from "@/lib/evaluations/types";
import {
  confidenceLabel,
  evaluationLabels,
  EvaluationSignalLabel,
  type EvaluationLocale,
} from "./rating-summary";
import styles from "./evaluation-panel.module.css";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const copy = {
  en: {
    title: "Student evaluations",
    responses: "Responses",
    responseRate: "Response rate",
    records: "Evaluation records",
    terms: "Terms",
    weightedScore: "Response & recency weighted",
    SEI: "Overall instructor rating · item 10",
    SSLE: "Mean across learning-experience items",
    history: "By term",
    chartLabel: "Response-weighted average by term, on a 1 to 5 scale",
    chartTable: "View exact term values",
    term: "Term",
    score: "Score",
    instruments:
      "The evaluation changed from SEI to SSLE in Autumn 2025. Each instrument is shown separately.",
    instructors: "This course’s instructors",
    noInstructorMatch: "No exact OSU email match",
    noInstructorData: "No matched evaluations for this course",
    exact: "Exact OSU email match",
    noData: "No evaluations match this course.",
    unavailable: "Evaluation data is temporarily unavailable.",
    noDataDetail:
      "A missing rating is not a negative rating. Official course and section information is still available.",
    source: "Source",
    imported: "Database import",
    latest: "Latest evaluation term",
    methodology: "How to read these ratings",
    methodBody:
      "Ratings use response-count weighting with a two-year time-decay half-life; each term’s chart value uses response weighting only. SEI uses overall instructor rating (item 10); SSLE uses the mean across all items. A signal needs at least 30 raw and 30 time-weighted responses, two records, two terms, and data within two years. Positive: ≥4.2; review carefully: ≤3.3; otherwise mixed. Coverage describes sample availability, not a statistical confidence interval. Responses can include repeat students, and one section can have multiple instructor records. Signals do not predict difficulty or grades.",
    older: "Earlier instrument",
    current: "Latest available instrument",
    unavailableValue: "Not available",
  },
  zh: {
    title: "学生教学评价",
    responses: "回答数量",
    responseRate: "回应率",
    records: "评价记录",
    terms: "覆盖学期",
    weightedScore: "回答数量与时间加权",
    SEI: "第 10 题：教师总体评价",
    SSLE: "学习体验各题目均分",
    history: "分学期趋势",
    chartLabel: "各学期按回答数量加权的平均分，量表范围 1 至 5 分",
    chartTable: "查看各学期准确数据",
    term: "学期",
    score: "评分",
    instruments:
      "OSU 于 2025 年秋季由 SEI 更换为 SSLE；两种量表分别展示，不混合计算。",
    instructors: "本课程授课教师",
    noInstructorMatch: "未匹配到完全一致的 OSU 邮箱",
    noInstructorData: "本课程暂无匹配教学评价",
    exact: "OSU 邮箱完全匹配",
    noData: "本课程暂无匹配的教学评价。",
    unavailable: "教学评价数据暂时无法读取。",
    noDataDetail: "缺少评分不代表负面评价；仍可查看官方课程和开课班次信息。",
    source: "来源",
    imported: "数据库导入时间",
    latest: "最新评价学期",
    methodology: "如何理解评分",
    methodBody:
      "评分按回答数量加权，并采用两年的时间衰减半衰期；趋势图的各学期数据仅按回答数量加权。SEI 使用第 10 题教师总体评价，SSLE 使用所有题目的均分。推荐信号要求至少 30 份原始回答及 30 份时间加权回答、2 条评价记录、2 个学期，且近两年有数据。≥4.2 为积极，≤3.3 建议审慎了解，其余为评价不一。覆盖程度描述样本情况，不是统计置信区间。回答可能包含重复选课学生；同一班次的多位教师可能分别产生评价记录。信号不预测课程难度或给分。",
    older: "早期量表",
    current: "最新可用量表",
    unavailableValue: "暂无数据",
  },
} as const;

function number(value: number, locale: EvaluationLocale) {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function TrendChart({
  metric,
  locale,
}: {
  metric: EvaluationMetric;
  locale: EvaluationLocale;
}) {
  const chartId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const labels = copy[locale];
  const points = metric.trend.toSorted((a, b) => a.sortKey - b.sortKey);
  const height = 140;
  const left = 28;
  const right = 28;
  const top = 12;
  const bottom = 28;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;
  const x = (index: number) =>
    left +
    (points.length === 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth);
  const y = (score: number) => top + ((5 - score) / 4) * plotHeight;
  const line = points
    .map((point, index) => `${x(index)},${y(point.score)}`)
    .join(" ");
  const labelCount = Math.min(
    6,
    points.length,
    Math.max(2, Math.floor(plotWidth / 64) + 1),
  );
  const labelIndices = new Set(
    Array.from({ length: labelCount }, (_, index) =>
      labelCount === 1
        ? 0
        : Math.round((index * (points.length - 1)) / (labelCount - 1)),
    ),
  );

  useEffect(() => {
    const container = chartRef.current;
    if (!container) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(240, Math.round(entry.contentRect.width)));
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  if (points.length === 0) return null;

  return (
    <div className={styles.chart} ref={chartRef}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={`${chartId}-title ${chartId}-description`}
      >
        <title id={`${chartId}-title`}>
          {metric.instrument} · {labels.history}
        </title>
        <desc id={`${chartId}-description`}>
          {labels.chartLabel}.{" "}
          {points
            .map(
              (point) =>
                `${point.term}: ${point.score.toFixed(2)}, ${point.responses} ${labels.responses}`,
            )
            .join("; ")}
        </desc>
        {[1, 3, 5].map((tick) => (
          <g key={tick}>
            <line
              x1={left}
              x2={width - right}
              y1={y(tick)}
              y2={y(tick)}
              className={styles.chartGrid}
            />
            <text
              x={left - 12}
              y={y(tick) + 4}
              textAnchor="end"
              className={styles.chartLabel}
            >
              {tick}
            </text>
          </g>
        ))}
        {points.length > 1 ? (
          <polyline points={line} className={styles.chartLine} />
        ) : null}
        {points.map((point, index) => (
          <g key={point.term}>
            <circle
              cx={x(index)}
              cy={y(point.score)}
              r={3.5}
              className={styles.chartPoint}
            >
              <title>
                {point.term}: {point.score.toFixed(2)} / 5 ·{" "}
                {number(point.responses, locale)} {labels.responses}
              </title>
            </circle>
            {labelIndices.has(index) ? (
              <text
                x={x(index)}
                y={height - 6}
                textAnchor="middle"
                className={styles.chartLabel}
              >
                {point.term}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <Collapsible className={styles.chartDetails}>
        <CollapsibleTrigger className={styles.disclosureTrigger}>
          {labels.chartTable}
          <ChevronDown aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className={styles.tableScroll}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{labels.term}</th>
                  <th scope="col">{labels.score}</th>
                  <th scope="col">{labels.responses}</th>
                  <th scope="col">{labels.responseRate}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.term}>
                    <th scope="row">{point.term}</th>
                    <td>{point.score.toFixed(2)}</td>
                    <td>{number(point.responses, locale)}</td>
                    <td>
                      {point.responseRate === null
                        ? "—"
                        : `${point.responseRate.toFixed(0)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function MetricPanel({
  metric,
  locale,
  primary,
}: {
  metric: EvaluationMetric;
  locale: EvaluationLocale;
  primary: boolean;
}) {
  const labels = copy[locale];
  const stats = [
    { label: labels.responses, value: number(metric.responseCount, locale) },
    {
      label: labels.responseRate,
      value:
        metric.responseRate === null
          ? "—"
          : `${metric.responseRate.toFixed(0)}%`,
    },
    { label: labels.records, value: number(metric.sectionCount, locale) },
    { label: labels.terms, value: number(metric.termCount, locale) },
  ];
  return (
    <section
      className={styles.metricPanel}
      aria-label={`${metric.instrument} ${labels.title}`}
    >
      <div className={styles.metricHeading}>
        <div>
          <h4>{metric.instrument}</h4>
          <span className={styles.subtle}>{labels[metric.instrument]}</span>
          <span className={styles.subtle}>
            {primary ? labels.current : labels.older} · {metric.firstTerm}–
            {metric.lastTerm}
          </span>
        </div>
        <span className={styles.coverage}>
          <ShieldCheck size={13} aria-hidden="true" />
          {confidenceLabel(metric.confidence, locale)}
        </span>
      </div>
      <div className={styles.metricOverview}>
        <div>
          <div className={styles.bigScore}>
            {metric.score.toFixed(2)}
            <span> / 5</span>
          </div>
          <span className={styles.subtle}>{labels.weightedScore}</span>
        </div>
        <EvaluationSignalLabel signal={metric.recommendation} locale={locale} />
      </div>
      <dl className={styles.stats}>
        {stats.map((stat) => (
          <div key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>{stat.value}</dd>
          </div>
        ))}
      </dl>
      <TrendChart metric={metric} locale={locale} />
    </section>
  );
}

export function EvaluationPanel({
  summary,
  locale,
}: {
  summary?: CourseEvaluationSummary;
  locale: EvaluationLocale;
}) {
  const labels = copy[locale];
  const unavailable = summary?.status === "unavailable";
  const primary = summary?.primary;
  const importedDate = summary?.source.importedAt
    ? new Date(summary.source.importedAt)
    : null;
  const imported =
    importedDate && !Number.isNaN(importedDate.getTime())
      ? importedDate.toISOString().slice(0, 10)
      : null;
  const metrics =
    summary?.metrics.toSorted(
      (a, b) => b.lastTermSortKey - a.lastTermSortKey,
    ) ?? [];

  return (
    <section className={styles.panel} aria-label={labels.title}>
      <div className={styles.panelHeading}>
        <h3>{labels.title}</h3>
        <span className={styles.subtle}>SEI / SSLE</span>
      </div>
      {!primary ? (
        <div className={styles.emptyState}>
          <CircleHelp size={22} aria-hidden="true" />
          <div>
            <strong>{unavailable ? labels.unavailable : labels.noData}</strong>
            <p>{labels.noDataDetail}</p>
          </div>
        </div>
      ) : (
        <>
          <p className={styles.instrumentNote}>{labels.instruments}</p>
          <div className={styles.metricList}>
            {metrics.map((metric) => (
              <MetricPanel
                key={metric.instrument}
                metric={metric}
                locale={locale}
                primary={metric.instrument === primary.instrument}
              />
            ))}
          </div>
        </>
      )}
      {summary && summary.instructors.length > 0 ? (
        <section className={styles.instructors} aria-label={labels.instructors}>
          <h4>{labels.instructors}</h4>
          {summary.instructors.map((instructor, index) => (
            <div
              className={styles.instructorRow}
              key={`${instructor.email ?? instructor.name}-${index}`}
            >
              <div>
                <span className={styles.instructorName}>{instructor.name}</span>
                <span className={styles.subtle}>
                  {instructor.match === "unmatched"
                    ? labels.noInstructorMatch
                    : instructor.primary
                      ? `${number(instructor.primary.responseCount, locale)} ${evaluationLabels[locale].responses} · ${instructor.primary.lastTerm}`
                      : labels.noInstructorData}
                </span>
              </div>
              {instructor.primary && instructor.match === "exact-email" ? (
                <div className={styles.instructorScore} title={labels.exact}>
                  <strong>
                    {instructor.primary.score.toFixed(2)}
                    <small> / 5</small>
                  </strong>
                  <span className={styles.subtle}>
                    {instructor.primary.instrument}
                  </span>
                </div>
              ) : (
                <span
                  className={styles.subtle}
                  aria-label={labels.noInstructorData}
                >
                  —
                </span>
              )}
            </div>
          ))}
        </section>
      ) : null}
      <Collapsible className={styles.methodology}>
        <CollapsibleTrigger className={styles.disclosureTrigger}>
          <CircleHelp size={13} aria-hidden="true" />
          {labels.methodology}
          <ChevronDown aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p>{labels.methodBody}</p>
        </CollapsibleContent>
      </Collapsible>
      {summary ? (
        <footer className={styles.source}>
          <span>
            <Database size={12} aria-hidden="true" />
            {labels.source}:{" "}
            <a href={summary.source.url} target="_blank" rel="noreferrer">
              {summary.source.provider}
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </span>
          {summary.source.latestTerm ? (
            <span>
              {labels.latest}: {summary.source.latestTerm}
            </span>
          ) : null}
          {imported ? (
            <time dateTime={summary.source.importedAt ?? undefined}>
              {labels.imported}: {imported}
            </time>
          ) : null}
          {summary.source.coverage ? (
            <span>{summary.source.coverage}</span>
          ) : null}
        </footer>
      ) : null}
    </section>
  );
}

export default EvaluationPanel;
