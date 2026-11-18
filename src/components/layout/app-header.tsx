"use client";
import Link from "next/link";
import { PageShare } from "@/components/sharing/page-share";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Languages } from "lucide-react";
import {
  ResourcesMenu,
  ExploreMenu,
  PersonalMenu,
  SavedMenu,
} from "./resources-menu";
import resourceStyles from "./resources-menu.module.css";
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
import { UpdateNotice } from "./update-notice";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { syllabusHasUpdate } from "@/lib/syllabus/saved";
import { SyllabusUpdateMonitor } from "@/components/syllabus/syllabus-update-monitor";
import styles from "./language-controls.module.css";

export function AppHeader({
  active,
}: {
  active?:
    | "planning"
    | "calendar"
    | "explore"
    | "saved"
    | "methodology"
    | "reference"
    | "rmp"
    | "updates"
    | "history"
    | "account"
    | "transfer"
    | "share"
    | "popular"
    | "diagnostics";
}) {
  const { locale, setLocale, saved, savedSections, savedInstructors } =
    usePreferences();
  const { savedSyllabi } = useSavedSyllabi();
  const savedCount =
    saved.length +
    savedSections.length +
    savedInstructors.length +
    savedSyllabi.length;
  const updates = savedSyllabi.filter(syllabusHasUpdate).length;
  const pathname = usePathname();
  const current =
    pathname === "/calendar"
      ? "calendar"
      : pathname === "/diagnostics"
        ? "diagnostics"
        : pathname === "/popular"
          ? "popular"
          : pathname === "/"
            ? "explore"
            : pathname === "/history"
              ? "history"
              : pathname === "/saved"
                ? "saved"
                : pathname.startsWith("/share")
                  ? "share"
                  : pathname.startsWith("/transfer")
                    ? "transfer"
                    : pathname === "/account"
                      ? "account"
                      : pathname === "/reference"
                        ? "reference"
                        : pathname === "/methodology"
                          ? "methodology"
                          : pathname === "/rmp" || pathname.startsWith("/rmp/")
                            ? "rmp"
                            : pathname === "/updates"
                              ? "updates"
                              : active;
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
      <UpdateNotice locale={locale} />
      <LanguageNotice />
      <TranslationGuide locale={locale} />
      <BrowserModelDownload />
      <DebugTools />
      <SyllabusUpdateMonitor />
      <ScrollToTop locale={locale} />
      <header className="app-header">
        <div className={`header-inner ${resourceStyles.header}`}>
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
            <ExploreMenu locale={locale} page={current} />
            <SavedMenu locale={locale} page={current} count={savedCount} />
            <PersonalMenu
              locale={locale}
              page={current}
              status={
                <>
                  {updates ? (
                    <span
                      className={styles.updateDot}
                      role="status"
                      aria-label={text(
                        locale,
                        `${updates} syllabus updates`,
                        `${updates} 份大纲有更新`,
                      )}
                      title={text(
                        locale,
                        `${updates} syllabus updates`,
                        `${updates} 份大纲有更新`,
                      )}
                    />
                  ) : null}
                </>
              }
            />{" "}
          </nav>
          <div className="header-actions">
            <PageShare locale={locale} compact />
            <ResourcesMenu locale={locale} page={current} />
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
