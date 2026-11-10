import type { Locale } from "@/lib/i18n";
import { OpenSourceNotice } from "./open-source-notice";
import { BuildStamp } from "./build-stamp";
import styles from "./project-info.module.css";

export function ProjectInfo({ locale }: { locale: Locale }) {
  return (
    <div className={styles.project} data-project-info>
      <OpenSourceNotice locale={locale} />
      <BuildStamp locale={locale} />
    </div>
  );
}
