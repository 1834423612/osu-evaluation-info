import { cacheBypassed } from "../debug/flags.ts";
import { debugServiceControlled } from "../debug/services.ts";
import {
  instructorPhotoUrl,
  isInstructorPhotoPlan,
  validPhotoIdentity,
  type InstructorPhotoPlan,
} from "./photo.ts";

/** All avatars share one cacheable endpoint discovery, never a per-person proxy. */
export function createInstructorPhotoClient(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  let cached: {
    expires: number;
    promise: Promise<InstructorPhotoPlan>;
  } | null = null;
  return {
    async url(identity: string): Promise<string | null> {
      if (debugServiceControlled("people")) return null;
      if (!validPhotoIdentity(identity)) return null;
      if (cacheBypassed() || !cached || cached.expires <= Date.now()) {
        const promise = (async () => {
          const response = await fetcher("/api/instructors/photo", {
            signal: AbortSignal.timeout(10_000),
          });
          if (!response.ok)
            throw new Error("Photo endpoint discovery unavailable");
          const plan: unknown = await response.json();
          if (!isInstructorPhotoPlan(plan))
            throw new Error("Invalid photo endpoint configuration");
          return plan;
        })();
        const entry = { expires: Date.now() + 3_600_000, promise };
        cached = entry;
        void promise.catch(() => {
          if (cached === entry) cached = null;
        });
      }
      return instructorPhotoUrl(await cached.promise, identity);
    },
  };
}

export const instructorPhotos = createInstructorPhotoClient();
