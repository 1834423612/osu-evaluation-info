"use client";

import { useId, useState } from "react";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { CatalogFacet } from "@/lib/catalog/types";
import { campusOptions, facetLabels, text, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const PRIMARY = [
  "subject",
  "campus",
  "academic-career",
  "instruction-mode",
  "gen-categories",
  "enrollment-status",
];
const CHIP_FILTERS = new Set([
  "campus",
  "academic-career",
  "instruction-mode",
  "enrollment-status",
]);
const ALL_VALUE = "__all";

export function FilterPanel({
  facets,
  params,
  locale,
  onChange,
  onReset,
}: {
  facets: CatalogFacet[];
  params: URLSearchParams;
  locale: Locale;
  onChange: (key: string, value: string) => void;
  onReset: () => void;
}) {
  const prefix = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const sourceCampus = facets.find((facet) => facet.slug === "campus");
  const available = [
    ...facets.filter(
      (facet) =>
        facet.slug !== "term" &&
        facet.slug !== "campus" &&
        facet.items.length > 0,
    ),
    {
      slug: "campus",
      title: sourceCampus?.title ?? "Campus",
      items: sourceCampus?.items ?? [],
    },
  ];
  const primary = PRIMARY.map((key) =>
    available.find((facet) => facet.slug === key),
  ).filter((facet): facet is CatalogFacet => !!facet);
  const secondary = available.filter((facet) => !PRIMARY.includes(facet.slug));

  function labelFor(slug: string, fallback: string) {
    const labels = facetLabels[slug];
    return labels ? labels[locale === "en" ? 0 : 1] : fallback;
  }

  function campusItems(facet: CatalogFacet) {
    const items = new Map<
      string,
      { value: string; label: string; count: number }
    >(
      campusOptions.map((campus) => [
        campus.value,
        {
          value: campus.value,
          label: campus[locale],
          count: 0,
        },
      ]),
    );
    for (const item of facet.items) {
      const value = item.value.toLowerCase();
      if (value === "all") continue;
      const known = items.get(value);
      items.set(value, {
        value,
        label: known?.label ?? item.label,
        count: item.count,
      });
    }
    return [...items.values()];
  }

  function field(facet: CatalogFacet) {
    const id = `${prefix}-filter-${facet.slug}`;
    const label = labelFor(facet.slug, facet.title);
    const items = facet.slug === "campus" ? campusItems(facet) : facet.items;
    const selected =
      params.get(facet.slug) ?? (facet.slug === "campus" ? "col" : "");

    if (CHIP_FILTERS.has(facet.slug)) {
      return (
        <fieldset className="filter-field filter-chip-field" key={facet.slug}>
          <legend id={id}>{label}</legend>
          <div className="filter-chip-list" role="group" aria-labelledby={id}>
            <Button
              type="button"
              variant={
                selected === (facet.slug === "campus" ? "all" : "")
                  ? "default"
                  : "outline"
              }
              size="sm"
              aria-pressed={
                facet.slug === "campus" ? selected === "all" : !selected
              }
              className="filter-chip"
              onClick={() =>
                onChange(facet.slug, facet.slug === "campus" ? "all" : "")
              }
            >
              {text(locale, "All", "全部")}
            </Button>
            {items.map((item) => (
              <Button
                key={item.value}
                type="button"
                variant={selected === item.value ? "default" : "outline"}
                size="sm"
                aria-pressed={selected === item.value}
                className="filter-chip"
                onClick={() => onChange(facet.slug, item.value)}
              >
                <span>{item.label}</span>
                {item.count > 0 ? (
                  <span className="filter-chip-count">
                    {item.count.toLocaleString()}
                  </span>
                ) : null}
              </Button>
            ))}
          </div>
        </fieldset>
      );
    }

    return (
      <div className="filter-field" key={facet.slug}>
        <label id={id}>{label}</label>
        <Select
          value={selected || ALL_VALUE}
          onValueChange={(value) =>
            onChange(facet.slug, value === ALL_VALUE ? "" : value)
          }
        >
          <SelectTrigger
            id={`${id}-control`}
            aria-labelledby={id}
            className="filter-select"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>
              {text(locale, "All", "全部")}
            </SelectItem>
            {items
              .filter((item) => item.value)
              .map((item) => (
                <SelectItem value={item.value} key={item.value}>
                  {item.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="filters-content">
      <div className="filters-title">
        <span>
          <SlidersHorizontal size={16} />
          {text(locale, "Filters", "筛选条件")}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label={text(locale, "Reset filters", "重置筛选")}
          title={text(locale, "Reset filters", "重置筛选")}
        >
          <RotateCcw />
        </Button>
      </div>
      {primary.map(field)}
      {secondary.length ? (
        <Collapsible open={moreOpen} onOpenChange={setMoreOpen}>
          <CollapsibleTrigger className="more-filters-trigger">
            {text(locale, "More filters", "更多筛选")}
            <ChevronDown className={moreOpen ? "is-open" : undefined} />
          </CollapsibleTrigger>
          <CollapsibleContent className="more-filters-content">
            {secondary.map(field)}
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      <div className="filter-footnote">
        <span className="source-dot" />
        {text(locale, "Ohio State class search", "俄亥俄州立大学官方课程")}
      </div>
    </div>
  );
}
