import { brand } from "@/lib/brand";
import type { Locale } from "@/lib/i18n";
import styles from "./brand-identity.module.css";

export function BrandWordmark({ locale }: { locale: Locale }) {
  const name = brand.names[locale];
  return (
    <span className={styles.wordmark} lang={locale === "zh" ? "zh-CN" : "en"}>
      {name.slice(0, -2)}
      <span className={styles.wordmarkAccent}>{name.slice(-2)}</span>
    </span>
  );
}
