"use client";
import { useSyncExternalStore } from "react";
import { ArrowRight, BookOpen } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import { reference as en } from "@/content/reference/en";
import { reference as zh } from "@/content/reference/zh";
import { ReferenceContent } from "./reference-content";
import styles from "./reference.module.css";

const subscribe = (listener: () => void) => {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
};
const snapshot = () => window.location.hash.slice(1);
export function ReferencePage() {
  const { locale } = usePreferences();
  const copy = locale === "zh" ? zh : en;
  const hash = useSyncExternalStore(subscribe, snapshot, () => "");
  const selected =
    copy.topics.find((topic) => topic.id === hash) ?? copy.topics[0];
  return (
    <>
      <AppHeader active="reference" />
      <main className={styles.page}>
        <header className={styles.hero}>
          <span className={styles.category}>
            <BookOpen size={15} />
            {copy.eyebrow}
          </span>
          <h1>{copy.title}</h1>
          <p>{copy.intro}</p>
        </header>
        <div className={styles.pageLayout}>
          <nav className={styles.topicNav} aria-label={copy.contents}>
            <strong>{copy.contents}</strong>
            {copy.topics.map((topic) => (
              <a
                href={`#${topic.id}`}
                key={topic.id}
                aria-current={selected.id === topic.id ? "true" : undefined}
              >
                <span>
                  <small>{topic.category}</small>
                  {topic.title}
                </span>
                <ArrowRight size={14} />
              </a>
            ))}
          </nav>
          <article className={styles.topic} key={selected.id}>
            <header className={styles.topicHeading}>
              <span className={styles.category}>{selected.category}</span>
              <h2>{selected.title}</h2>
              <p>{selected.summary}</p>
            </header>
            <ReferenceContent topic={selected} locale={locale} />
          </article>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
