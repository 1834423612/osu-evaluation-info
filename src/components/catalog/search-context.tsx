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
}: {
  result: CatalogResponse;
  locale: Locale;
  onChoose: (query: string, clearSubject?: boolean) => void;
  onClearSubject: () => void;
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
      <p>
        {info.conflict
          ? text(
              locale,
              "The subject in your query conflicts with the selected subject filter.",
              "查询中的学科与已选学科筛选不一致。",
            )
          : info.kind === "subject"
            ? text(
                locale,
                `Showing courses in the ${info.subject} subject.`,
                `已按学科 ${info.subject} 查找，结果仅包含此学科。`,
              )
            : info.kind === "course" && info.interpretedQuery !== info.query
              ? text(
                  locale,
                  `Recognized as ${info.interpretedQuery}. Course numbers are never silently changed.`,
                  `识别为 ${info.interpretedQuery}，不会自动改写课程编号。`,
                )
              : info.kind === "course"
                ? text(
                    locale,
                    "Matches this exact subject and course number in the selected term.",
                    "按所选学期精确查找此学科与课程编号。",
                  )
                : info.descriptionMatches
                  ? text(
                      locale,
                      "No direct title matches in this result set. These courses match all keywords in their descriptions.",
                      "当前结果中没有直接的标题匹配，以下课程在介绍中同时包含这些关键词。",
                    )
                  : info.kind === "keyword"
                    ? text(
                        locale,
                        "All keywords must match. Course titles appear before description-only matches.",
                        "关键词需共同匹配，课程标题优先于介绍中的提及。",
                      )
                    : text(
                        locale,
                        "Matches course numbers and their prefixes; prerequisite mentions are excluded.",
                        "按课程编号或编号前缀匹配，排除先修说明中的编号提及。",
                      )}
      </p>
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
        return choices.length ? (
          <div className={styles.suggestions} key={String(label)}>
            <span>{label}</span>
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
          </div>
        ) : null;
      })}
    </section>
  );
}
