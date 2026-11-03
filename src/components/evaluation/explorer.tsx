"use client";

import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState, useTransition } from "react";

import { CompareDialog } from "@/components/evaluation/compare-dialog";
import { DetailDialog } from "@/components/evaluation/detail-dialog";
import {
  countActiveFilters,
  FilterControls,
  instrumentFromFilter,
  type ExplorerFilters,
  type FilterFacetSet,
} from "@/components/evaluation/filter-controls";
import { MetricLegend, MetricsGrid } from "@/components/evaluation/metrics";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  ApiDataStatus,
  ComparisonTarget,
  CourseSummary,
  FacetsResponse,
  InstructorSummary,
  SearchPageInfo,
  SearchResponse,
  SearchSort,
} from "@/lib/api/types";
import { searchSorts } from "@/lib/api/types";

const PAGE_LIMIT = 12;

const DEFAULT_FILTERS: ExplorerFilters = {
  query: "",
  instrument: "",
  subject: "",
  college: "",
  campus: "",
  department: "",
  deliveryMode: "",
  classSizeCategory: "",
  term: "",
};

const EMPTY_FACETS: FilterFacetSet = {
  terms: [],
  subjects: [],
  colleges: [],
  campuses: [],
  departments: [],
  deliveryModes: [],
  classSizeCategories: [],
};

type ResultKind = "all" | "instructors" | "courses";

type SearchState = {
  result: SearchResponse | null;
  facets: FacetsResponse | null;
  settledRequestKey: string;
  error: string | null;
};

function readInitialFilters(): ExplorerFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  const params = new URLSearchParams(window.location.search);
  return {
    query: params.get("q") ?? "",
    instrument: instrumentFromFilter(params.get("instrument") ?? ""),
    subject: params.get("subject") ?? "",
    college: params.get("college") ?? "",
    campus: params.get("campus") ?? "",
    department: params.get("department") ?? "",
    deliveryMode: params.get("deliveryMode") ?? "",
    classSizeCategory: params.get("classSizeCategory") ?? "",
    term: params.get("term") ?? "",
  };
}

function readInitialKind(): ResultKind {
  if (typeof window === "undefined") return "all";
  const value = new URLSearchParams(window.location.search).get("kind");
  return value === "instructors" || value === "courses" ? value : "all";
}

function readInitialPage() {
  if (typeof window === "undefined") return 1;
  const value = Number(new URLSearchParams(window.location.search).get("page"));
  return Number.isInteger(value) && value > 0 ? value : 1;
}

function readInitialSort(): SearchSort {
  if (typeof window === "undefined") return "default";
  const value = new URLSearchParams(window.location.search).get("sort");
  return searchSorts.includes(value as SearchSort)
    ? (value as SearchSort)
    : "default";
}

function queryString(
  filters: ExplorerFilters,
  kind: ResultKind,
  page: number,
  sort: SearchSort,
) {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set("q", filters.query.trim());
  if (filters.instrument) params.set("instrument", filters.instrument);
  if (filters.subject) params.set("subject", filters.subject);
  if (filters.college) params.set("college", filters.college);
  if (filters.campus) params.set("campus", filters.campus);
  if (filters.department) params.set("department", filters.department);
  if (filters.deliveryMode) params.set("deliveryMode", filters.deliveryMode);
  if (filters.classSizeCategory)
    params.set("classSizeCategory", filters.classSizeCategory);
  if (filters.term) params.set("term", filters.term);
  params.set("kind", kind);
  params.set("limit", String(PAGE_LIMIT));
  params.set("page", String(page));
  params.set("sort", sort);
  return params;
}

