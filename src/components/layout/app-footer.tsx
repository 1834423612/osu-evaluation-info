"use client";

import Link from "next/link";
import { ArrowUpRight, Github, Globe2 } from "lucide-react";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { BrandWordmark } from "@/components/brand/brand-wordmark";
import { usePreferences } from "@/hooks/use-preferences";
import { brand } from "@/lib/brand";
import { text } from "@/lib/i18n";
import { BuildStamp } from "./build-stamp";
import styles from "./app-footer.module.css";

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
      <div className={styles.project}>
        <a
          className={styles.openSource}
          href={brand.links.repository}
          target="_blank"
          rel="noreferrer noopener"
          data-open-source
        >
          <span className={styles.sourceIcon}>
            <Github size={19} aria-hidden="true" />
          </span>
          <span className={styles.sourceCopy}>
            <strong>
              {text(
                locale,
                "Open source. Built for Buckeyes.",
                "完全开源，为选课多一点帮助。",
              )}
            </strong>
            <span>
              {text(
                locale,
                "Explore the code on GitHub",
                "在 GitHub 查看代码，欢迎一起完善",
              )}{" "}
              <ArrowUpRight size={11} aria-hidden="true" />
            </span>
          </span>
        </a>
        <BuildStamp locale={locale} />
      </div>
      <div className="footer-disclaimer">
        <p>
          {text(
            locale,
            "Independent student project. Not affiliated with or endorsed by The Ohio State University. Course and enrollment information is subject to official OSU records; this site is for informational purposes only. Student reviews reflect personal opinions and do not represent any official position.",
            "本站为独立学生项目，不隶属于俄亥俄州立大学，亦未经其官方认可。课程与选课信息以 OSU 官方记录为准；本站仅做信息整理收录，学生评价代表其个人观点，不构成任何官方立场。",
          )}
        </p>
        <div className={styles.credit}>
          <span>
            Made with{" "}
            <span className={styles.heart} aria-label="love">
              ❤️
            </span>{" "}
            by
          </span>
          <a
            href={brand.links.author}
            target="_blank"
            rel="noreferrer noopener"
          >
            kjch
          </a>
          <span aria-hidden="true" className={styles.separator}>
            ·
          </span>
          <a
            href={brand.links.website}
            target="_blank"
            rel="noreferrer noopener"
          >
            <Globe2 size={11} aria-hidden="true" />
            {text(locale, "Personal site", "个人网站")}
          </a>
        </div>
      </div>
    </footer>
  );
}
