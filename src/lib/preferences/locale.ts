export type PreferredLocale = "en" | "zh";
export const LOCALE_KEY = "course-atlas:locale:v1";
export const PREFERENCES_EVENT = "course-atlas:preferences";

export type LocaleNotice =
  | { kind: "suggestion"; locale: PreferredLocale }
  | {
      kind: "changed";
      locale: PreferredLocale;
      previousLocale: PreferredLocale;
    };

function supportedLocale(
  value: string | null | undefined,
): PreferredLocale | null {
  const language = value?.trim().toLowerCase().split(/[-_]/)[0];
  return language === "zh" || language === "en" ? language : null;
}

export function detectLocale({
  languages,
  systemLocale,
  userAgent,
}: {
  languages: readonly string[];
  systemLocale?: string;
  userAgent?: string;
}): PreferredLocale {
  for (const language of [...languages, systemLocale]) {
    const locale = supportedLocale(language);
    if (locale) return locale;
  }
  // Older browsers sometimes include a language token in their UA.
  // Do not infer language from a device model, country, or IP address.
  const token = userAgent?.match(
    /(?:^|[;()\s])((?:zh|en)(?:[-_][a-z0-9]{2,8})*)(?=[;()\s]|$)/i,
  )?.[1];
  return supportedLocale(token) ?? "en";
}

export function createLocalePreferenceStore(environment: {
  read: () => string | null;
  write: (locale: PreferredLocale) => void;
  detect: () => PreferredLocale;
  changed: () => void;
  apply: (locale: PreferredLocale) => void;
}) {
  let initialized = false;
  let memory: PreferredLocale = "en";
  let memoryOnly = false;
  let notice: LocaleNotice | null = null;

  function read() {
    try {
      const value = environment.read();
      return value === "en" || value === "zh" ? value : null;
    } catch {
      return null;
    }
  }
  function persist(locale: PreferredLocale) {
    memory = locale;
    try {
      environment.write(locale);
      memoryOnly = false;
    } catch {
      memoryOnly = true;
    }
    environment.apply(locale);
  }
  function initialize() {
    if (initialized) return;
    initialized = true;
    const stored = read();
    if (stored) {
      memory = stored;
      environment.apply(stored);
    } else {
      const detected = environment.detect();
      persist(detected);
      notice = { kind: "suggestion", locale: detected };
    }
    environment.changed();
  }
  function getLocale(): PreferredLocale {
    return (!memoryOnly && read()) || memory;
  }
  function setLocale(locale: PreferredLocale) {
    const previousLocale = getLocale();
    if (initialized && previousLocale === locale) return;
    initialized = true;
    persist(locale);
    notice =
      previousLocale === locale
        ? null
        : { kind: "changed", locale, previousLocale };
    environment.changed();
  }
  function dismissNotice() {
    if (!notice) return;
    notice = null;
    environment.changed();
  }
  return {
    initialize,
    getLocale,
    setLocale,
    getNotice: () => notice,
    dismissNotice,
  };
}
