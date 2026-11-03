"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type {
  ComparisonItem,
  ComparisonResponse,
  ComparisonTarget,
  Instrument,
  InstrumentMetrics,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

type CompareDialogProps = {
  open: boolean;
  targets: ComparisonTarget[];
  onOpenChange: (open: boolean) => void;
};

type ComparisonRow = {
  item: ComparisonItem;
  metric: InstrumentMetrics;
};

const instruments = ["SEI", "SSLE"] as const;

const instrumentCopy: Record<
  Instrument,
  {
    title: string;
    measure: string;
    description: string;
    className: string;
    textClassName: string;
  }
> = {
  SEI: {
    title: "SEI comparison",
    measure: "Item 10 overall rating",
    description:
      "Only SEI Item 10 overall ratings are shown together in this panel.",
    className: "border-sei bg-sei/10 text-sei-foreground",
    textClassName: "text-sei-foreground",
  },
  SSLE: {
    title: "SSLE comparison",
    measure: "Mean of all SSLE items",
    description:
      "Only SSLE all-item averages are shown together in this panel.",
    className: "border-ssle bg-ssle/10 text-ssle-foreground",
    textClassName: "text-ssle-foreground",
  },
};

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function itemName(item: ComparisonItem) {
  return item.instructor?.name ?? item.course?.code ?? "Unknown record";
}

function itemContext(item: ComparisonItem) {
  if (item.instructor) {
    return `${formatInteger(item.instructor.coursesTaught)} courses in the reporting window`;
  }
  if (item.course) {
    return item.course.title;
  }
  return "";
}

function instrumentMetric(item: ComparisonItem, instrument: Instrument) {
  const metrics = item.instructor?.metrics ?? item.course?.metrics ?? [];
  return metrics.find((metric) => metric.instrument === instrument) ?? null;
}

function comparisonRows(
  items: ComparisonItem[],
  instrument: Instrument,
): ComparisonRow[] {
  return items.flatMap((item) => {
    const metric = instrumentMetric(item, instrument);
    return metric ? [{ item, metric }] : [];
  });
}

function InstrumentBadge({ instrument }: { instrument: Instrument }) {
  return (
    <Badge
      variant="outline"
      className={cn("font-semibold", instrumentCopy[instrument].className)}
    >
      {instrument}
    </Badge>
  );
}

