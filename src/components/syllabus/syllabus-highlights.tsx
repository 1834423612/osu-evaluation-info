import { extractSyllabusHighlights } from "@/lib/syllabus/content";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus.module.css";

/** Can also be mounted in comparisons or saved-course views with an existing document. */
export function SyllabusHighlights({
  document,
  locale,
}: {
  document: SyllabusDocument;
  locale: Locale;
}) {
  const highlights = extractSyllabusHighlights(document);
  if (!highlights.length) return null;
  return (
    <details className={styles.highlights}>
      <summary>
        {text(
          locale,
          "Readings, grading & schedule · source excerpts",
          "教材、评分与课表 · 原文摘录",
        )}
      </summary>
      <div>
        {highlights.map((highlight) => (
          <section key={highlight.sectionId}>
            <strong>{highlight.title}</strong>
            <p>{highlight.excerpt}…</p>
          </section>
        ))}
      </div>
    </details>
  );
}
