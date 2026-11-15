"use client";
import { useState } from "react";
import Link from "next/link";
import { Languages, ShieldCheck } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { text, type Locale } from "@/lib/i18n";
import type { LegalContent, LegalDocument } from "@/content/legal/policy";
import styles from "./legal.module.css";
export function LegalPage({
  document,
  en,
  zh,
}: {
  document: LegalDocument;
  en: LegalContent;
  zh: LegalContent;
}) {
  const { locale: preferred } = usePreferences();
  const [override, setOverride] = useState<Locale | null>(null);
  const locale = override ?? preferred,
    content = locale === "zh" ? zh : en;
  return (
    <>
      <AppHeader />
      <main className={styles.shell} lang={locale === "zh" ? "zh-CN" : "en"}>
        <div className={styles.top}>
          <span>
            <ShieldCheck size={16} />
            {text(locale, "Your account, your choices", "账号与个人选择")}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOverride(locale === "zh" ? "en" : "zh")}
          >
            <Languages size={14} />
            {locale === "zh" ? "English" : "简体中文"}
          </Button>
        </div>
        <nav
          className={styles.nav}
          aria-label={text(locale, "Related notices", "关联说明")}
        >
          {(
            [
              ["terms", "Terms", "使用条款"],
              ["privacy", "Privacy", "隐私说明"],
              ["security", "Account security", "账号数据与安全"],
            ] as const
          ).map(([id, en, zh]) => (
            <Link
              key={id}
              href={("/legal/" + id) as "/legal/terms"}
              aria-current={document === id ? "page" : undefined}
            >
              {text(locale, en, zh)}
            </Link>
          ))}
        </nav>
        <h1>{content.title}</h1>
        <p className={styles.intro}>{content.intro}</p>
        <article>
          {content.sections.map((section, index) => (
            <section key={section.title}>
              <h2>
                {index + 1}. {section.title}
              </h2>
              {section.paragraphs.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </section>
          ))}
        </article>
        <div className={styles.contact}>
          <a href="https://kjch.net/" target="_blank" rel="noreferrer">
            {text(locale, "Contact maintainer", "联系维护者")}
          </a>
          <a
            href="https://github.com/1834423612/osu-evaluation-info/issues"
            target="_blank"
            rel="noreferrer"
          >
            {text(locale, "Report an issue", "反馈问题")}
          </a>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
