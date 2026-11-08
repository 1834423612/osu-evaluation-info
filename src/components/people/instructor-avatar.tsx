"use client";

import { useEffect, useState } from "react";
import { nameDotNumberFromEmail } from "@/lib/evaluations/scoring";
import { instructorPhotos } from "@/lib/people/photo-client";
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
  const [photo, setPhoto] = useState<{ identity: string; url: string } | null>(
    null,
  );
  useEffect(() => {
    if (!identity) return;
    let alive = true;
    void instructorPhotos
      .url(identity)
      .then((url) => {
        if (alive && url) setPhoto({ identity, url });
      })
      .catch(() => {
        /* Initials remain visible when discovery is unavailable. */
      });
    return () => {
      alive = false;
    };
  }, [identity]);
  let colorHash = 0;
  for (const character of name.trim().toLowerCase())
    colorHash = (colorHash * 31 + (character.codePointAt(0) ?? 0)) >>> 0;
  const hue = colorHash % 360;
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
      style={{
        width: size,
        height: size,
        backgroundColor: `hsl(${hue} 48% 92%)`,
        color: `hsl(${hue} 38% 35%)`,
        borderColor: `hsl(${hue} 35% 84%)`,
      }}
      aria-hidden="true"
    >
      {initials}
      {identity &&
      photo?.identity === identity &&
      failedIdentity !== identity ? (
        // OPIC does not expose CORS. Native images load directly without a fetch or optimizer proxy.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.photo}
          src={photo.url}
          width={size}
          height={size}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailedIdentity(identity)}
        />
      ) : null}
    </span>
  );
}
