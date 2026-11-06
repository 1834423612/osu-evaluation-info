"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import type { MascotExpression } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { BrandMascot } from "./brand-mascot";

const pools = {
  "not-found": ["salute", "belly-laugh", "pointing-laugh", "tired-typing"],
  error: ["thinking", "tired-typing", "salute"],
  "no-results": ["thinking", "salute", "belly-laugh", "pointing-laugh"],
  "rmp-empty": ["thinking", "salute", "belly-laugh"],
} as const satisfies Record<string, readonly MascotExpression[]>;

type MascotScene = keyof typeof pools;

function chooseExpression(scene: MascotScene): MascotExpression {
  const key = `course-atlas:mascot:${scene}:v2`;
  const pool: readonly MascotExpression[] = pools[scene];
  let previous: string | null = null;
  try {
    previous =
      sessionStorage.getItem(key) ??
      sessionStorage.getItem(`course-atlas:mascot:${scene}:v1`);
  } catch {
    // Artwork still works when browser storage is disabled.
  }
  const choices = pool.filter((expression) => expression !== previous);
  let random = Math.random();
  try {
    random = crypto.getRandomValues(new Uint32Array(1))[0] / 0x1_0000_0000;
  } catch {
    // Math.random remains available when Web Crypto is restricted.
  }
  const selected = choices[Math.floor(random * choices.length)];
  try {
    sessionStorage.setItem(key, selected);
  } catch {
    // Remembering the last expression is optional.
  }
  return selected;
}

function createSceneStore() {
  let current: MascotExpression | null = null;
  let signature = "";
  return {
    getSnapshot: () => current,
    getServerSnapshot: () => null,
    subscribe(scene: MascotScene, pathname: string, onChange: () => void) {
      const nextSignature = `${scene}:${pathname}`;
      if (signature !== nextSignature) {
        signature = nextSignature;
        current = chooseExpression(scene);
        onChange();
      }
      return () => {};
    },
  };
}

export function SceneMascot({
  scene,
  size = 152,
  className,
}: {
  scene: MascotScene;
  size?: number;
  className?: string;
}) {
  const pathname = usePathname();
  const [store] = useState(() => createSceneStore());
  const subscribe = useCallback(
    (onChange: () => void) => store.subscribe(scene, pathname, onChange),
    [pathname, scene, store],
  );
  const expression = useSyncExternalStore(
    subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  if (!expression) {
    return (
      <span
        className={cn("brand-mascot", className)}
        style={{ width: size, height: size }}
        aria-hidden="true"
      />
    );
  }

  return (
    <BrandMascot
      expression={expression}
      size={size}
      className={className}
      eager
    />
  );
}
