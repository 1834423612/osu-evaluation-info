"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { registry } from "@/lib/diagnostics/protocol";
import { text, type Locale } from "@/lib/i18n";
import styles from "./statistics.module.css";
type Reading = {
  id: string;
  status: string;
  source: string;
  value?: unknown;
  detail?: string;
};
export function ReportDetail({
  detail,
  locale,
}: {
  detail: unknown;
  locale: Locale;
}) {
  const [mode, setMode] = useState<"visual" | "json">("visual"),
    [query, setQuery] = useState("");
  const report = detail as {
    id?: string;
    payload?: { results?: Reading[] };
    observed_context?: Reading[];
  };
  const readings = Array.isArray(report?.payload?.results)
    ? report.payload.results
    : [];
  const known = readings.filter((x) => x.status === "available").length;
  return (
    <>
      <div className={styles.detailTabs}>
        <Button
          size="sm"
          variant={mode === "visual" ? "secondary" : "ghost"}
          aria-pressed={mode === "visual"}
          onClick={() => setMode("visual")}
        >
          {text(locale, "Overview", "可视化")}
        </Button>
        <Button
          size="sm"
          variant={mode === "json" ? "secondary" : "ghost"}
          aria-pressed={mode === "json"}
          onClick={() => setMode("json")}
        >
          JSON
        </Button>
      </div>
      {mode === "json" ? (
        <pre className={styles.report}>{JSON.stringify(detail, null, 2)}</pre>
      ) : (
        <>
          <div className={styles.reportMetrics}>
            <span>
              <strong>{readings.length}</strong>
              {text(locale, "Readings", "检查项")}
            </span>
            <span>
              <strong>{known}</strong>
              {text(locale, "Available", "已获取")}
            </span>
            <span>
              <strong>{readings.length - known}</strong>
              {text(locale, "Other states", "其他状态")}
            </span>
          </div>
          <label className={styles.detailSearch}>
            {text(locale, "Find a field", "查找字段")}
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          {[
            {
              title: text(locale, "Browser report", "浏览器上报"),
              rows: readings,
            },
            {
              title: text(locale, "Server observations", "服务器观察值"),
              rows: report.observed_context ?? [],
            },
          ].map((section) => (
            <section key={section.title}>
              <h3 className={styles.detailSection}>{section.title}</h3>
              <div className={styles.readingGrid}>
                {section.rows
                  .filter((row) =>
                    [
                      row.id,
                      registry.find((x) => x.id === row.id)?.label[locale],
                      row.source,
                    ]
                      .join(" ")
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  )
                  .map((row) => (
                    <article key={row.id}>
                      <header>
                        <strong>
                          {registry.find((x) => x.id === row.id)?.label[
                            locale
                          ] ?? row.id}
                        </strong>
                        <span data-available={row.status === "available"}>
                          {row.status}
                        </span>
                      </header>
                      <p>
                        {row.value === undefined
                          ? "—"
                          : typeof row.value === "object"
                            ? JSON.stringify(row.value, null, 2)
                            : String(row.value)}
                      </p>
                      <small>
                        {row.source}
                        {row.detail ? " · " + row.detail : ""}
                      </small>
                    </article>
                  ))}
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
