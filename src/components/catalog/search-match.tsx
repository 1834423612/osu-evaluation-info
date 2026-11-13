import type { SearchEvidence } from "@/lib/search/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./search-match.module.css";

export function SearchMatch({
  evidence,
  locale,
}: {
  evidence?: SearchEvidence;
  locale: Locale;
}) {
  if (
    !evidence ||
    (evidence.mode === "exact" && !evidence.fields.includes("description"))
  )
    return null;
  const description =
    evidence.fields.includes("description") &&
    !evidence.fields.includes("title");
  return (
    <div className={styles.match} data-search-match={evidence.mode}>
      <span className={styles.label}>
        {evidence.mode === "relaxed"
          ? text(locale, "Partial match", "部分关键词匹配")
          : evidence.mode === "fuzzy"
            ? text(locale, "Close match", "相近匹配")
            : description
              ? text(locale, "Description match", "介绍片段匹配")
              : text(locale, "Prefix match", "前缀匹配")}
      </span>
      {evidence.corrections.length ? (
        <span>
          {evidence.corrections
            .slice(0, 3)
            .map((item) => `${item.from} → ${item.to}`)
            .join(" · ")}
        </span>
      ) : null}
      {description && evidence.snippet ? <p>{evidence.snippet}</p> : null}
    </div>
  );
}