function statusText(status: ApiDataStatus | undefined) {
  if (!status) return "Loading official snapshot";
  return `${status.label} · ${status.coverage}`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function targetForInstructor(item: InstructorSummary): ComparisonTarget {
  return { kind: "instructor", key: item.key };
}

function targetForCourse(item: CourseSummary): ComparisonTarget {
  return { kind: "course", key: item.key };
}

function targetId(target: ComparisonTarget) {
  return `${target.kind}:${target.key}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function selectedTarget(
  selected: ComparisonTarget[],
  target: ComparisonTarget,
) {
  return selected.some((entry) => targetId(entry) === targetId(target));
}

function targetLabel(target: ComparisonTarget, result: SearchResponse | null) {
  if (result) {
    if (target.kind === "instructor") {
      const instructor = result.instructors.find(
        (item) => item.key === target.key,
      );
      if (instructor) return instructor.name;
    } else {
      const course = result.courses.find((item) => item.key === target.key);
      if (course) return course.code;
    }
  }
  return target.key;
}

function ResultTypeBadge({ kind }: { kind: "instructor" | "course" }) {
  return (
    <Badge
      variant="outline"
      className="rounded-full border-brand/25 bg-brand/5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand"
    >
      {kind}
    </Badge>
  );
}

function CompareButton({
  selected,
  onClick,
}: {
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={selected ? "secondary" : "outline"}
      size="sm"
      type="button"
      onClick={onClick}
      aria-pressed={selected}
    >
      <Icon
        icon={selected ? "lucide:check" : "lucide:plus"}
        className="size-3.5"
        aria-hidden="true"
      />
      {selected ? "In compare" : "Compare"}
    </Button>
  );
}

function InstructorResult({
  item,
  selected,
  onCompare,
  onOpen,
}: {
  item: InstructorSummary;
  selected: boolean;
  onCompare: () => void;
  onOpen: () => void;
}) {
  const departments = item.departments.slice(0, 2).join(" · ");
  return (
    <Card className="result-card gap-0 rounded-none border-x-0 border-t-0 py-0 shadow-none last:border-b-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <Button
          variant="ghost"
          size="default"
          type="button"
          onClick={onOpen}
          className="group h-auto min-w-0 flex-1 shrink justify-start gap-3 rounded-md p-0 text-left hover:bg-transparent"
        >
          <Avatar size="lg" className="mt-0.5 bg-brand/10 text-brand">
            <AvatarFallback className="bg-brand/10 font-semibold text-brand">
              {initials(item.name)}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="mb-1.5 flex flex-wrap items-center gap-2">
              <ResultTypeBadge kind="instructor" />
              <span className="truncate text-[11px] text-muted-foreground">
                {item.key}
              </span>
            </span>
            <span className="block truncate text-base font-semibold group-hover:text-brand">
              {item.name}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {item.coursesTaught} courses in the reporting window
              {departments ? ` · ${departments}` : ""}
            </span>
          </span>
        </Button>
        <CompareButton selected={selected} onClick={onCompare} />
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5">
        <MetricsGrid metrics={item.metrics} dense />
      </CardContent>
    </Card>
  );
}

function CourseResult({
  item,
  selected,
  onCompare,
  onOpen,
}: {
  item: CourseSummary;
  selected: boolean;
  onCompare: () => void;
  onOpen: () => void;
}) {
  const college = item.colleges.slice(0, 2).join(" · ");
  const department = item.departments.slice(0, 1).join("");
  return (
    <Card className="result-card gap-0 rounded-none border-x-0 border-t-0 py-0 shadow-none last:border-b-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 px-4 py-4 sm:px-5">
        <Button
          variant="ghost"
          size="default"
          type="button"
          onClick={onOpen}
          className="group h-auto min-w-0 flex-1 shrink justify-start gap-3 rounded-md p-0 text-left hover:bg-transparent"
        >
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-ssle/10 text-ssle-foreground">
            <Icon
              icon="lucide:book-open"
              className="size-5"
              aria-hidden="true"
            />
          </span>
          <span className="min-w-0">
            <span className="mb-1.5 flex flex-wrap items-center gap-2">
              <ResultTypeBadge kind="course" />
              <span className="truncate text-[11px] text-muted-foreground">
                {item.subject}
              </span>
            </span>
            <span className="block truncate text-base font-semibold group-hover:text-brand">
              {item.code}
            </span>
            <span className="mt-1 block truncate text-xs text-muted-foreground">
              {item.title}
            </span>
          </span>
        </Button>
        <CompareButton selected={selected} onClick={onCompare} />
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5">
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Icon
              icon="lucide:layers-3"
              className="size-3.5"
              aria-hidden="true"
            />
            {item.sectionCount} sections
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Icon icon="lucide:users" className="size-3.5" aria-hidden="true" />
            {item.instructorCount} instructors
          </span>
          {college ? <span className="truncate">{college}</span> : null}
          {department ? <span className="truncate">{department}</span> : null}
        </div>
        <MetricsGrid metrics={item.metrics} dense />
      </CardContent>
    </Card>
  );
}

function ResultSkeleton() {
  return (
    <Card className="gap-4 rounded-none border-x-0 border-t-0 py-5 shadow-none">
      <CardHeader className="flex flex-row gap-3 px-4 py-0 sm:px-5">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-5 w-48 max-w-[70%]" />
          <Skeleton className="h-3 w-64 max-w-[90%]" />
        </div>
      </CardHeader>
      <CardContent className="px-4 sm:px-5">
        <Skeleton className="h-20 w-full" />
      </CardContent>
    </Card>
  );
}

function pageWindow(current: number, totalPages: number) {
  if (totalPages <= 5)
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  const start = Math.max(2, Math.min(current - 1, totalPages - 3));
  const pages = [1, start, start + 1, start + 2, totalPages];
  return [...new Set(pages)];
}

function ResultPagination({
  info,
  label,
  onPageChange,
}: {
  info: SearchPageInfo | undefined;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (!info || info.totalPages <= 1) return null;
  const from = (info.page - 1) * info.limit + 1;
  const to = Math.min(info.page * info.limit, info.total);
  const pages = pageWindow(info.page, info.totalPages);
  const move = (event: React.MouseEvent<HTMLAnchorElement>, page: number) => {
    event.preventDefault();
    if (page >= 1 && page <= info.totalPages && page !== info.page)
      onPageChange(page);
  };
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:px-5">
      <p className="text-xs tabular-nums text-muted-foreground">
        {label}: {formatInteger(from)}–{formatInteger(to)} of{" "}
        {formatInteger(info.total)}
      </p>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              href={`?page=${Math.max(1, info.page - 1)}`}
              onClick={(event) => move(event, info.page - 1)}
              aria-disabled={!info.hasPreviousPage}
              className={
                !info.hasPreviousPage ? "pointer-events-none opacity-40" : ""
              }
            />
          </PaginationItem>
          {pages.map((page, index) => {
            const previous = pages[index - 1];
            const showEllipsis =
              index > 0 && previous !== undefined && page - previous > 1;
            return (
              <span key={page} className="contents">
                {showEllipsis ? (
                  <PaginationItem>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : null}
                <PaginationItem>
                  <PaginationLink
                    href={`?page=${page}`}
                    isActive={page === info.page}
                    onClick={(event) => move(event, page)}
                  >
                    {page}
                  </PaginationLink>
                </PaginationItem>
              </span>
            );
          })}
          <PaginationItem>
            <PaginationNext
              href={`?page=${Math.min(info.totalPages, info.page + 1)}`}
              onClick={(event) => move(event, info.page + 1)}
              aria-disabled={!info.hasNextPage}
              className={
                !info.hasNextPage ? "pointer-events-none opacity-40" : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  );
}

function ResultSectionHeader({
  title,
  total,
}: {
  title: string;
  total: number;
}) {
  return (
    <div className="flex items-center justify-between border-b bg-muted/35 px-4 py-3 sm:px-5">
      <div className="flex items-center gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h2>
        <Badge variant="secondary" className="rounded-full px-1.5 text-[10px]">
          {formatInteger(total)}
        </Badge>
      </div>
      <span className="text-[11px] text-muted-foreground">
        official records
      </span>
    </div>
  );
}

function ResultsList({
  result,
  resultKind,
  selected,
  isLoading,
  onToggleCompare,
  onOpen,
  onPageChange,
  error,
}: {
  result: SearchResponse | null;
  resultKind: ResultKind;
  selected: ComparisonTarget[];
  isLoading: boolean;
  onToggleCompare: (target: ComparisonTarget) => void;
  onOpen: (target: ComparisonTarget) => void;
  onPageChange: (page: number) => void;
  error: string | null;
}) {
  if (!result) {
    if (error) {
      return (
        <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border bg-card px-5 text-center shadow-sm">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <Icon
              icon="lucide:cloud-off"
              className="size-6"
              aria-hidden="true"
            />
          </span>
          <div>
            <p className="font-medium">The snapshot could not be loaded</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      );
    }
    return (
      <div
        aria-busy="true"
        className="overflow-hidden rounded-xl border bg-card shadow-sm"
      >
        <ResultSkeleton />
        <ResultSkeleton />
        <ResultSkeleton />
      </div>
    );
  }

  const hasInstructors =
    resultKind !== "courses" && result.instructors.length > 0;
  const hasCourses = resultKind !== "instructors" && result.courses.length > 0;
  const total =
    (result.pagination?.instructors.total ?? result.instructors.length) +
    (result.pagination?.courses.total ?? result.courses.length);

  if (!total) {
    return (
      <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-xl border bg-card px-5 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon icon="lucide:search-x" className="size-6" aria-hidden="true" />
        </span>
        <div>
          <p className="font-medium">No matching records</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try a broader name, subject, college, or term.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-card shadow-sm transition-opacity ${
        isLoading ? "opacity-65" : "opacity-100"
      }`}
      aria-busy={isLoading}
    >
      {hasInstructors ? (
        <section aria-labelledby="instructor-results-heading">
          <ResultSectionHeader
            title="Instructors"
            total={
              result.pagination?.instructors.total ?? result.instructors.length
            }
          />
          <h2 id="instructor-results-heading" className="sr-only">
            Instructors
          </h2>
          {result.instructors.map((item) => {
            const target = targetForInstructor(item);
            return (
              <InstructorResult
                key={item.key}
                item={item}
                selected={selectedTarget(selected, target)}
                onCompare={() => onToggleCompare(target)}
                onOpen={() => onOpen(target)}
              />
            );
          })}
          <ResultPagination
            info={result.pagination?.instructors}
            label="Instructors"
            onPageChange={onPageChange}
          />
        </section>
      ) : null}
      {hasCourses ? (
        <section
          aria-labelledby="course-results-heading"
          className={hasInstructors ? "border-t-8 border-background" : ""}
        >
          <ResultSectionHeader
            title="Courses"
            total={result.pagination?.courses.total ?? result.courses.length}
          />
          <h2 id="course-results-heading" className="sr-only">
            Courses
          </h2>
          {result.courses.map((item) => {
            const target = targetForCourse(item);
            return (
              <CourseResult
                key={item.key}
                item={item}
                selected={selectedTarget(selected, target)}
                onCompare={() => onToggleCompare(target)}
                onOpen={() => onOpen(target)}
              />
            );
          })}
          <ResultPagination
            info={result.pagination?.courses}
            label="Courses"
            onPageChange={onPageChange}
          />
        </section>
      ) : null}
    </div>
  );
}

