"use client";
import Link from "next/link";
import { useEffect } from "react";
import { BookOpen, Bookmark, ArrowUpRight, Languages } from "lucide-react";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ActionToast } from "./action-toast";

export function AppHeader({
  active = "explore",
}: {
  active?: "explore" | "saved" | "methodology";
}) {
  const { locale, setLocale, saved, savedSections, savedInstructors } =
    usePreferences();
  const savedCount =
    saved.length + savedSections.length + savedInstructors.length;
  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);
  return (
    <>
      <ActionToast />
      <header className="app-header">
        <div className="header-inner">
          <Link href="/" className="brand" aria-label="Course Atlas home">
            <span className="brand-mark">
              <BookOpen size={21} strokeWidth={1.8} />
            </span>
            <span>
              course<span className="brand-light">atlas</span>
              <span className="brand-school">OHIO STATE</span>
            </span>
          </Link>
          <nav
            className="main-nav"
            aria-label={text(locale, "Main navigation", "主导航")}
          >
            <Link
              href="/"
              className={active === "explore" ? "nav-item active" : "nav-item"}
            >
              {text(locale, "Explore", "课程探索")}
            </Link>
            <Link
              href="/saved"
              className={active === "saved" ? "nav-item active" : "nav-item"}
            >
              <Bookmark size={15} />
              {text(locale, "Saved", "收藏")}
              <span className="nav-count">{savedCount}</span>
            </Link>
          </nav>
          <div className="header-actions">
            <Link href="/methodology" className="data-link">
              {text(locale, "Behind the data", "数据与方法")}
              <ArrowUpRight size={13} />
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocale(locale === "en" ? "zh" : "en")}
              aria-label={text(locale, "Switch to Chinese", "切换到英文")}
            >
              <Languages data-icon="inline-start" />
              {locale === "en" ? "中文" : "EN"}
            </Button>
          </div>
        </div>
      </header>
    </>
  );
}
