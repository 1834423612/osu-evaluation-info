import "server-only";
import { createRequestPool } from "./request-pool";
import {
  availabilityKey,
  normalizeSectionAvailability,
  type AvailabilityQuery,
} from "./section-availability";
import type { SectionAvailability } from "./types";

// Shared across routes/users in this server process. Duplicate reads share one request.
const pool = createRequestPool<SectionAvailability>({
  concurrency: 2,
  minStartIntervalMs: 500,
  maxQueued: 120,
  cacheMs: 2000,
});

export function getOfficialSectionAvailability(
  query: AvailabilityQuery,
  signal?: AbortSignal,
) {
  return pool.read(
    availabilityKey(query),
    async (signal) => {
      const response = await fetch(
        `https://content.osu.edu/v2/classes/availability?${availabilityKey(query)}`,
        {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
        },
      );
      if (response.status === 429) {
        const seconds = Number(response.headers.get("Retry-After"));
        pool.backoff(
          Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 5000,
        );
      }
      if (!response.ok)
        throw new Error(`Official availability returned ${response.status}`);
      return normalizeSectionAvailability(await response.json());
    },
    { signal },
  );
}
