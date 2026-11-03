import { Icon } from "@iconify/react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InstrumentMetrics } from "@/lib/api/types";

type MetricDisplayProps = {
  metric: InstrumentMetrics;
  dense?: boolean;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function ratingLabel(metric: InstrumentMetrics) {
  return metric.instrument === "SEI" ? "Item 10 overall" : "Mean of SSLE items";
}

function InstrumentMark({
  instrument,
}: {
  instrument: InstrumentMetrics["instrument"];
}) {
  const isSei = instrument === "SEI";
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-5 border-current px-1.5 text-[10px] font-bold",
        isSei ? "text-sei-foreground" : "text-ssle-foreground",
      )}
    >
      {instrument}
    </Badge>
  );
}

export function MetricDisplay({ metric, dense = false }: MetricDisplayProps) {
  return (
    <div
      className={cn(
        "min-w-0 border-l-2 px-3 py-2.5",
        metric.instrument === "SEI" ? "border-sei" : "border-ssle",
        dense && "px-2.5 py-2",
      )}
    >
      <div className="flex items-center gap-2">
        <InstrumentMark instrument={metric.instrument} />
        <span className="truncate text-xs text-muted-foreground">
          {ratingLabel(metric)}
        </span>
      </div>
      <div className="mt-1.5 flex items-end gap-1.5">
        <span
          className={cn(
            "text-xl font-semibold tabular-nums",
            dense && "text-lg",
          )}
        >
          {metric.responseWeightedRating.toFixed(2)}
        </span>
        <span className="pb-0.5 text-xs text-muted-foreground">/ 5</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] leading-4 text-muted-foreground">
        <span>{formatNumber(metric.responseCount)} responses</span>
        <span>{metric.responseRate.toFixed(1)}% response rate</span>
        <span>
          {metric.termCoverage.first} - {metric.termCoverage.last}
        </span>
      </div>
    </div>
  );
}

export function MetricsGrid({
  metrics,
  dense = false,
}: {
  metrics: InstrumentMetrics[];
  dense?: boolean;
}) {
  if (!metrics.length) {
    return (
      <span className="text-sm text-muted-foreground">
        No reportable evaluation metrics
      </span>
    );
  }

  return (
    <div
      className={cn(
        "grid overflow-hidden border border-border bg-card sm:grid-cols-2",
        dense && "text-sm",
      )}
    >
      {metrics.map((metric) => (
        <MetricDisplay key={metric.instrument} metric={metric} dense={dense} />
      ))}
    </div>
  );
}

export function MetricLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <Icon
          icon="lucide:circle-dot"
          className="size-3.5 text-sei"
          aria-hidden="true"
        />
        SEI: overall-rating Item 10 through SU 2025
      </span>
      <span className="flex items-center gap-1.5">
        <Icon
          icon="lucide:circle-dot"
          className="size-3.5 text-ssle"
          aria-hidden="true"
        />
        SSLE: mean of SSLE items from AU 2025
      </span>
    </div>
  );
}
