import { CircleHelp, TrendingUp, TriangleAlert } from "lucide-react";
import { SceneMascot } from "@/components/brand/scene-mascot";
import type {
  CourseEvaluationSummary,
  EvaluationConfidence,
  EvaluationSignal,
} from "@/lib/evaluations/types";
import type { Locale } from "@/lib/i18n";
import styles from "./evaluation-panel.module.css";

export const evaluationLabels = {
  en: {
    positive: "Positive signal",
    mixed: "Mixed signal",
    caution: "Review carefully",
    insufficient: "Limited evidence",
    high: "Broad coverage",
    moderate: "Moderate coverage",
    limited: "Limited coverage",
    responses: "responses",
    unavailable: "Ratings unavailable",
    noData: "No matched ratings",
    weighting:
      "Weighted by response count and recency. Evaluation responses are not unique students.",
  },
  zh: {
    positive: "评价积极",
    mixed: "评价不一",
    caution: "建议审慎了解",
    insufficient: "参考样本有限",
    high: "样本覆盖较广",
    moderate: "样本覆盖适中",
    limited: "样本覆盖有限",
    responses: "份回答",
    unavailable: "评分暂不可用",
    noData: "暂无匹配评价",
    weighting: "按回答数量与时间衰减加权；回答数不等于独立学生人数。",
  },
} as const;

export function EvaluationSignalLabel({
  signal,
  locale,
}: {
  signal: EvaluationSignal;
  locale: Locale;
}) {
  const Icon =
    signal === "positive"
      ? TrendingUp
      : signal === "caution"
        ? TriangleAlert
        : CircleHelp;
  return (
    <span className={styles.signal} data-signal={signal}>
      <Icon size={13} aria-hidden="true" />
      {evaluationLabels[locale][signal]}
    </span>
  );
}

export function confidenceLabel(
  confidence: EvaluationConfidence,
  locale: Locale,
) {
  return evaluationLabels[locale][confidence];
}

export function RatingSummary({
  summary,
  locale,
}: {
  summary?: CourseEvaluationSummary;
  locale: Locale;
}) {
  const labels = evaluationLabels[locale];
  if (!summary?.primary) {
    return (
      <div className={styles.ratingEmpty}>
        {summary?.status === "no-data" ? (
          <SceneMascot scene="no-results" size={28} />
        ) : null}
        <span className={styles.emptyScore} aria-hidden="true">
          —
        </span>
        <span>
          {summary?.status === "unavailable"
            ? labels.unavailable
            : labels.noData}
        </span>
      </div>
    );
  }
  const metric = summary.primary;
  return (
    <div className={styles.ratingSummary}>
      <div className={styles.ratingLine} title={labels.weighting}>
        <span className={styles.compactScore}>{metric.score.toFixed(2)}</span>
        <span className={styles.scoreScale}>/ 5</span>
        <span className={styles.instrument}>{metric.instrument}</span>
      </div>
      <span className={styles.responseLabel}>
        {metric.responseCount.toLocaleString(
          locale === "zh" ? "zh-CN" : "en-US",
        )}{" "}
        {labels.responses}
        <span aria-hidden="true"> · </span>
        {metric.lastTerm}
      </span>
      <EvaluationSignalLabel signal={metric.recommendation} locale={locale} />
    </div>
  );
}

export default RatingSummary;
