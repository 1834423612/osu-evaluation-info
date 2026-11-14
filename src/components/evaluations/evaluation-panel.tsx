"use client";
import { ReferenceInfo } from "@/components/reference/reference-info";

import { useEffect, useId, useRef, useState } from "react";
import { SceneMascot } from "@/components/brand/scene-mascot";
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
import { text, type Locale } from "@/lib/i18n";
import {
  confidenceLabel,
  evaluationLabels,
  EvaluationSignalLabel,
} from "./rating-summary";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
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
    records: "Instructor-section records",
    terms: "Terms",
    weightedScore: "Response & recency weighted",
    SEI: "Overall instructor rating · item 10",
    SSLE: "Mean across learning-experience items",
    history: "By term",
    chartLabel: "Response-weighted average by term, on a 1 to 5 scale",
    chartTable: "View exact term values",
    chartHint: "Hover or tap any term · ← → to explore · Esc to clear",
    sections: "instructor-section records",
    responseRateShort: "Response rate",
    term: "Term",
    score: "Score",
    instruments:
      "The evaluation changed from SEI to SSLE in Autumn 2025. Each instrument is shown separately.",
    instructors: "Instructors in official course records",
    unscoredNote:
      "Instructors with published course evaluations appear first. A missing score can reflect a teaching assistant, a new appointment, or no published evaluation; it does not establish a role. Open an instructor to view directory appointments.",
    currentOffering: "Current classes",
    pastOffering: "Past offerings",
    courseTotal: "All instructors combined for this course",
    noInstructorMatch: "No matching OSU evaluation record",
    noInstructorData: "No course evaluations for this instructor",
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
      "Ratings use response-count weighting with a two-year time-decay half-life; each term’s chart value uses response weighting only. SEI uses overall instructor rating (item 10); SSLE uses the mean across all items. A signal needs at least 30 raw and 30 time-weighted responses, two instructor-section records, two terms, and data within two years. Positive: ≥4.2; review carefully: ≤3.3; otherwise mixed. Coverage describes sample availability, not a statistical confidence interval. Responses can include repeat students, and one section can have multiple instructor-section records. Signals do not predict difficulty or grades.",
    older: "Earlier instrument",
    current: "Latest available instrument",
    unavailableValue: "Not available",
  },
  zh: {
    title: "学生教学评价",
    responses: "回答数量",
    responseRate: "回应率",
    records: "班次记录",
    terms: "覆盖学期",
    weightedScore: "回答数量与时间加权",
    SEI: "第 10 题：教师总体评价",
    SSLE: "学习体验各题目均分",
    history: "分学期趋势",
    chartLabel: "各学期按回答数量加权的平均分，量表范围 1 至 5 分",
    chartTable: "查看各学期准确数据",
    chartHint: "沿学期移动或轻点查看 · 方向键切换 · Esc 清除",
    sections: "条班次记录",
    responseRateShort: "回应率",
    term: "学期",
    score: "评分",
    instruments:
      "OSU 于 2025 年秋季由 SEI 更换为 SSLE；两种量表分别展示，不混合计算。",
    instructors: "官方课程记录中的教师",
    unscoredNote:
      "有本课程官方评价的教师优先显示。暂无评分可能涉及助教、新任职或尚无公开评价，不能据此认定身份；展开教师可查看目录中的公开任职部门。",
    currentOffering: "当前班次",
    pastOffering: "往届班次",
    courseTotal: "本课程所有教师合并统计",
    noInstructorMatch: "OSU 评价资料中没有对应班次记录",
    noInstructorData: "该教师暂无本课程评价",
    exact: "OSU 邮箱完全匹配",
    noData: "本课程暂无匹配的教学评价。",
    unavailable: "教学评价数据暂时无法读取。",
    noDataDetail: "缺少评分不代表负面评价；仍可查看官方课程和开课班次信息。",
    source: "来源",
    imported: "数据库导入时间",
    latest: "最新评价学期",
    methodology: "如何理解评分",
    methodBody:
      "评分按回答数量加权，并采用两年的时间衰减半衰期；趋势图的各学期数据仅按回答数量加权。SEI 使用第 10 题教师总体评价，SSLE 使用所有题目的均分。推荐信号要求至少 30 份原始回答及 30 份时间加权回答、2 条班次记录、2 个学期，且近两年有数据。≥4.2 为积极，≤3.3 建议审慎了解，其余为评价不一。覆盖程度描述样本情况，不是统计置信区间。回答可能包含重复选课学生；同一班次的多位教师可能分别产生班次记录。信号不预测课程难度或给分。",
    older: "早期量表",
    current: "最新可用量表",
    unavailableValue: "暂无数据",
  },
} as const;

