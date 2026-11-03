"use client";

import { useId, useState } from "react";
import {
  BookOpen,
  Building2,
  CalendarDays,
  Clock3,
  GraduationCap,
  Layers3,
  ListFilter,
  MonitorPlay,
  Search,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { CatalogFacet } from "@/lib/catalog/types";
import { campusOptions, facetLabels, text, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

const PRIMARY = [
  "subject",
  "campus",
  "gen-categories",
  "academic-career",
  "instruction-mode",
  "enrollment-status",
];
const ICONS: Record<string, LucideIcon> = {
  subject: BookOpen,
  campus: Building2,
  "gen-categories": GraduationCap,
  "academic-career": GraduationCap,
  "instruction-mode": MonitorPlay,
  "enrollment-status": UsersRound,
  "catalog-number": ListFilter,
  "class-session": CalendarDays,
  component: Layers3,
  "meeting-days": CalendarDays,
  "academic-program": Sparkles,
  "class-attribute": Sparkles,
  "class-attribute-value": Sparkles,
  evening: Clock3,
};
const QUICK_ITEM_COUNT = 8;

type FilterItem = CatalogFacet["items"][number];

function FilterFacet({
  facet,
  items,
  selected,
  label,
  locale,
  onChange,
}: {
  facet: CatalogFacet;
  items: FilterItem[];
  selected: string;
  label: string;
  locale: Locale;
  onChange: (key: string, value: string) => void;
}) {
  const id = useId();
  const [search, setSearch] = useState("");
  const Icon = ICONS[facet.slug] ?? SlidersHorizontal;
  const searchable =
    facet.slug === "subject" ||
    facet.slug === "gen-categories" ||
    items.length > 8;
  const orderedItems = searchable
    ? items.toSorted(
        (a, b) => b.count - a.count || a.label.localeCompare(b.label),
      )
    : items;
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const selectedItem = orderedItems.find((item) => item.value === selected);
  const matchingItems = normalizedSearch
    ? orderedItems.filter(
        (item) =>
          item.label.toLocaleLowerCase().includes(normalizedSearch) ||
          item.value.toLocaleLowerCase().includes(normalizedSearch),
      )
    : [
        ...new Map(
          [
            ...orderedItems.slice(0, QUICK_ITEM_COUNT),
            ...(selectedItem ? [selectedItem] : []),
          ].map((item) => [item.value, item]),
        ).values(),
      ];

  return (
    <fieldset
      className={
        searchable
          ? "filter-field filter-chip-field searchable-filter"
          : "filter-field filter-chip-field"
      }
      key={facet.slug}
    >
      <legend id={`${id}-label`}>
        <Icon aria-hidden="true" />
        <span>{label}</span>
      </legend>
      {searchable ? (
        <label className="filter-search" htmlFor={`${id}-search`}>
          <Search aria-hidden="true" />
          <input
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
            placeholder={text(
              locale,
              `Search ${label.toLocaleLowerCase()}…`,
              `搜索${label}…`,
            )}
          />
          {normalizedSearch ? (
            <span className="filter-match-count" aria-live="polite">
              {matchingItems.length}
            </span>
          ) : null}
        </label>
      ) : null}
      <div
        className="filter-chip-list"
        role="group"
        aria-labelledby={`${id}-label`}
      >
        {facet.slug === "campus" ? (
          <Button
            type="button"
            variant={selected === "all" ? "default" : "outline"}
            size="sm"
            aria-pressed={selected === "all"}
            className="filter-chip"
            onClick={() => onChange(facet.slug, "all")}
          >
            {text(locale, "All campuses", "全部校区")}
          </Button>
        ) : (
          <Button
            type="button"
            variant={!selected ? "default" : "outline"}
            size="sm"
            aria-pressed={!selected}
            className="filter-chip"
            onClick={() => onChange(facet.slug, "")}
          >
            {text(locale, "All", "全部")}
          </Button>
        )}
        {matchingItems.map((item) => (
          <Button
            key={item.value}
            type="button"
            variant={selected === item.value ? "default" : "outline"}
            size="sm"
            aria-pressed={selected === item.value}
            className="filter-chip"
            onClick={() =>
              onChange(facet.slug, selected === item.value ? "" : item.value)
            }
          >
            <span>{item.label}</span>
            {item.count > 0 ? (
              <span className="filter-chip-count">
                {item.count.toLocaleString()}
              </span>
            ) : null}
          </Button>
        ))}
        {!matchingItems.length ? (
          <span className="filter-no-matches">
            {text(locale, "No matches", "没有匹配项")}
          </span>
        ) : null}
      </div>
      {searchable &&
      !normalizedSearch &&
      orderedItems.length > QUICK_ITEM_COUNT ? (
        <span className="filter-helper">
          {text(
            locale,
            `Top ${QUICK_ITEM_COUNT} · search to find any option`,
            `显示常用 ${QUICK_ITEM_COUNT} 项 · 搜索可查找全部选项`,
          )}
        </span>
      ) : null}
    </fieldset>
  );
}

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
  const sourceCampus = facets.find((facet) => facet.slug === "campus");
  const available = [
    ...facets.filter(
      (facet) =>
        facet.slug !== "term" && facet.slug !== "campus" && facet.items.length,
    ),
    {
      slug: "campus",
      title: sourceCampus?.title ?? "Campus",
      items: sourceCampus?.items ?? [],
    },
  ];
  const ordered = [
    ...PRIMARY.flatMap((slug) =>
      available.filter((facet) => facet.slug === slug),
    ),
    ...available.filter((facet) => !PRIMARY.includes(facet.slug)),
  ];

  function labelFor(slug: string, fallback: string) {
    const labels = facetLabels[slug];
    return labels ? labels[locale === "en" ? 0 : 1] : fallback;
  }

  function campusItems(facet: CatalogFacet) {
    const items = new Map<string, FilterItem>(
      campusOptions.map((campus) => [
        campus.value,
        {
          value: campus.value,
          label: campus[locale],
          count: 0,
          selected: false,
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
        selected: item.selected,
      });
    }
    return [...items.values()];
  }

  return (
    <div className="filters-content">
      <div className="filters-title">
        <span>
          <SlidersHorizontal aria-hidden="true" />
          {text(locale, "All filters", "全部筛选")}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label={text(locale, "Reset filters", "重置筛选")}
          title={text(locale, "Reset filters", "重置筛选")}
        >
          <RotateCcw />
        </Button>
      </div>
      <div className="filter-groups">
        {ordered.map((facet) => {
          const items =
            facet.slug === "campus" ? campusItems(facet) : facet.items;
          return (
            <FilterFacet
              key={facet.slug}
              facet={facet}
              items={items}
              selected={
                params.get(facet.slug) ??
                (facet.slug === "campus" ? "col" : "")
              }
              label={labelFor(facet.slug, facet.title)}
              locale={locale}
              onChange={onChange}
            />
          );
        })}
      </div>
      <div className="filter-footnote">
        <span className="source-dot" />
        {text(locale, "Ohio State class search", "俄亥俄州立大学官方课程")}
      </div>
    </div>
  );
}
