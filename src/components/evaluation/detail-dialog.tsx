"use client";

import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";

import { MetricsGrid } from "@/components/evaluation/metrics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ComparisonTarget,
  CourseDetail,
  EvaluationRecord,
  InstructorDetail,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

type DetailRecord = InstructorDetail | CourseDetail;

type DetailDialogProps = {
  target: ComparisonTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const DETAIL_ROW_LIMIT = 18;

const instrumentCopy = {
  SEI: {
    measure: "Item 10 overall rating",
    shortMeasure: "Item 10 overall",
    className: "border-sei bg-sei/10 text-sei-foreground",
  },
  SSLE: {
    measure: "Mean of all SSLE items",
    shortMeasure: "Mean of all items",
    className: "border-ssle bg-ssle/10 text-ssle-foreground",
  },
} as const;

function requestPath(target: ComparisonTarget) {
  if (target.kind === "instructor") {
    return `/api/instructors/${encodeURIComponent(target.key)}`;
  }
  return `/api/courses/${target.key.split("/").map(encodeURIComponent).join("/")}`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function InstrumentBadge({
  instrument,
}: {
  instrument: EvaluationRecord["instrument"];
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-semibold", instrumentCopy[instrument].className)}
    >
      {instrument}
    </Badge>
  );
}

function DetailHeader({
  record,
  hasError,
}: {
  record: DetailRecord | null;
  hasError: boolean;
}) {
  const isInstructor = record?.title === "instructor";
  const title = record
    ? isInstructor
      ? record.name
      : record.code
    : "Record details";
  const description = record
    ? isInstructor
      ? `${formatInteger(record.coursesTaught)} courses in the reporting window`
      : `${formatInteger(record.sectionCount)} sections in the reporting window`
    : hasError
      ? "The official record could not be loaded."
      : "Loading the official evaluation record.";

  return (
    <DialogHeader className="border-b bg-card px-5 py-5 pr-12 text-left sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar size="lg" className="shrink-0 border bg-muted">
          <AvatarFallback>
            {record ? initials(title) : <Icon icon="lucide:book-open" />}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Official record</Badge>
            {record ? (
              <Badge variant="outline">
                {isInstructor ? "Instructor" : "Course"}
              </Badge>
            ) : null}
          </div>
          <DialogTitle className="truncate text-xl leading-tight sm:text-2xl">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1.5 leading-5">
            {description}
          </DialogDescription>
        </div>
      </div>
    </DialogHeader>
  );
}

function RecordProfile({ record }: { record: DetailRecord }) {
  const isInstructor = record.title === "instructor";
  const scope = record.departments.length
    ? record.departments.join(", ")
    : "Not reported";
  const volumeLabel = isInstructor ? "Courses taught" : "Course sections";
  const volumeValue = isInstructor
    ? formatInteger(record.coursesTaught)
    : formatInteger(record.sectionCount);
  const peopleLabel = isInstructor ? "Name variants" : "Instructors";
  const peopleValue = isInstructor
    ? formatInteger(record.nameVariants.length)
    : formatInteger(record.instructorCount);

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-base">Record scope</CardTitle>
        <CardDescription>
          Official identifiers and reporting context for this result set.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-5 py-4">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              Identifier
            </dt>
            <dd className="mt-1 truncate font-medium">
              {isInstructor ? record.key : record.code}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              {volumeLabel}
            </dt>
            <dd className="mt-1 font-medium tabular-nums">{volumeValue}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">
              {peopleLabel}
            </dt>
            <dd className="mt-1 font-medium tabular-nums">{peopleValue}</dd>
          </div>
        </dl>
        <Separator className="my-4" />
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Reporting departments
          </p>
          <p className="text-sm leading-5">{scope}</p>
        </div>
        {isInstructor && record.nameVariants.length > 1 ? (
          <Alert className="mt-4">
            <Icon icon="lucide:contact-round" aria-hidden="true" />
            <AlertTitle>Official display-name observations</AlertTitle>
            <AlertDescription>
              <p>{record.nameVariants.join(", ")}</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EvaluationTable({ evaluations }: { evaluations: EvaluationRecord[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Term</TableHead>
          <TableHead>Course and section</TableHead>
          <TableHead>Measure</TableHead>
          <TableHead className="text-right">Rating / 5</TableHead>
          <TableHead className="text-right">Responses</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {evaluations.map((evaluation) => (
          <TableRow key={evaluation.evaluationId}>
            <TableCell className="font-medium tabular-nums">
              {evaluation.term}
            </TableCell>
            <TableCell className="max-w-72 whitespace-normal">
              <p className="font-medium">{evaluation.courseCode}</p>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
                {evaluation.courseTitle} - Section {evaluation.classNumber}
              </p>
            </TableCell>
            <TableCell>
              <div className="flex flex-col items-start gap-1.5">
                <InstrumentBadge instrument={evaluation.instrument} />
                <span className="text-xs text-muted-foreground">
                  {instrumentCopy[evaluation.instrument].shortMeasure}
                </span>
              </div>
            </TableCell>
            <TableCell className="text-right text-base font-semibold tabular-nums">
              {evaluation.rating.toFixed(2)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatInteger(evaluation.responseCount)} /{" "}
              {formatInteger(evaluation.invitedCount)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {evaluation.responseRate.toFixed(1)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function EvaluationMobileList({
  evaluations,
}: {
  evaluations: EvaluationRecord[];
}) {
  return (
    <div className="flex flex-col gap-3 lg:hidden">
      {evaluations.map((evaluation) => (
        <Card key={evaluation.evaluationId} className="gap-4 py-4 shadow-none">
          <CardHeader className="px-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-sm">
                  {evaluation.courseCode}
                </CardTitle>
                <CardDescription className="mt-1 line-clamp-2 leading-5">
                  {evaluation.courseTitle} - Section {evaluation.classNumber}
                </CardDescription>
              </div>
              <InstrumentBadge instrument={evaluation.instrument} />
            </div>
          </CardHeader>
          <CardContent className="px-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Term</p>
                <p className="mt-1 font-medium tabular-nums">
                  {evaluation.term}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Rating / 5</p>
                <p className="mt-1 font-semibold tabular-nums">
                  {evaluation.rating.toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Responses</p>
                <p className="mt-1 tabular-nums">
                  {formatInteger(evaluation.responseCount)} /{" "}
                  {formatInteger(evaluation.invitedCount)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Response rate</p>
                <p className="mt-1 tabular-nums">
                  {evaluation.responseRate.toFixed(1)}%
                </p>
              </div>
            </div>
            <Separator className="my-3" />
            <p className="text-xs text-muted-foreground">
              {instrumentCopy[evaluation.instrument].measure}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EvaluationRecords({
  evaluations,
  emptyTitle,
}: {
  evaluations: EvaluationRecord[];
  emptyTitle: string;
}) {
  if (!evaluations.length) {
    return (
      <Alert>
        <Icon icon="lucide:circle-slash-2" aria-hidden="true" />
        <AlertTitle>{emptyTitle}</AlertTitle>
        <AlertDescription>
          <p>There are no reportable evaluations for this instrument.</p>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      <div className="hidden lg:block">
        <EvaluationTable evaluations={evaluations} />
      </div>
      <EvaluationMobileList evaluations={evaluations} />
    </>
  );
}

function EvaluationHistory({
  evaluations,
}: {
  evaluations: EvaluationRecord[];
}) {
  const visibleEvaluations = useMemo(
    () => evaluations.slice(0, DETAIL_ROW_LIMIT),
    [evaluations],
  );
  const seiEvaluations = useMemo(
    () => visibleEvaluations.filter((item) => item.instrument === "SEI"),
    [visibleEvaluations],
  );
  const ssleEvaluations = useMemo(
    () => visibleEvaluations.filter((item) => item.instrument === "SSLE"),
    [visibleEvaluations],
  );

  return (
    <section aria-labelledby="evaluation-history-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="evaluation-history-heading" className="text-lg font-semibold">
            Evaluation history
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Section-level records remain grouped by their original instrument.
          </p>
        </div>
        {evaluations.length > DETAIL_ROW_LIMIT ? (
          <Badge variant="outline">
            Newest {DETAIL_ROW_LIMIT} of {formatInteger(evaluations.length)}
          </Badge>
        ) : null}
      </div>

      <Tabs defaultValue="all" className="mt-4 gap-4">
        <TabsList
          aria-label="Evaluation instrument filter"
          className="w-full sm:w-auto"
        >
          <TabsTrigger value="all">
            All ({visibleEvaluations.length})
          </TabsTrigger>
          <TabsTrigger value="sei">SEI ({seiEvaluations.length})</TabsTrigger>
          <TabsTrigger value="ssle">
            SSLE ({ssleEvaluations.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="all">
          <EvaluationRecords
            evaluations={visibleEvaluations}
            emptyTitle="No evaluation history"
          />
        </TabsContent>
        <TabsContent value="sei">
          <EvaluationRecords
            evaluations={seiEvaluations}
            emptyTitle="No SEI evaluations in this view"
          />
        </TabsContent>
        <TabsContent value="ssle">
          <EvaluationRecords
            evaluations={ssleEvaluations}
            emptyTitle="No SSLE evaluations in this view"
          />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function DetailLoading() {
  return (
    <div className="flex flex-col gap-5" aria-live="polite" aria-busy="true">
      <Skeleton className="h-28 w-full" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function DetailContent({ target }: { target: ComparisonTarget }) {
  const [record, setRecord] = useState<DetailRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    void fetch(requestPath(target), { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load this record.");
        return (await response.json()) as DetailRecord;
      })
      .then(setRecord)
      .catch((fetchError: unknown) => {
        if (
          fetchError instanceof DOMException &&
          fetchError.name === "AbortError"
        ) {
          return;
        }
        setError("This record is temporarily unavailable.");
      });

    return () => controller.abort();
  }, [target]);

  return (
    <>
      <DetailHeader record={record} hasError={Boolean(error)} />
      <ScrollArea className="min-h-0">
        <div className="px-5 py-5 sm:px-6 sm:py-6">
          {error ? (
            <Alert variant="destructive">
              <Icon icon="lucide:triangle-alert" aria-hidden="true" />
              <AlertTitle>Unable to load this record</AlertTitle>
              <AlertDescription>
                <p>{error}</p>
              </AlertDescription>
            </Alert>
          ) : record ? (
            <div className="flex flex-col gap-6">
              <MetricsGrid metrics={record.metrics} />
              <Alert>
                <Icon icon="lucide:scale" aria-hidden="true" />
                <AlertTitle>Rating methods stay separate</AlertTitle>
                <AlertDescription>
                  <p>
                    SEI uses the Item 10 overall rating. SSLE uses the mean of
                    all SSLE items. They are shown side by side for context,
                    never combined into one score or ranking.
                  </p>
                </AlertDescription>
              </Alert>
              <RecordProfile record={record} />
              <EvaluationHistory evaluations={record.evaluations} />
            </div>
          ) : (
            <DetailLoading />
          )}
        </div>
      </ScrollArea>
      <DialogFooter
        className="border-t bg-muted/30 px-5 py-3 sm:px-6"
        showCloseButton
      >
        <p className="text-xs text-muted-foreground">
          Official evaluation data is displayed without cross-instrument
          normalization.
        </p>
      </DialogFooter>
    </>
  );
}

function EmptyDetailContent() {
  return (
    <>
      <DetailHeader record={null} hasError={false} />
      <div className="flex min-h-52 items-center px-5 py-6 sm:px-6">
        <Alert>
          <Icon icon="lucide:mouse-pointer-click" aria-hidden="true" />
          <AlertTitle>Select a record to inspect</AlertTitle>
          <AlertDescription>
            <p>Choose an instructor or course from the results workspace.</p>
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

export function DetailDialog({
  target,
  open,
  onOpenChange,
}: DetailDialogProps) {
  const targetKey = target ? `${target.kind}:${target.key}` : "none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-5xl">
        {open && target ? (
          <DetailContent key={targetKey} target={target} />
        ) : (
          <EmptyDetailContent />
        )}
      </DialogContent>
    </Dialog>
  );
}
