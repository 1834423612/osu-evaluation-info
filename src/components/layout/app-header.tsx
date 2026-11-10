"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Bookmark, ArrowUpRight, Languages } from "lucide-react";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { brand, localizedDocumentTitle } from "@/lib/brand";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ActionToast } from "./action-toast";
import { LanguageNotice } from "./language-notice";
import { TranslationGuide } from "@/components/translation/translation-guide";
import { BrowserModelDownload } from "@/components/translation/browser-model-download";
import { DebugTools } from "@/components/debug/debug-tools";
import { ScrollToTop } from "./scroll-to-top";
import styles from "./language-controls.module.css";

export function AppHeader({
  active = "explore",
}: {
  active?: "explore" | "saved" | "methodology";
}) {
  const { locale, setLocale, saved, savedSections, savedInstructors } =
    usePreferences();
  const savedCount =
    saved.length + savedSections.length + savedInstructors.length;
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    const title = localizedDocumentTitle(locale, pathname);
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    // Next may finish inserting route metadata after the preference effect.
    const observer = new MutationObserver(apply);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => observer.disconnect();
  }, [locale, pathname]);
  return (
    <>
      <ActionToast />
      <LanguageNotice />
      <TranslationGuide locale={locale} />
      <BrowserModelDownload />
      <DebugTools />
      <ScrollToTop locale={locale} />
      <header className="app-header">
        <div className="header-inner">
          <Link
            href="/"
            className="brand"
            data-debug-logo=""
            aria-label={text(
              locale,
              `${brand.names.en} home`,
              `${brand.names.zh} 首页`,
            )}
          >
            <BrandMascot portrait size={48} className="brand-mark" eager />
            <span>
              <BrandWordmark locale={locale} />
              <span className="brand-school">
                {text(locale, "OSU COURSES & RATINGS", "OSU 课程与教授评分")}
              </span>
            </span>
          </Link>
          <nav
            className="main-nav"
            aria-label={text(locale, "Main navigation", "主导航")}
          >
            <Link
              href="/"
              className={active === "explore" ? "nav-item active" : "nav-item"}
              aria-current={active === "explore" ? "page" : undefined}
            >
              {text(locale, "Explore", "课程探索")}
            </Link>
            <Link
              href="/saved"
              className={active === "saved" ? "nav-item active" : "nav-item"}
              aria-current={active === "saved" ? "page" : undefined}
            >
              <Bookmark size={15} />
              {text(locale, "Saved", "收藏")}
              <span className="nav-count">{savedCount}</span>
            </Link>
          </nav>
          <div className="header-actions">
            <Link
              href="/methodology"
              className="data-link"
              aria-current={active === "methodology" ? "page" : undefined}
            >
              {text(locale, "Behind the data", "数据与方法")}
              <ArrowUpRight size={13} />
            </Link>
            <Button
              variant="outline"
              size="sm"
              className={styles.switch}
              data-analytics-action="locale_switch"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              aria-label={text(locale, "Switch to Chinese", "切换到英文")}
              title={text(locale, "Switch to Chinese", "切换到英文")}
            >
              <Languages data-icon="inline-start" aria-hidden="true" />
              <span
                className={styles.option}
                lang={locale === "en" ? "zh-CN" : "en"}
              >
                {locale === "en" ? "中" : "EN"}
              </span>
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
