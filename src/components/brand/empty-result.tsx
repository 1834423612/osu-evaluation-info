import type { ReactNode } from "react";
import { SceneMascot } from "./scene-mascot";
import styles from "./empty-result.module.css";

export function EmptyResult({
  children,
  size = 48,
}: {
  children: ReactNode;
  size?: number;
}) {
  return (
    <div className={styles.empty} role="status" data-empty-result>
      <SceneMascot scene="no-results" size={size} />
      <div>{children}</div>
    </div>
  );
}
