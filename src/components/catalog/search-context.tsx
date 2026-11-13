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
      <p>
        {info.conflict
          ? text(
              locale,
              "The subject in your query conflicts with the selected subject filter.",
              "查询中的学科与已选学科筛选不一致。",
            )
          : info.fallbackReason
            ? text(
                locale,
                info.fallbackReason === "filter"
                  ? "This filter uses live official search. Spelling correction is limited in this mode."
                  : "The full-catalog index is temporarily unavailable. Showing live official search with limited spelling correction.",
                info.fallbackReason === "filter"
                  ? "此筛选使用官方实时查询，当前模式的拼写容错能力有限。"
                  : "完整目录索引暂不可用，当前已改用官方实时查询，拼写容错能力有限。",
              )
            : result.sourceMode === "index"
              ? info.relaxed
                ? text(
                    locale,
                    "No close full-query match. These courses match most keywords; partial matches are marked below.",
                    "未找到足够接近的完整匹配，以下结果匹配多数关键词，已逐条标注部分匹配。",
                  )
                : info.corrections?.length
                  ? text(
                      locale,
                      "Includes close spellings and course numbers. Check the match explanation on each result.",
                      "已纳入相近拼写、简称或课程编号，请结合各条结果的匹配说明选择。",
                    )
                  : text(
                      locale,
                      "Searching the complete synced catalog, with course identities and titles ranked before descriptions.",
                      "检索完整的已同步课程目录，课程代码和标题优先于介绍中的提及。",
                    )
              : info.kind === "subject"
                ? text(
                    locale,
                    `Showing courses in the ${info.subject} subject.`,
                    `已按学科 ${info.subject} 查找，结果仅包含此学科。`,
                  )
                : info.kind === "course" &&
                    info.interpretedQuery &&
                    info.interpretedQuery !== info.query
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
