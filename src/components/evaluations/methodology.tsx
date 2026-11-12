"use client";
import { ArrowUpRight } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import { methodology as en } from "@/content/methodology/en";
import { methodology as zh } from "@/content/methodology/zh";
import styles from "./methodology.module.css";
export function Methodology() {
  const { locale } = usePreferences();
  const copy = locale === "zh" ? zh : en;
  return (
    <>
      <AppHeader active="methodology" />
      <main className={`${styles.shell} ${copy.className}`}>
        <header className={styles.heading}>
          <div>
            <span className={styles.eyebrow}>{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p>{copy.intro}</p>
          </div>
        </header>
        <ol className={styles.steps}>
          {copy.steps.map((step, index) => (
            <li key={step.title}>
              <span>0{index + 1}</span>
              <div>
                <h2>{step.title}</h2>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
        <div className={styles.layout}>
          <nav className={styles.toc} aria-label={copy.navigation}>
            <strong>{copy.navigation}</strong>
            {copy.sections.map((section) => (
              <a href={`#${section.id}`} key={section.id}>
                {section.title}
              </a>
            ))}
          </nav>
          <article className={styles.article}>
            {copy.sections.map((section, index) => (
              <section id={section.id} key={section.id}>
                <span className={styles.sectionNumber}>0{index + 1}</span>
                <h2>{section.title}</h2>
                {section.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.facts ? (
                  <ul>
                    {section.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                ) : null}
                {section.link ? (
                  <a
                    className={styles.source}
                    href={section.link.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {section.link.label}
                    <ArrowUpRight size={13} />
                  </a>
                ) : null}
              </section>
            ))}
          </article>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
