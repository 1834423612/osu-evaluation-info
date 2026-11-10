import { ArrowUpRight } from "lucide-react";
import { GitHubMark } from "@/components/brand/github-mark";
import { brand } from "@/lib/brand";
import { text, type Locale } from "@/lib/i18n";
import styles from "./open-source-notice.module.css";

export function OpenSourceNotice({ locale }: { locale: Locale }) {
  return (
    <div className={styles.host}>
      <a
        className={styles.notice}
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
        <GitHubMark size={13} />
        <span>
          {text(locale, "Open source on GitHub", "GitHub · 完全开源")}
        </span>
        <ArrowUpRight size={11} aria-hidden="true" />
      </a>
    </div>
  );
}