function CompareSelectionList({
  targets,
  result,
  onRemove,
}: {
  targets: ComparisonTarget[];
  result: SearchResponse | null;
  onRemove: (target: ComparisonTarget) => void;
}) {
  if (!targets.length) {
    return (
      <div className="flex min-h-40 flex-col items-center justify-center px-4 text-center text-xs leading-5 text-muted-foreground">
        <Icon
          icon="lucide:columns-3"
          className="mb-2 size-6"
          aria-hidden="true"
        />
        Select records from the results to compare them side by side.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {targets.map((target) => (
        <div
          key={targetId(target)}
          className="flex items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2.5"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {targetLabel(target, result)}
            </p>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {target.kind}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            type="button"
            onClick={() => onRemove(target)}
            className="shrink-0 text-muted-foreground"
            aria-label={`Remove ${targetLabel(target, result)} from comparison`}
          >
            <Icon icon="lucide:x" className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function CompareRail({
  targets,
  result,
  onRemove,
  onOpen,
}: {
  targets: ComparisonTarget[];
  result: SearchResponse | null;
  onRemove: (target: ComparisonTarget) => void;
  onOpen: () => void;
}) {
  return (
    <Card className="sticky top-6 gap-0 overflow-hidden rounded-xl py-0 shadow-sm">
      <CardHeader className="border-b px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">Compare records</CardTitle>
          <Badge
            variant={targets.length ? "default" : "outline"}
            className="rounded-full"
          >
            {targets.length}/4
          </Badge>
        </div>
        <CardDescription className="text-xs leading-5">
          Keep two to four records together. SEI and SSLE stay in separate
          sections.
        </CardDescription>
      </CardHeader>
      <CardContent className="min-h-44 px-3 py-3">
        <CompareSelectionList
          targets={targets}
          result={result}
          onRemove={onRemove}
        />
      </CardContent>
      <CardFooter className="border-t px-3 py-3">
        <Button
          variant="default"
          size="default"
          type="button"
          className="w-full"
          disabled={targets.length < 2}
          onClick={onOpen}
        >
          <Icon
            icon="lucide:arrow-up-right"
            className="size-4"
            aria-hidden="true"
          />
          Open comparison
        </Button>
      </CardFooter>
    </Card>
  );
}

function SortSelect({
  value,
  instrument,
  onChange,
}: {
  value: SearchSort;
  instrument: ExplorerFilters["instrument"];
  onChange: (value: SearchSort) => void;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onChange(next as SearchSort)}
    >
      <SelectTrigger className="h-9 w-full min-w-44 bg-card text-xs sm:w-auto">
        <SelectValue placeholder="Sort results" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="default">Alphabetical</SelectItem>
        <SelectItem value="rating_desc" disabled={!instrument}>
          Highest rating
          {instrument ? ` · ${instrument}` : " · choose instrument"}
        </SelectItem>
        <SelectItem value="responses_desc">Most responses</SelectItem>
        <SelectItem value="sections_desc">Most sections</SelectItem>
        <SelectItem value="recent_desc">Most recent</SelectItem>
      </SelectContent>
    </Select>
  );
}

function SummaryStrip({
  result,
  filters,
}: {
  result: SearchResponse | null;
  filters: ExplorerFilters;
}) {
  const instructorTotal = result?.pagination?.instructors.total ?? 0;
  const courseTotal = result?.pagination?.courses.total ?? 0;
  const selectedInstrument = filters.instrument || "Both instruments";
  return (
    <div className="grid overflow-hidden rounded-xl border bg-card shadow-sm sm:grid-cols-3">
      <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand/10 text-brand">
          <Icon icon="lucide:database" className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            Matching records
          </p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums">
            {formatInteger(instructorTotal + courseTotal)}
          </p>
        </div>
      </div>
      <div className="border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Record mix
        </p>
        <p className="mt-0.5 text-sm font-medium">
          {formatInteger(instructorTotal)} instructors ·{" "}
          {formatInteger(courseTotal)} courses
        </p>
      </div>
      <div className="border-t px-4 py-3 sm:border-t-0 sm:border-l sm:px-5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          Rating context
        </p>
        <p className="mt-0.5 text-sm font-medium">{selectedInstrument}</p>
      </div>
    </div>
  );
}

export function EvaluationExplorer() {
  const [filters, setFilters] = useState<ExplorerFilters>(readInitialFilters);
  const [debouncedQuery, setDebouncedQuery] = useState(filters.query);
  const [resultKind, setResultKind] = useState<ResultKind>(readInitialKind);
  const [page, setPage] = useState(readInitialPage);
  const [sort, setSort] = useState<SearchSort>(readInitialSort);
  const [searchState, setSearchState] = useState<SearchState>({
    result: null,
    facets: null,
    settledRequestKey: "",
    error: null,
  });
  const [selected, setSelected] = useState<ComparisonTarget[]>([]);
  const [detailTarget, setDetailTarget] = useState<ComparisonTarget | null>(
    null,
  );
  const [compareOpen, setCompareOpen] = useState(false);
  const [mobileCompareOpen, setMobileCompareOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedQuery(filters.query),
      280,
    );
    return () => window.clearTimeout(timeout);
  }, [filters.query]);

  const requestFilters = useMemo(
    () => ({ ...filters, query: debouncedQuery }),
    [debouncedQuery, filters],
  );
  const requestKey = useMemo(
    () => queryString(requestFilters, resultKind, page, sort).toString(),
    [page, requestFilters, resultKind, sort],
  );
  const isLoading = searchState.settledRequestKey !== requestKey;

  useEffect(() => {
    const controller = new AbortController();
    const loadData = async () => {
      try {
        const params = new URLSearchParams(requestKey);
        const facetParams = new URLSearchParams(params);
        facetParams.delete("kind");
        facetParams.delete("limit");
        facetParams.delete("page");
        facetParams.delete("sort");
        const [searchResponse, facetsResponse] = await Promise.all([
          fetch(`/api/search?${params.toString()}`, {
            signal: controller.signal,
          }),
          fetch(`/api/facets?${facetParams.toString()}`, {
            signal: controller.signal,
          }),
        ]);
        const searchBody = (await searchResponse.json()) as
          SearchResponse | { message?: string };
        const facetsBody = (await facetsResponse.json()) as
          FacetsResponse | { message?: string };
        if (!searchResponse.ok || !facetsResponse.ok) {
          const message =
            ("message" in searchBody && searchBody.message) ||
            ("message" in facetsBody && facetsBody.message) ||
            "The official snapshot is unavailable.";
          throw new Error(message);
        }
        if (controller.signal.aborted) return;
        setSearchState({
          result: searchBody as SearchResponse,
          facets: facetsBody as FacetsResponse,
          settledRequestKey: requestKey,
          error: null,
        });
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        if (controller.signal.aborted) return;
        setSearchState((state) => ({
          ...state,
          settledRequestKey: requestKey,
          error:
            error instanceof Error
              ? error.message
              : "The official snapshot is temporarily unavailable.",
        }));
      }
    };
    void loadData();
    const urlParams = new URLSearchParams(requestKey);
    const query = urlParams.toString();
    window.history.replaceState(null, "", query ? `/?${query}` : "/");
    return () => controller.abort();
  }, [requestKey]);

  const updateFilter = (key: keyof ExplorerFilters, value: string) => {
    startTransition(() => {
      setFilters((current) => ({ ...current, [key]: value }));
      setPage(1);
      if (key === "instrument" && !value && sort === "rating_desc")
        setSort("default");
    });
  };

  const resetFilters = () =>
    startTransition(() => {
      setFilters(DEFAULT_FILTERS);
      setDebouncedQuery("");
      setPage(1);
      setSort("default");
    });

  const changeKind = (value: string) => {
    if (value !== "all" && value !== "instructors" && value !== "courses")
      return;
    startTransition(() => {
      setResultKind(value);
      setPage(1);
    });
  };

  const changeSort = (value: SearchSort) => {
    if (value === "rating_desc" && !filters.instrument) return;
    startTransition(() => {
      setSort(value);
      setPage(1);
    });
  };

  const toggleCompare = (target: ComparisonTarget) => {
    setSelected((current) => {
      const existing = current.findIndex(
        (entry) => targetId(entry) === targetId(target),
      );
      if (existing >= 0)
        return current.filter((_, index) => index !== existing);
      if (current.length >= 4) return current;
      return [...current, target];
    });
  };

  const removeCompare = (target: ComparisonTarget) =>
    setSelected((current) =>
      current.filter((entry) => targetId(entry) !== targetId(target)),
    );

  const facets = searchState.facets ?? EMPTY_FACETS;
  const result = searchState.result;
  const activeCount = countActiveFilters(filters);
  const shownCount =
    (result?.instructors.length ?? 0) + (result?.courses.length ?? 0);
  const totalCount =
    (result?.pagination?.instructors.total ?? 0) +
    (result?.pagination?.courses.total ?? 0);
  const searchError = isLoading ? null : searchState.error;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1480px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground shadow-sm">
              <Icon
                icon="lucide:graduation-cap"
                className="size-5"
                aria-hidden="true"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">
                OSU Eval Explorer
              </p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                Official instructor and course evaluations
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="size-2 rounded-full bg-ssle" aria-hidden="true" />
            <span className="hidden sm:inline">Official OSU snapshot</span>
            <span className="sm:hidden">Official data</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1480px] px-4 pb-16 pt-7 sm:px-6 lg:px-8 lg:pt-9">
        <div className="mb-7 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Find a course or instructor
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search the official evaluation snapshot with response context,
              transparent filters, and side-by-side comparisons.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground lg:pb-1">
            <Icon
              icon="lucide:calendar-range"
              className="size-4"
              aria-hidden="true"
            />
            <span>{statusText(result?.dataStatus)}</span>
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 lg:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">
              Search instructor, course, or subject
            </span>
            <Icon
              icon="lucide:search"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filters.query}
              onChange={(event) => updateFilter("query", event.target.value)}
              placeholder="Search instructor, course code, title, or subject"
              className="h-11 bg-card pl-10 text-sm shadow-sm"
            />
            {filters.query ? (
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                onClick={() => updateFilter("query", "")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground"
                aria-label="Clear search"
              >
                <Icon icon="lucide:x" className="size-4" aria-hidden="true" />
              </Button>
            ) : null}
          </label>
          <div className="flex gap-2 lg:hidden">
            <Drawer
              open={mobileFiltersOpen}
              onOpenChange={setMobileFiltersOpen}
            >
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="default"
                  type="button"
                  className="h-11 flex-1 bg-card"
                >
                  <Icon
                    icon="lucide:sliders-horizontal"
                    className="size-4"
                    aria-hidden="true"
                  />
                  Filters
                  {activeCount ? (
                    <Badge
                      variant="secondary"
                      className="rounded-full px-1.5 text-[10px]"
                    >
                      {activeCount}
                    </Badge>
                  ) : null}
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[90dvh] overflow-y-auto">
                <DrawerHeader className="text-left">
                  <DrawerTitle>Refine results</DrawerTitle>
                  <DrawerDescription>
                    Choose official reporting dimensions.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-4 pb-8">
                  <FilterControls
                    filters={filters}
                    facets={facets}
                    onChange={updateFilter}
                    onReset={resetFilters}
                  />
                </div>
              </DrawerContent>
            </Drawer>
            <Drawer
              open={mobileCompareOpen}
              onOpenChange={setMobileCompareOpen}
            >
              <DrawerTrigger asChild>
                <Button
                  variant={selected.length ? "default" : "outline"}
                  size="default"
                  type="button"
                  className="h-11 flex-1"
                >
                  <Icon
                    icon="lucide:columns-3"
                    className="size-4"
                    aria-hidden="true"
                  />
                  Compare{selected.length ? ` (${selected.length})` : ""}
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[90dvh]">
                <DrawerHeader>
                  <DrawerTitle>Compare records</DrawerTitle>
                  <DrawerDescription>
                    Choose two to four records.
                  </DrawerDescription>
                </DrawerHeader>
                <div className="overflow-y-auto px-4 pb-4">
                  <CompareSelectionList
                    targets={selected}
                    result={result}
                    onRemove={removeCompare}
                  />
                </div>
                <div className="border-t p-4">
                  <Button
                    variant="default"
                    size="lg"
                    type="button"
                    className="w-full"
                    disabled={selected.length < 2}
                    onClick={() => {
                      setMobileCompareOpen(false);
                      setCompareOpen(true);
                    }}
                  >
                    <Icon
                      icon="lucide:arrow-up-right"
                      className="size-4"
                      aria-hidden="true"
                    />
                    Open comparison
                  </Button>
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </div>

        {result?.dataStatus.isPreview ? (
          <Alert className="mb-6 border-brand/25 bg-accent/45">
            <Icon icon="lucide:info" aria-hidden="true" />
            <AlertTitle>Official snapshot preview</AlertTitle>
            <AlertDescription>
              PostgreSQL is not connected, so this workspace is reading the
              local verified official fixture. Metric definitions and coverage
              are unchanged.
            </AlertDescription>
          </Alert>
        ) : null}
        {searchError ? (
          <Alert variant="destructive" className="mb-6">
            <Icon icon="lucide:triangle-alert" aria-hidden="true" />
            <AlertTitle>Data unavailable</AlertTitle>
            <AlertDescription>{searchError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="mb-6">
          <SummaryStrip result={result} filters={filters} />
        </div>

        <div className="mb-4 flex flex-col gap-3 border-b pb-3 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={resultKind} onValueChange={changeKind}>
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="all">All records</TabsTrigger>
              <TabsTrigger value="instructors">Instructors</TabsTrigger>
              <TabsTrigger value="courses">Courses</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {isPending || isLoading
                  ? "Updating…"
                  : `${formatInteger(shownCount)} shown · ${formatInteger(totalCount)} matches`}
              </span>
              {activeCount ? (
                <Badge variant="secondary" className="rounded-full">
                  {activeCount} filters
                </Badge>
              ) : null}
            </div>
            <SortSelect
              value={sort}
              instrument={filters.instrument}
              onChange={changeSort}
            />
          </div>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px] xl:grid-cols-[252px_minmax(0,1fr)_300px]">
          <aside className="hidden lg:block">
            <Card className="sticky top-6 gap-0 rounded-xl py-0 shadow-sm">
              <CardContent className="px-4 py-4">
                <FilterControls
                  filters={filters}
                  facets={facets}
                  onChange={updateFilter}
                  onReset={resetFilters}
                />
              </CardContent>
            </Card>
          </aside>
          <section className="min-w-0" aria-label="Search results">
            <ResultsList
              result={result}
              resultKind={resultKind}
              selected={selected}
              isLoading={isLoading}
              onToggleCompare={toggleCompare}
              onOpen={setDetailTarget}
              onPageChange={setPage}
              error={searchError}
            />
          </section>
          <aside className="hidden lg:block">
            <CompareRail
              targets={selected}
              result={result}
              onRemove={removeCompare}
              onOpen={() => setCompareOpen(true)}
            />
          </aside>
        </div>

        <Separator className="my-8" />
        <div className="flex flex-col gap-4">
          <MetricLegend />
          <p className="max-w-5xl text-xs leading-5 text-muted-foreground">
            Ratings include response counts, response rates, and term coverage.
            SEI Item 10 overall ratings and SSLE all-item means are different
            instruments and are never ranked together. Rows excluded under FERPA
            are not present in the official source.
          </p>
        </div>
      </main>

      <DetailDialog
        target={detailTarget}
        open={Boolean(detailTarget)}
        onOpenChange={(open) => {
          if (!open) setDetailTarget(null);
        }}
      />
      <CompareDialog
        open={compareOpen && selected.length >= 2}
        targets={selected}
        onOpenChange={setCompareOpen}
      />
    </div>
  );
}
