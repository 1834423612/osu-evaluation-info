import { ExternalLink } from "lucide-react";
import { reference as en } from "@/content/reference/en";
import { reference as zh } from "@/content/reference/zh";
import type { ReferenceTopic } from "@/content/reference/types";
import type { Locale } from "@/lib/i18n";
import styles from "./reference.module.css";

export function ReferenceContent({
  topic,
  locale,
}: {
  topic: ReferenceTopic;
  locale: Locale;
}) {
  const copy = locale === "zh" ? zh : en;
  return (
    <div className={styles.content} data-reference-content={topic.id}>
      {topic.sections.map((section) => (
        <section key={section.title}>
          <h3>{section.title}</h3>
          {section.body?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {section.entries ? (
            <ol
              className={styles.entries}
              data-numbered={section.ordered || undefined}
            >
              {section.entries.map((entry, index) => (
                <li key={entry.title}>
                  {entry.code ? (
                    <code>{entry.code}</code>
                  ) : section.ordered ? (
                    <span className={styles.itemNumber}>{index + 1}</span>
                  ) : null}
                  <div>
                    <div className={styles.entryTitle}>
                      {entry.title}
                      {entry.badge ? <span>{entry.badge}</span> : null}
                    </div>
                    {entry.detail ? <p>{entry.detail}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : null}
          {section.scale ? (
            <ol className={styles.scale}>
              {section.scale.map((item) => (
                <li key={item.value} data-value={item.value}>
                  <b>{item.value}</b>
                  <span>{item.label}</span>
                </li>
              ))}
            </ol>
          ) : null}
          {section.formula ? (
            <details className={styles.formula}>
              <summary>{copy.formula}</summary>
              <div
                className={styles.equation}
                role="math"
                aria-label={copy.equation}
              >
                <i>S</i>
                <span>=</span>
                <span className={styles.fraction}>
                  <span>
                    ∑ n<sub>i</sub> m<sub>i</sub> 2
                    <sup>
                      −a<sub>i</sub>/2
                    </sup>
                  </span>
                  <span>
                    ∑ n<sub>i</sub> 2
                    <sup>
                      −a<sub>i</sub>/2
                    </sup>
                  </span>
                </span>
              </div>
              <p>{copy.variables}</p>
            </details>
          ) : null}
        </section>
      ))}
      <footer className={styles.sources}>
        <h3>{copy.sources}</h3>
        {topic.sources.map((source) => (
          <a
            key={source.url}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            {source.title}
            <ExternalLink size={12} />
          </a>
        ))}
        <small>{copy.checked}</small>
      </footer>
    </div>
  );
}
