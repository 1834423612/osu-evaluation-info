"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { usePreferences } from "@/hooks/use-preferences";
import { brand } from "@/lib/brand";
import { text } from "@/lib/i18n";

export function AppFooter() {
  const { locale } = usePreferences();
  return (
    <footer className="site-footer">
      <div className="footer-identity">
        <Link
          href="/"
          className="footer-brand"
          aria-label={text(locale, `${brand.name} home`, `${brand.name} 首页`)}
        >
          <BrandMascot portrait size={28} />
          <strong>{brand.name}</strong>
        </Link>
        <span className="footer-description">
          {text(
            locale,
            "Independent OSU course & professor guide",
            "独立的 OSU 课程与教授评价指南",
          )}
        </span>
      </div>
      <div className="footer-links">
        <Link href="/methodology">
          {text(locale, "Behind the data", "数据与方法")}
        </Link>
        <a href="https://buckeyelink.osu.edu/" target="_blank" rel="noreferrer">
          {text(
            locale,
            "Confirm enrollment in Buckeye Link",
            "选课请以 Buckeye Link 为准",
          )}
          <ArrowUpRight size={12} />
        </a>
      </div>
    </footer>
  );
}
