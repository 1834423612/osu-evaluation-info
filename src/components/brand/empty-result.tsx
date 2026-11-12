import type { ReactNode } from "react";
import { SceneMascot } from "./scene-mascot";
import styles from "./empty-result.module.css";

export function EmptyResult({
  children,
  size = 48,
  layout = "inline",
}: {
  children: ReactNode;
  size?: number;
  layout?: "inline" | "stack";
}) {
  return (
    <div
      className={styles.empty}
      role="status"
      data-empty-result
      data-layout={layout}
    >
      <SceneMascot scene="no-results" size={size} />
      <div>{children}</div>
    </div>
  );
}