function ComparisonTable({
  instrument,
  rows,
}: {
  instrument: Instrument;
  rows: ComparisonRow[];
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Record</TableHead>
          <TableHead>Measure</TableHead>
          <TableHead className="text-right">Rating / 5</TableHead>
          <TableHead className="text-right">Responses</TableHead>
          <TableHead className="text-right">Rate</TableHead>
          <TableHead>Term coverage</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(({ item, metric }) => (
          <TableRow key={`${item.target.kind}:${item.target.key}`}>
            <TableCell className="max-w-64 whitespace-normal">
              <p className="font-medium">{itemName(item)}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {itemContext(item)}
              </p>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {instrumentCopy[instrument].measure}
            </TableCell>
            <TableCell
              className={cn(
                "text-right text-base font-semibold tabular-nums",
                instrumentCopy[instrument].textClassName,
              )}
            >
              {metric.responseWeightedRating.toFixed(2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatInteger(metric.responseCount)} /{" "}
              {formatInteger(metric.invitedCount)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {metric.responseRate.toFixed(1)}%
            </TableCell>
            <TableCell className="tabular-nums">
              {metric.termCoverage.first} - {metric.termCoverage.last}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ComparisonMobileRows({
  instrument,
  rows,
}: {
  instrument: Instrument;
  rows: ComparisonRow[];
}) {
  return (
    <div className="flex flex-col lg:hidden">
      {rows.map(({ item, metric }, index) => (
        <div
          key={`${item.target.kind}:${item.target.key}`}
          className={cn("py-4", index > 0 && "border-t")}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">{itemName(item)}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-5 text-muted-foreground">
                {itemContext(item)}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted-foreground">Rating / 5</p>
              <p
                className={cn(
                  "mt-1 text-lg font-semibold tabular-nums",
                  instrumentCopy[instrument].textClassName,
                )}
              >
                {metric.responseWeightedRating.toFixed(2)}
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Responses</p>
              <p className="mt-1 tabular-nums">
                {formatInteger(metric.responseCount)} /{" "}
                {formatInteger(metric.invitedCount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Response rate</p>
              <p className="mt-1 tabular-nums">
                {metric.responseRate.toFixed(1)}%
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Term coverage</p>
              <p className="mt-1 tabular-nums">
                {metric.termCoverage.first} - {metric.termCoverage.last}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ComparisonInstrumentCard({
  instrument,
  rows,
}: {
  instrument: Instrument;
  rows: ComparisonRow[];
}) {
  const copy = instrumentCopy[instrument];

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <InstrumentBadge instrument={instrument} />
          <Badge variant="outline">
            {rows.length} {rows.length === 1 ? "record" : "records"}
          </Badge>
        </div>
        <CardTitle className="mt-3 text-base">{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="px-5 py-0">
        <div className="hidden lg:block">
          <ComparisonTable instrument={instrument} rows={rows} />
        </div>
        <ComparisonMobileRows instrument={instrument} rows={rows} />
      </CardContent>
      <CardFooter className="border-t px-5 py-3 text-xs text-muted-foreground">
        <Icon icon="lucide:shield-check" aria-hidden="true" />
        <span>{copy.measure}; no cross-instrument ranking.</span>
      </CardFooter>
    </Card>
  );
}

function ComparisonLoading() {
  return (
    <div className="flex flex-col gap-5" aria-live="polite" aria-busy="true">
      {instruments.map((instrument) => (
        <Card key={instrument} className="gap-5 shadow-none">
          <CardHeader>
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-36 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function MissingTargetsNotice({ targets }: { targets: ComparisonTarget[] }) {
  if (!targets.length) return null;
  return (
    <Alert className="border-brand/30 bg-accent/40">
      <Icon icon="lucide:triangle-alert" aria-hidden="true" />
      <AlertTitle>Some records are unavailable</AlertTitle>
      <AlertDescription>
        <p>
          These requested records have no active official evaluation in the
          current snapshot:
        </p>
        <ul className="mt-2 list-disc pl-4">
          {targets.map((target) => (
            <li key={`${target.kind}:${target.key}`}>
              <span className="font-medium">{target.kind}</span>: {target.key}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

function ComparisonResults({ result }: { result: ComparisonResponse }) {
  const sections = instruments
    .map((instrument) => ({
      instrument,
      rows: comparisonRows(result.items, instrument),
    }))
    .filter((section) => section.rows.length > 0);

  if (!sections.length) {
    return (
      <div className="flex flex-col gap-4">
        <MissingTargetsNotice targets={result.missingTargets} />
        <Alert>
          <Icon icon="lucide:circle-slash-2" aria-hidden="true" />
          <AlertTitle>No reportable comparison metrics</AlertTitle>
          <AlertDescription>
            <p>The selected records did not return an SEI or SSLE aggregate.</p>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <MissingTargetsNotice targets={result.missingTargets} />
      {sections.map(({ instrument, rows }) => (
        <ComparisonInstrumentCard
          key={instrument}
          instrument={instrument}
          rows={rows}
        />
      ))}
      <Alert>
        <Icon icon="lucide:info" aria-hidden="true" />
        <AlertTitle>Official data note</AlertTitle>
        <AlertDescription>
          <p>{result.dataStatus.ratingNotice}</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ComparisonContent({ targets }: { targets: ComparisonTarget[] }) {
  const [result, setResult] = useState<ComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targets }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Comparison unavailable");
        return (await response.json()) as ComparisonResponse;
      })
      .then(setResult)
      .catch((fetchError: unknown) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }
        setError("The comparison is temporarily unavailable.");
      });

    return () => controller.abort();
  }, [targets]);

  return (
    <>
      <DialogHeader className="border-b bg-card px-5 py-5 pr-12 text-left sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{targets.length} selected</Badge>
          <Badge variant="outline">Official data</Badge>
        </div>
        <DialogTitle className="mt-2 text-xl sm:text-2xl">
          Comparison workspace
        </DialogTitle>
        <DialogDescription className="leading-5">
          SEI and SSLE are displayed as separate measures and are never ranked
          against each other.
        </DialogDescription>
      </DialogHeader>
      <ScrollArea className="min-h-0">
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {error ? (
            <Alert variant="destructive">
              <Icon icon="lucide:triangle-alert" aria-hidden="true" />
              <AlertTitle>Unable to prepare this comparison</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : result ? (
            <ComparisonResults result={result} />
          ) : (
            <ComparisonLoading />
          )}
        </div>
      </ScrollArea>
      <DialogFooter
        className="border-t bg-muted/30 px-5 py-3 sm:px-6"
        showCloseButton
      >
        <p className="text-xs text-muted-foreground">
          Compare records within the same instrument only.
        </p>
      </DialogFooter>
    </>
  );
}

function EmptyComparisonContent() {
  return (
    <>
      <DialogHeader className="border-b bg-card px-5 py-5 pr-12 text-left sm:px-6">
        <DialogTitle className="text-xl sm:text-2xl">
          Comparison workspace
        </DialogTitle>
        <DialogDescription>
          Select at least two instructor or course records to compare.
        </DialogDescription>
      </DialogHeader>
      <div className="flex min-h-52 items-center px-5 py-6 sm:px-6">
        <Alert>
          <Icon icon="lucide:git-compare-arrows" aria-hidden="true" />
          <AlertTitle>Choose two to four records</AlertTitle>
          <AlertDescription>
            <p>
              Scores will be grouped by SEI and SSLE so their distinct methods
              remain clear.
            </p>
          </AlertDescription>
        </Alert>
      </div>
      <DialogFooter
        className="border-t bg-muted/30 px-5 py-3 sm:px-6"
        showCloseButton
      />
    </>
  );
}

export function CompareDialog({
  open,
  targets,
  onOpenChange,
}: CompareDialogProps) {
  const targetKey = targets
    .map((target) => `${target.kind}:${target.key}`)
    .join("|");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-6xl">
        {open && targets.length >= 2 ? (
          <ComparisonContent key={targetKey} targets={targets} />
        ) : (
          <EmptyComparisonContent />
        )}
      </DialogContent>
    </Dialog>
  );
}
