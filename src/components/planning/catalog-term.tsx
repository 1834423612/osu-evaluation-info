"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { useEffect, useState } from "react";
import { fetchCatalogResource } from "@/lib/catalog/browser-transport";
import type { CatalogTerm } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";

export function CatalogTermSelect({
  value,
  onChange,
  locale,
}: {
  value: string;
  onChange: (value: string) => void;
  locale: Locale;
}) {
  const [terms, setTerms] = useState<CatalogTerm[]>([]);
  useEffect(() => {
    const controller = new AbortController();
    fetchCatalogResource("/api/catalog/facets", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        if (!controller.signal.aborted && Array.isArray(data.terms))
          setTerms(data.terms);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);
  return (
    <ChoiceSelect
      aria-label={text(locale, "Catalog term", "课程目录学期")}
      value={value}
      onValueChange={onChange}
    >
      <option value="">
        {text(locale, "Latest available", "最新可用学期")}
      </option>
      {terms.map((term) => (
        <option key={term.code} value={term.code}>
          {term.label}
        </option>
      ))}
    </ChoiceSelect>
  );
}