function number(value: number, locale: Locale) {
  return value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

function TrendChart({
  metric,
  locale,
}: {
  metric: EvaluationMetric;
  locale: Locale;
}) {
  const chartId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const activePoint = hoveredPoint ?? selectedPoint;
  const labels = copy[locale];
  const points = metric.trend.toSorted((a, b) => a.sortKey - b.sortKey);
  const height = 172;
  const left = 28;
  const right = 28;
  const top = 18;
  const bottom = 34;
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
  const active = activePoint === null ? null : points[activePoint];
  const activeX = activePoint === null ? 0 : x(activePoint);
  const activeY = active ? y(active.score) : 0;
  const tooltipWidth = Math.min(212, width - 8);
  const tooltipHeight = 62;
  const tooltipX = Math.min(
    Math.max(4, activeX - tooltipWidth / 2),
    width - tooltipWidth - 4,
  );
  const tooltipY =
    activeY > top + tooltipHeight + 12
      ? activeY - tooltipHeight - 12
      : Math.min(activeY + 14, height - bottom - tooltipHeight - 4);
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
    <div className={styles.chart} ref={chartRef} data-chart>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={`${metric.instrument} · ${labels.history}`}
        aria-describedby={`${chartId}-description ${chartId}-hint`}
        onPointerLeave={() => setHoveredPoint(null)}
        data-trend-chart
      >
        <desc id={`${chartId}-description`}>
          {labels.chartLabel}.{" "}
          {points
            .map(
              (point) =>
                `${point.term}: ${point.score.toFixed(2)}, ${point.responses} ${labels.responses}`,
            )
            .join("; ")}
        </desc>
        {[1, 2, 3, 4, 5].map((tick) => (
          <g key={tick} aria-hidden="true">
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
        <line
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
          className={styles.chartAxis}
          aria-hidden="true"
        />
        {points.length > 1 ? (
          <polyline
            points={line}
            className={styles.chartLine}
            aria-hidden="true"
          />
        ) : null}
        {active ? (
          <g pointerEvents="none" aria-hidden="true">
            <rect
              x={Math.max(left, activeX - 12)}
              y={top}
              width={Math.min(24, width - right - Math.max(left, activeX - 12))}
              height={plotHeight}
              rx="5"
              className={styles.chartActiveBand}
            />
            <line
              x1={activeX}
              x2={activeX}
              y1={top}
              y2={height - bottom + 5}
              className={styles.chartCrosshair}
            />
            <line
              x1={left}
              x2={width - right}
              y1={activeY}
              y2={activeY}
              className={styles.chartCrosshairHorizontal}
            />
            <circle
              cx={activeX}
              cy={activeY}
              r="8"
              className={styles.chartPointHalo}
            />
            <circle
              cx={activeX}
              cy={height - bottom}
              r="3"
              className={styles.chartAxisMarker}
            />
          </g>
        ) : null}
        {points.map((point, index) => {
          const pointX = x(index);
          const pointY = y(point.score);
          const bandLeft =
            index === 0 ? left - 10 : (x(index - 1) + pointX) / 2;
          const bandRight =
            index === points.length - 1
              ? width - right + 10
              : (pointX + x(index + 1)) / 2;
          return (
            <g key={point.term}>
              <rect
                x={bandLeft}
                y={top - 7}
                width={bandRight - bandLeft}
                height={height - top + 4}
                rx="5"
                className={styles.chartHitArea}
                tabIndex={0}
                role="button"
                data-trend-point={index}
                aria-pressed={selectedPoint === index}
                aria-label={`${point.term}: ${point.score.toFixed(2)} / 5, ${number(point.responses, locale)} ${labels.responses}, ${labels.responseRate}: ${point.responseRate === null ? "—" : `${point.responseRate.toFixed(0)}%`}, ${point.sections} ${labels.sections}`}
                onPointerEnter={() => setHoveredPoint(index)}
                onPointerMove={() => setHoveredPoint(index)}
                onFocus={() => setHoveredPoint(index)}
                onBlur={() => setHoveredPoint(null)}
                onClick={() => {
                  setSelectedPoint((current) =>
                    current === index ? null : index,
                  );
                  setHoveredPoint(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedPoint((current) =>
                      current === index ? null : index,
                    );
                  }
                  if (
                    ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  ) {
                    event.preventDefault();
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? points.length - 1
                          : Math.max(
                              0,
                              Math.min(
                                points.length - 1,
                                index + (event.key === "ArrowRight" ? 1 : -1),
                              ),
                            );
                    chartRef.current
                      ?.querySelector<SVGRectElement>(
                        `[data-trend-point="${next}"]`,
                      )
                      ?.focus();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setSelectedPoint(null);
                    setHoveredPoint(null);
                  }
                }}
              />
              <circle
                cx={pointX}
                cy={pointY}
                r={activePoint === index ? 4.5 : 3.5}
                className={`${styles.chartPoint}${activePoint === index ? ` ${styles.chartPointActive}` : ""}`}
                pointerEvents="none"
                aria-hidden="true"
              />
              {labelIndices.has(index) ? (
                <text
                  x={pointX}
                  y={height - 10}
                  textAnchor="middle"
                  className={`${styles.chartLabel}${activePoint === index ? ` ${styles.chartLabelActive}` : ""}`}
                  pointerEvents="none"
                  aria-hidden="true"
                >
                  {point.term}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* SVG paint order keeps the tooltip above every point and hit area. */}
        {active ? (
          <g
            className={styles.pointTooltip}
            pointerEvents="none"
            aria-hidden="true"
            data-trend-tooltip
          >
            <rect
              x={tooltipX}
              y={tooltipY}
              width={tooltipWidth}
              height={tooltipHeight}
              rx="9"
            />
            <text x={tooltipX + 11} y={tooltipY + 18}>
              {active.term} · {active.score.toFixed(2)} / 5
            </text>
            <text x={tooltipX + 11} y={tooltipY + 35}>
              {number(active.responses, locale)} {labels.responses}
            </text>
            <text
              x={tooltipX + 11}
              y={tooltipY + 50}
              className={styles.pointTooltipDetail}
            >
              {labels.responseRateShort}:{" "}
              {active.responseRate === null
                ? "—"
                : `${active.responseRate.toFixed(0)}%`}
              {" · "}
              {number(active.sections, locale)} {labels.sections}
            </text>
          </g>
        ) : null}
      </svg>
      <p className={styles.chartHint} id={`${chartId}-hint`}>
        {labels.chartHint}
      </p>
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

function MiniTrend({
  metric,
  locale,
}: {
  metric: EvaluationMetric;
  locale: Locale;
}) {
  const points = metric.trend.toSorted((a, b) => a.sortKey - b.sortKey);
  const width = 86;
  const height = 24;
  const coordinates = points.map((point, index) => {
    const x =
      points.length < 2 ? width / 2 : (index / (points.length - 1)) * width;
    const y = 2 + ((5 - point.score) / 4) * (height - 4);
    return { x, y, point };
  });
  return (
    <svg
      className={styles.miniTrend}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`${metric.instrument} ${text(locale, "trend", "趋势")}`}
    >
      {coordinates.length > 1 ? (
        <polyline
          points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
        />
      ) : null}
      {coordinates.map(({ x, y, point }) => (
        <circle key={point.term} cx={x} cy={y} r="2" />
      ))}
    </svg>
  );
}

function gradeTone(score: number) {
  return score >= 4.2 ? "positive" : score <= 3.3 ? "caution" : "mixed";
}

function instructorDataSortKey(
  instructor: CourseEvaluationSummary["instructors"][number],
) {
  return instructor.metrics.reduce(
    (latest, metric) => Math.max(latest, metric.lastTermSortKey),
    instructor.primary?.lastTermSortKey ?? Number.NEGATIVE_INFINITY,
  );
}

function MetricPanel({
  metric,
  locale,
  primary,
}: {
  metric: EvaluationMetric;
  locale: Locale;
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
          <h4>
            {metric.instrument}
            <ReferenceInfo
              topic={metric.instrument === "SEI" ? "sei" : "ssle"}
              locale={locale}
            />
          </h4>
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
  subject,
}: {
  summary?: CourseEvaluationSummary;
  locale: Locale;
  subject?: string;
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
  const instructors =
    summary?.instructors.toSorted((a, b) => {
      const aHasData = Number(Boolean(a.primary || a.metrics.length));
      const bHasData = Number(Boolean(b.primary || b.metrics.length));
      return (
        bHasData - aHasData ||
        (bHasData
          ? instructorDataSortKey(b) - instructorDataSortKey(a)
          : Number(b.currentlyListed) - Number(a.currentlyListed))
      );
    }) ?? [];

  return (
    <section className={styles.panel} aria-label={labels.title}>
      <div className={styles.panelHeading}>
        <h3>
          {labels.title}
          <ReferenceInfo topic="scoring" locale={locale} />
        </h3>
        <DataSourceBadge source="official">
          <ShieldCheck size={14} aria-hidden="true" />
          {text(locale, "Official OSU data", "OSU 官方数据")}
        </DataSourceBadge>
      </div>
      <p className={styles.courseTotal}>{labels.courseTotal}</p>
      {!primary ? (
        <div className={styles.emptyState}>
          <SceneMascot scene="no-results" size={56} />
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
      {instructors.length > 0 ? (
        <section className={styles.instructors} aria-label={labels.instructors}>
          <h4>{labels.instructors}</h4>
          <p className={styles.instructorNote}>{labels.unscoredNote}</p>
          {instructors.map((instructor, index) => (
            <Collapsible
              className={styles.instructorItem}
              key={`${instructor.email ?? instructor.name}-${index}`}
            >
              <div className={styles.instructorRow}>
                <div className={styles.instructorIdentity}>
                  <InstructorDirectoryIdentity
                    name={instructor.name}
                    email={instructor.email}
                    size={32}
                    subject={subject}
                    locale={locale}
                  />
                  <span className={styles.subtle}>
                    {instructor.currentlyListed
                      ? labels.currentOffering
                      : labels.pastOffering}
                    {" · "}
                    {instructor.match === "unmatched"
                      ? labels.noInstructorMatch
                      : instructor.primary
                        ? `${number(instructor.primary.responseCount, locale)} ${evaluationLabels[locale].responses} · ${instructor.primary.lastTerm}`
                        : labels.noInstructorData}
                  </span>
                </div>
                <CollapsibleTrigger
                  className={styles.instructorRatingsToggle}
                  aria-label={text(
                    locale,
                    `View ${instructor.name}'s official evaluation trends`,
                    `查看 ${instructor.name} 的官方评价趋势`,
                  )}
                >
                  <span className={styles.instructorMetrics}>
                    {(["SSLE", "SEI"] as const).map((instrument) => {
                      const metric = instructor.metrics.find(
                        (item) => item.instrument === instrument,
                      );
                      return (
                        <span
                          className={styles.instructorMiniMetric}
                          key={instrument}
                        >
                          <span>{instrument}</span>
                          {metric ? (
                            <>
                              <MiniTrend metric={metric} locale={locale} />
                              <strong data-tone={gradeTone(metric.score)}>
                                {metric.score.toFixed(2)}
                              </strong>
                            </>
                          ) : (
                            <small>—</small>
                          )}
                        </span>
                      );
                    })}
                  </span>
                  {instructor.primary ? (
                    <span
                      className={styles.instructorScore}
                      data-tone={gradeTone(instructor.primary.score)}
                    >
                      <strong>
                        {instructor.primary.score.toFixed(2)}
                        <small>/5</small>
                      </strong>
                      <span>{instructor.primary.instrument}</span>
                    </span>
                  ) : (
                    <span className={styles.instructorScore}>—</span>
                  )}
                  <ChevronDown aria-hidden="true" />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className={styles.instructorDetail}>
                {instructor.match === "unmatched" ? (
                  <p className={styles.subtle}>{labels.noInstructorMatch}</p>
                ) : instructor.metrics.length ? (
                  <div className={styles.metricList}>
                    {instructor.metrics.map((metric) => (
                      <MetricPanel
                        key={metric.instrument}
                        metric={metric}
                        locale={locale}
                        primary={
                          metric.instrument === instructor.primary?.instrument
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <p className={styles.subtle}>{labels.noInstructorData}</p>
                )}
              </CollapsibleContent>
            </Collapsible>
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
