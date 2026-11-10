"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { usePreferences } from "@/hooks/use-preferences";
import { brand } from "@/lib/brand";
import { text } from "@/lib/i18n";
import { BuildStamp } from "./build-stamp";

export function AppFooter() {
  const { locale } = usePreferences();
  return (
    <footer className="site-footer">
      <div className="footer-identity">
        <Link
          href="/"
          className="footer-brand"
          aria-label={text(
            locale,
            `${brand.names.en} home`,
            `${brand.names.zh} 首页`,
          )}
        >
          <BrandMascot portrait size={28} />
          <span className="footer-brand-copy">
            <BrandWordmark locale={locale} />
            <span className="footer-description">
              {brand.slogan[locale].join(locale === "zh" ? "" : " ")}
            </span>
          </span>
        </Link>
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
      <div className="footer-disclaimer">
        <BuildStamp />
        <p>
          {text(
            locale,
            "Independent student project. Not affiliated with or endorsed by The Ohio State University. Course and enrollment information is subject to official OSU records; student reviews reflect individual opinions.",
            "本站为独立学生项目，不隶属于俄亥俄州立大学，亦未经其官方认可。课程与选课信息以 OSU 官方记录为准；学生评价仅代表个人观点。",
          )}
        </p>
      </div>
    </footer>
  );
}
