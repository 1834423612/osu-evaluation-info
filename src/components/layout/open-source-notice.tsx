import { ArrowUpRight } from "lucide-react";
import { GitHubMark } from "@/components/brand/github-mark";
import { brand } from "@/lib/brand";
import { text, type Locale } from "@/lib/i18n";
import styles from "./open-source-notice.module.css";

export function OpenSourceNotice({
  locale,
  compact = false,
}: {
  locale: Locale;
  compact?: boolean;
}) {
  return (
    <a
      className={`${styles.notice} ${compact ? styles.compact : ""}`}
      href={brand.links.repository}
      target="_blank"
      rel="noopener noreferrer"
      data-open-source
      title={text(
        locale,
        "This project is open source on GitHub",
        "本项目完全开源，欢迎在 GitHub 查看代码",
      )}
    >
      <GitHubMark size={18} />
      <span className={styles.copy}>
        <strong>
          {text(
            locale,
            compact ? "GitHub · Open source" : "Open source",
            compact ? "GitHub · 完全开源" : "代码完全开源",
          )}
        </strong>
        {!compact ? (
          <span>
            {text(locale, "Review & contribute.", "审查代码，欢迎参与改进。")}
          </span>
        ) : null}
      </span>
      <ArrowUpRight size={12} className={styles.arrow} aria-hidden="true" />
    </a>
  );
}
