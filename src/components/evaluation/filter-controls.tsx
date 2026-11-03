"use client";

import { Icon } from "@iconify/react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { FacetValue, Instrument } from "@/lib/api/types";

export type ExplorerFilters = {
  instrument: Instrument | "";
  subject: string;
  college: string;
  campus: string;
  department: string;
  deliveryMode: string;
  classSizeCategory: string;
  term: string;
  query: string;
};

export type FilterFacetSet = {
  terms: FacetValue[];
  subjects: FacetValue[];
  colleges: FacetValue[];
  campuses: FacetValue[];
  departments: FacetValue[];
  deliveryModes: FacetValue[];
  classSizeCategories: FacetValue[];
};

type FilterControlsProps = {
  filters: ExplorerFilters;
  facets: FilterFacetSet;
  onChange: (key: keyof ExplorerFilters, value: string) => void;
  onReset: () => void;
};

type SelectFilterProps = {
  label: string;
  value: string;
  placeholder: string;
  items: FacetValue[];
  onValueChange: (value: string) => void;
};

function SelectFilter({
  label,
  value,
  placeholder,
  items,
  onValueChange,
}: SelectFilterProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground/75">{label}</span>
      <Select value={value || "all"} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-full bg-background text-xs">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">{placeholder}</SelectItem>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                <span className="max-w-56 truncate">{item.label}</span>
                <span className="text-muted-foreground">
                  {item.count.toLocaleString()}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

function InstrumentFilter({
  value,
  onValueChange,
}: {
  value: Instrument | "";
  onValueChange: (value: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground/75">
        Evaluation instrument
      </span>
      <Select value={value || "all"} onValueChange={onValueChange}>
        <SelectTrigger className="h-9 w-full bg-background text-xs">
          <SelectValue placeholder="All instruments" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value="all">All instruments</SelectItem>
            <SelectItem value="SEI">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-sei" />
                SEI only
              </span>
            </SelectItem>
            <SelectItem value="SSLE">
              <span className="inline-flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-ssle" />
                SSLE only
              </span>
            </SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </label>
  );
}

export function countActiveFilters(filters: ExplorerFilters) {
  return [
    filters.instrument,
    filters.subject,
    filters.college,
    filters.campus,
    filters.department,
    filters.deliveryMode,
    filters.classSizeCategory,
    filters.term,
  ].filter(Boolean).length;
}

export function FilterControls({
  filters,
  facets,
  onChange,
  onReset,
}: FilterControlsProps) {
  const selectedCount = countActiveFilters(filters);

  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">Refine results</h2>
            {selectedCount ? (
              <Badge
                variant="secondary"
                className="rounded-full px-1.5 text-[10px]"
              >
                {selectedCount}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Narrow the official reporting snapshot.
          </p>
        </div>
        <Button
          variant="ghost"
          size="xs"
          type="button"
          onClick={onReset}
          disabled={!selectedCount}
          className="shrink-0 text-muted-foreground"
        >
          <Icon
            icon="lucide:rotate-ccw"
            data-icon="inline-start"
            aria-hidden="true"
          />
          Reset
        </Button>
      </div>

      <Accordion
        type="multiple"
        defaultValue={["basics", "advanced"]}
        className="w-full"
      >
        <AccordionItem value="basics">
          <AccordionTrigger className="py-3 text-xs uppercase tracking-[0.08em] text-muted-foreground hover:no-underline">
            Basics
          </AccordionTrigger>
          <AccordionContent className="grid gap-3">
            <InstrumentFilter
              value={filters.instrument}
              onValueChange={(value) =>
                onChange("instrument", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="Subject"
              value={filters.subject}
              placeholder="All subjects"
              items={facets.subjects}
              onValueChange={(value) =>
                onChange("subject", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="College"
              value={filters.college}
              placeholder="All colleges"
              items={facets.colleges}
              onValueChange={(value) =>
                onChange("college", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="Term"
              value={filters.term}
              placeholder="All terms"
              items={facets.terms}
              onValueChange={(value) =>
                onChange("term", value === "all" ? "" : value)
              }
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="advanced">
          <AccordionTrigger className="py-3 text-xs uppercase tracking-[0.08em] text-muted-foreground hover:no-underline">
            Advanced
          </AccordionTrigger>
          <AccordionContent className="grid gap-3">
            <SelectFilter
              label="Campus"
              value={filters.campus}
              placeholder="All campuses"
              items={facets.campuses}
              onValueChange={(value) =>
                onChange("campus", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="Department"
              value={filters.department}
              placeholder="All departments"
              items={facets.departments}
              onValueChange={(value) =>
                onChange("department", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="Delivery mode"
              value={filters.deliveryMode}
              placeholder="All delivery modes"
              items={facets.deliveryModes}
              onValueChange={(value) =>
                onChange("deliveryMode", value === "all" ? "" : value)
              }
            />
            <SelectFilter
              label="Class size"
              value={filters.classSizeCategory}
              placeholder="All class sizes"
              items={facets.classSizeCategories}
              onValueChange={(value) =>
                onChange("classSizeCategory", value === "all" ? "" : value)
              }
            />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-4 border-t pt-3">
        <p className="flex items-start gap-2 text-[11px] leading-4 text-muted-foreground">
          <Icon
            icon="lucide:info"
            className="mt-0.5 size-3.5 shrink-0 text-brand"
            aria-hidden="true"
          />
          SEI and SSLE remain separate instruments with different rating
          definitions.
        </p>
      </div>
    </div>
  );
}

export function instrumentFromFilter(value: string): Instrument | "" {
  return value === "SEI" || value === "SSLE" ? value : "";
}
