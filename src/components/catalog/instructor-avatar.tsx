"use client";

import { useState } from "react";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import styles from "./instructor-avatar.module.css";

export function InstructorAvatar({
  name,
  email,
  size = 36,
}: {
  name: string;
  email?: string | null;
  size?: number;
}) {
  const identity = nameDotNumberFromEmail(email);
  const [failedIdentity, setFailedIdentity] = useState<string | null>(null);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .filter((_, index, parts) => index === 0 || index === parts.length - 1)
      .map((part) => Array.from(part)[0])
      .join("")
      .toUpperCase() || "?";

  return (
    <span
      className={styles.avatar}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials}
      {identity && failedIdentity !== identity ? (
        // The endpoint validates and caches OPIC photos; Next image optimization adds no value here.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.photo}
          src={`/api/instructors/photo?identity=${encodeURIComponent(identity)}`}
          width={size}
          height={size}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailedIdentity(identity)}
        />
      ) : null}
    </span>
  );
}
