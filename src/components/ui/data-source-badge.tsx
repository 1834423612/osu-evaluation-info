import type { ReactNode } from "react";
import styles from "./data-source-badge.module.css";

export function DataSourceBadge({
  source,
  children,
}: {
  source: "official" | "unofficial" | "sync";
  children: ReactNode;
}) {
  return (
    <span className={styles.badge} data-source={source}>
      {children}
    </span>
  );
}
