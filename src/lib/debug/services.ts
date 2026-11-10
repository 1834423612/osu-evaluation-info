import { debugFlag, DEBUG_SESSION_KEY, type DebugFlags } from "./flags.ts";

export type DebugService =
  "catalog" | "seats" | "translation" | "rmp" | "evaluations" | "people";
const controls = {
  catalog: ["pauseCatalog", "emptyCatalog"],
  seats: ["pauseSeats", "emptySeats"],
  translation: ["pauseTranslation", "failTranslation"],
  rmp: ["pauseRmp", "emptyRmp"],
  evaluations: ["pauseEvaluations", "emptyEvaluations"],
  people: ["pausePeople", "emptyPeople"],
} as const;
export const DEBUG_RESPONSES_KEY = "course-atlas:debug:responses:v1";
const MAX_BYTES = 1_500_000,
  MAX_ENTRY = 300_000,
  MAX_ENTRIES = 50,
  TTL = 4 * 3_600_000;
type Entry = { key: string; value: string; expires: number };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function debugServiceControlled(service: DebugService) {
  return controls[service].some((key) => debugFlag(key));
}

/** Bounded, tab-local public response snapshots. Never touches preferences or saved items. */
export function createDebugServiceStore(options: {
  flags: <K extends keyof DebugFlags>(key: K) => DebugFlags[K];
  capture: () => boolean;
  storage: StorageLike;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let entries: Entry[] | undefined;
  function read() {
    if (!entries) {
      try {
        const raw = options.storage.getItem(DEBUG_RESPONSES_KEY);
        const parsed: unknown =
          raw && raw.length <= MAX_BYTES ? JSON.parse(raw) : [];
        entries = Array.isArray(parsed)
          ? parsed
              .filter(
                (e): e is Entry =>
                  e &&
                  typeof e.key === "string" &&
                  typeof e.value === "string" &&
                  e.key.length + e.value.length <= MAX_ENTRY &&
                  Number.isFinite(e.expires) &&
                  e.expires > now(),
              )
              .slice(-MAX_ENTRIES)
          : [];
      } catch {
        entries = [];
      }
    }
    entries = entries.filter((entry) => entry.expires > now());
    return entries;
  }
  function save(key: string, value: unknown) {
    try {
      const encoded = JSON.stringify(value);
      if (!encoded || key.length + encoded.length > MAX_ENTRY) return;
      entries = read().filter((entry) => entry.key !== key);
      entries.push({ key, value: encoded, expires: now() + TTL });
      while (
        entries.length > MAX_ENTRIES ||
        JSON.stringify(entries).length > MAX_BYTES
      )
        entries.shift();
      // A full browser quota must never break the feature being tested.
      while (entries.length) {
        try {
          options.storage.setItem(DEBUG_RESPONSES_KEY, JSON.stringify(entries));
          break;
        } catch {
          entries.shift();
        }
      }
    } catch {
      /* Non-serializable values are not captured. */
    }
  }
  return {
    async run<T>(
      service: DebugService,
      key: string,
      load: () => Promise<T>,
      simulated?: () => T,
    ): Promise<T> {
      const [pause, simulate] = controls[service];
      if (options.flags(simulate)) {
        if (simulated) return simulated();
        throw new Error(`DEV: simulated ${service} unavailable`);
      }
      const identity = `${service}:${key}`;
      if (options.flags(pause)) {
        const cached = read().find((entry) => entry.key === identity);
        if (cached) {
          try {
            return JSON.parse(cached.value) as T;
          } catch {
            /* Show paused state. */
          }
        }
        throw new Error(
          `DEV: ${service} paused; no saved response for this request`,
        );
      }
      const value = await load();
      if (options.capture()) save(identity, value);
      return value;
    },
    clear() {
      entries = [];
      try {
        options.storage.removeItem(DEBUG_RESPONSES_KEY);
      } catch {
        /* Memory is cleared. */
      }
    },
  };
}

function captureEnabled() {
  if (typeof window === "undefined") return false;
  if (process.env.NODE_ENV === "development") return true;
  try {
    const saved = JSON.parse(
      sessionStorage.getItem(DEBUG_SESSION_KEY) ?? "null",
    );
    return saved?.authorized === true && saved.expiresAt > Date.now();
  } catch {
    return false;
  }
}
const store = createDebugServiceStore({
  flags: debugFlag,
  capture: captureEnabled,
  storage: {
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
    removeItem: (key) => sessionStorage.removeItem(key),
  },
});
export const debugServiceValue = store.run;
export const clearDebugResponses = store.clear;

export async function debugResponse(
  service: DebugService,
  key: string,
  load: () => Promise<Response>,
  simulated?: () => unknown,
): Promise<Response> {
  // Non-debug production traffic keeps its original response, without cloning or persistence.
  if (!debugServiceControlled(service) && !captureEnabled()) return load();
  let live: Response | undefined;
  try {
    const saved = await store.run(
      service,
      key,
      async () => {
        live = await load();
        if (!live.ok) throw live;
        return { body: await live.clone().json(), status: live.status };
      },
      simulated ? () => ({ body: simulated(), status: 200 }) : undefined,
    );
    return live ?? Response.json(saved.body, { status: saved.status });
  } catch (error) {
    if (live) return live;
    if (!debugServiceControlled(service)) throw error;
    return Response.json(
      {
        error: error instanceof Error ? error.message : "DEV: service paused",
        debug: true,
      },
      { status: 503, headers: { "Retry-After": "3600" } },
    );
  }
}

export function debugFetch(
  service: Exclude<DebugService, "catalog" | "seats" | "translation">,
  input: string,
  init?: RequestInit,
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  return debugResponse(
    service,
    `${input}:${init?.body ?? ""}`,
    () => fetcher(input, init),
    () => {
      if (service === "evaluations") return { summaries: {} };
      if (service === "people")
        return {
          status: "available",
          source: "osu-search",
          cache: "source",
          verifiedAt: new Date().toISOString(),
          results: [],
        };
      if (input.includes("/reviews"))
        return { reviews: [], total: 0, nextOffset: null };
      if (input.includes("/summaries")) {
        const courses = JSON.parse(String(init?.body ?? "{}")).courses ?? [];
        return {
          summaries: Object.fromEntries(
            courses.map((c: { id: string }) => [
              c.id,
              {
                status: "no-data",
                tags: [],
                difficulty: null,
                difficultyCount: 0,
                difficultyPeriod: "none",
                reviewCount: 0,
                matchedInstructorCount: 0,
                requestedInstructorCount: 0,
                recentSince: "",
              },
            ]),
          ),
        };
      }
      return {
        status: "no-data",
        instructors: [],
        requestedInstructorCount: 0,
        matchedInstructorCount: 0,
        recentSince: "",
        refreshedAt: null,
      };
    },
  );
}
