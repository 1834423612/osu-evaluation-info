"use client";
import { Search, ArrowUpRight } from "lucide-react";
import type { CatalogResponse } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./search-context.module.css";

export function SearchContext({
  result,
  locale,
  onChoose,
  onClearSubject,
  onSwitchMode,
  liveMode = false,
}: {
  result: CatalogResponse;
  locale: Locale;
  onChoose: (query: string, clearSubject?: boolean) => void;
  onClearSubject: () => void;
  onSwitchMode?: (mode: "live" | "index") => void;
  liveMode?: boolean;
}) {
  const info = result.searchInfo;
  if (!info?.query) return null;
  const subjects = info.suggestions.filter((item) => item.kind === "subject");
  const courses = info.suggestions.filter((item) => item.kind === "course");
  const numbers = info.suggestions.filter((item) => item.kind === "number");
  const groups = [
    {
      choices: subjects,
      label: text(locale, "Narrow by subject", "也可按学科查找"),
    },
    {
      choices: courses,
      label: text(
        locale,
        "Similar available courses — choose to search",
        "相近的已开课程，可点击重新查询",
      ),
    },
    {
      choices: numbers,
      label: text(
        locale,
        "Search this number across subjects",
        "只按编号跨学科查找",
      ),
    },
  ];
  return (
    <section
      className={styles.context}
      data-search-context
      aria-label={text(
        locale,
        "Search interpretation and suggestions",
        "搜索说明与建议",
      )}
    >
      <div className={styles.heading}>
        <Search size={15} />
        <strong>
          {text(
            locale,
            `Results for “${info.query}”`,
            `“${info.query}”的搜索结果`,
          )}
        </strong>
        <span>
          {info.kind === "subject"
            ? text(locale, "Subject", "学科")
            : info.kind === "course"
              ? text(locale, "Course code", "课程代码")
              : info.kind === "number"
                ? text(locale, "Course number", "课程编号")
                : text(locale, "Keywords", "关键词")}
        </span>
      </div>
      {info.conflict || info.fallbackReason || info.relaxed ? (
        <p>
          {info.conflict
            ? text(
                locale,
                "Query and subject filter differ.",
                "查询与学科筛选不一致。",
              )
            : info.fallbackReason
              ? text(
                  locale,
                  "Live search · Limited typo correction",
                  "官方实时查询 · 容错有限",
                )
              : text(locale, "Partial keyword matches", "部分关键词匹配")}
        </p>
      ) : null}
      {onSwitchMode ? (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onSwitchMode(liveMode ? "index" : "live")}
        >
          {liveMode
            ? text(locale, "Use tolerant catalog search", "使用容错目录搜索")
            : text(
                locale,
                "Check with live official search",
                "改用官方实时查询",
              )}
        </button>
      ) : null}
      {info.conflict ? (
        <button className={styles.clear} type="button" onClick={onClearSubject}>
          {text(locale, "Remove subject filter", "移除学科筛选")}
        </button>
      ) : null}
      {!info.complete && result.hasMore ? (
        <small>
          {text(
            locale,
            "More matches may be available on subsequent pages.",
            "当前展示一组匹配结果，可翻页继续查找。",
          )}
        </small>
      ) : null}
      {groups.map(({ choices, label }) => {
        const expandable =
          choices[0]?.kind === "course" && result.courses.length > 0;
        const Group = expandable ? "details" : "div";
        return choices.length ? (
          <Group className={styles.suggestions} key={`${info.query}:${label}`}>
            {expandable ? (
              <summary>
                {label} ({choices.length})
              </summary>
            ) : (
              <span>{label}</span>
            )}
            <div>
              {choices.slice(0, 6).map((choice) => (
                <button
                  key={choice.query}
                  type="button"
                  onClick={() =>
                    onChoose(choice.query, choice.kind === "number")
                  }
                  data-search-suggestion={choice.query}
                >
                  {choice.label}
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          </Group>
        ) : null;
      })}
    </section>
  );
}
