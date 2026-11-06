"use client";

import { useSyncExternalStore } from "react";
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
  const key = `course-atlas:mascot:${scene}:v1`;
  const pool: readonly MascotExpression[] = pools[scene];
  let previous: string | null = null;
  try {
    previous = sessionStorage.getItem(key);
  } catch {
    // Artwork still works when browser storage is disabled.
  }
  const choices = pool.filter((expression) => expression !== previous);
  const selected = choices[Math.floor(Math.random() * choices.length)];
  try {
    sessionStorage.setItem(key, selected);
  } catch {
    // Remembering the last expression is optional.
  }
  return selected;
}

function createSceneStore(scene: MascotScene) {
  let expression: MascotExpression | undefined;
  return {
    getSnapshot: () => expression,
    subscribe(onChange: () => void) {
      // Subscribe runs after hydration; never draw or touch storage in render.
      // One choice per document also keeps language switches and retries stable.
      if (!expression) {
        expression = chooseExpression(scene);
        onChange();
      }
      return () => {};
    },
  };
}

const stores = {
  "not-found": createSceneStore("not-found"),
  error: createSceneStore("error"),
  "no-results": createSceneStore("no-results"),
  "rmp-empty": createSceneStore("rmp-empty"),
};
const getServerSnapshot = () => undefined;

export function SceneMascot({
  scene,
  size = 152,
  className,
}: {
  scene: MascotScene;
  size?: number;
  className?: string;
}) {
  const store = stores[scene];
  const expression = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    getServerSnapshot,
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
