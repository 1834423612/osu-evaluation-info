type Store = Pick<
  Storage,
  "length" | "key" | "getItem" | "setItem" | "removeItem"
>;
type Rule = {
  version: number;
  kind: "array" | "object" | "setting" | "cache";
  allowed?: readonly string[];
};
export const STORAGE_RULES: Record<string, Rule> = {
  saved: { version: 1, kind: "array" },
  "saved-sections": { version: 1, kind: "array" },
  "saved-instructors": { version: 1, kind: "array" },
  "saved-syllabi": { version: 1, kind: "array" },
  "watch-sections": { version: 1, kind: "object" },
  locale: { version: 1, kind: "setting", allowed: ["en", "zh"] },
  "enrollment-watch": {
    version: 1,
    kind: "setting",
    allowed: ["true", "false"],
  },
  "enrollment-watch-interval": {
    version: 1,
    kind: "setting",
    allowed: ["10", "15", "20", "30"],
  },
  "translation-mode": {
    version: 1,
    kind: "setting",
    allowed: ["replace", "bilingual"],
  },
  "translation-auto": {
    version: 1,
    kind: "setting",
    allowed: ["true", "false"],
  },
  "translation-word-cloud-auto": {
    version: 1,
    kind: "setting",
    allowed: ["true", "false"],
  },
  "translation-model": {
    version: 1,
    kind: "setting",
    allowed: ["auto", "chrome", "ollama", "google"],
  },
  "translation-guide": {
    version: 1,
    kind: "setting",
    allowed: ["settings", "done"],
  },
  "people-directory": { version: 3, kind: "cache" },
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Current scalar values win; saved identities and nested course links are unioned. */
export function mergeStoredData(older: unknown, current: unknown): unknown {
  if (Array.isArray(older) && Array.isArray(current)) {
    const result = new Map<string, unknown>();
    for (const item of [...older, ...current]) {
      const id =
        object(item) && typeof item.id === "string"
          ? item.id
          : JSON.stringify(item);
      result.set(
        id,
        result.has(id) ? mergeStoredData(result.get(id), item) : item,
      );
    }
    return [...result.values()];
  }
  if (object(older) && object(current)) {
    const result = { ...older };
    for (const [key, value] of Object.entries(current)) {
      if (["__proto__", "constructor", "prototype"].includes(key)) continue;
      result[key] = key in result ? mergeStoredData(result[key], value) : value;
    }
    return result;
  }
  return current ?? older;
}

function decode(raw: string, rule: Rule) {
  if (rule.kind === "setting") {
    if (!rule.allowed?.includes(raw)) throw new Error("Unrecognized setting");
    return raw;
  }
  const value: unknown = JSON.parse(raw);
  if (
    rule.kind === "array" &&
    (!Array.isArray(value) ||
      value.some((item) => !object(item) || typeof item.id !== "string"))
  )
    throw new Error("Unrecognized collection");
  if ((rule.kind === "object" || rule.kind === "cache") && !object(value))
    throw new Error("Unrecognized object");
  return value;
}

/** Only registered older formats are migrated. Unknown/future data is preserved. */
export function migrateBrowserStorage(storage: Store, now = Date.now()) {
  const report = { merged: 0, removed: 0, preserved: 0 };
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => !!key);
  for (const [name, rule] of Object.entries(STORAGE_RULES)) {
    const target = `course-atlas:${name}:v${rule.version}`;
    const older = keys
      .filter((key) => {
        const match = key.match(/^course-atlas:(.+):v(\d+)$/);
        return match?.[1] === name && Number(match[2]) < rule.version;
      })
      .sort(
        (a, b) => Number(a.split(":v").at(-1)) - Number(b.split(":v").at(-1)),
      );
    try {
      if (rule.kind === "cache") {
        for (const key of older) {
          storage.removeItem(key);
          report.removed++;
        }
        const raw = storage.getItem(target);
        if (raw) {
          let cached: Record<string, unknown>;
          try {
            cached = decode(raw, rule) as Record<string, unknown>;
          } catch {
            storage.removeItem(target);
            report.removed++;
            continue;
          }
          for (const [id, record] of Object.entries(cached)) {
            const at = object(record)
              ? Date.parse(String(record.verifiedAt ?? ""))
              : NaN;
            if (
              !Number.isFinite(at) ||
              now - at > 30 * 86_400_000 ||
              at > now + 60_000
            )
              delete cached[id];
          }
          storage.setItem(target, JSON.stringify(cached));
        }
        continue;
      }
      if (!older.length) continue;
      let combined: unknown;
      const migrated: string[] = [];
      for (const key of [...older, target]) {
        const raw = storage.getItem(key);
        if (raw === null) continue;
        try {
          const value = decode(raw, rule);
          combined =
            combined === undefined ? value : mergeStoredData(combined, value);
          if (key !== target) migrated.push(key);
        } catch {
          report.preserved++;
          if (key === target) combined = undefined;
        }
      }
      if (combined === undefined || !migrated.length) continue;
      const serialized =
        rule.kind === "setting" ? String(combined) : JSON.stringify(combined);
      storage.setItem(target, serialized);
      if (storage.getItem(target) !== serialized) continue;
      for (const key of migrated) {
        storage.removeItem(key);
        report.removed++;
      }
      report.merged++;
    } catch {
      report.preserved++;
    }
  }
  for (const key of keys) {
    const match = key.match(/^course-atlas:mascot:([^:]+):v(\d+)$/);
    if (match && Number(match[2]) < 2) {
      try {
        storage.removeItem(key);
        report.removed++;
      } catch {
        report.preserved++;
      }
    }
  }
  return report;
}
