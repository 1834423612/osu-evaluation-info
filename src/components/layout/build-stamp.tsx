import { GitCommitHorizontal } from "lucide-react";
import styles from "./build-stamp.module.css";

export function BuildStamp() {
  const hash = process.env.NEXT_PUBLIC_BUILD_HASH;
  if (!hash) return null;
  const message = process.env.NEXT_PUBLIC_BUILD_MESSAGE ?? "";
  return (
    <span
      className={styles.stamp}
      title={`${hash} · ${message}`}
      data-build-stamp
    >
      <GitCommitHorizontal size={13} aria-hidden="true" />
      <code>{hash}</code>
      <span>{message}</span>
    </span>
  );
}
