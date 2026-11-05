const OPIC_ORIGIN = "https://opic.osu.edu";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 256;
const MAX_CACHE_BYTES = 16 * 1024 * 1024;
const MAX_CONCURRENT = 12;
const PHOTO_TTL = 24 * 60 * 60 * 1000;
const MISSING_TTL = 6 * 60 * 60 * 1000;
const ERROR_TTL = 30 * 1000;

export type InstructorPhoto =
  | { status: "available"; body: Uint8Array; contentType: string }
  | { status: "missing" | "unavailable" };

const cache = new Map<string, { expires: number; photo: InstructorPhoto }>();
const pending = new Map<string, Promise<InstructorPhoto>>();
let cacheBytes = 0;

function removeCached(identity: string) {
  const entry = cache.get(identity);
  if (entry?.photo.status === "available")
    cacheBytes -= entry.photo.body.byteLength;
  cache.delete(identity);
}

export function validPhotoIdentity(value: string): boolean {
  return /^[a-z][a-z0-9_-]{0,63}\.\d{1,10}$/.test(value);
}

function safePhotoUrl(value: string, base = OPIC_ORIGIN): URL | null {
  try {
    const url = new URL(value, base);
    return url.origin === OPIC_ORIGIN && !url.username && !url.password
      ? url
      : null;
  } catch {
    return null;
  }
}

async function readPhoto(identity: string): Promise<InstructorPhoto> {
  const signal = AbortSignal.timeout(5_000);
  let url = new URL(`/${identity}?width=96`, OPIC_ORIGIN);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetch(url, {
      signal,
      redirect: "manual",
      cache: "no-store",
      headers: { Accept: "image/jpeg,image/png,image/webp" },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const next = safePhotoUrl(
        response.headers.get("location") ?? "",
        url.href,
      );
      if (!next) return { status: "unavailable" };
      if (/^\/assets\/leaf\//i.test(next.pathname))
        return { status: "missing" };
      url = next;
      continue;
    }
    if (response.status === 404) {
      await response.body?.cancel();
      return { status: "missing" };
    }
    const contentType = response.headers.get("content-type")?.split(";")[0];
    if (
      !response.ok ||
      !contentType ||
      !["image/jpeg", "image/png", "image/webp"].includes(contentType) ||
      Number(response.headers.get("content-length")) > MAX_PHOTO_BYTES
    ) {
      await response.body?.cancel();
      return { status: "unavailable" };
    }
    const reader = response.body?.getReader();
    if (!reader) return { status: "unavailable" };
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_PHOTO_BYTES) {
          await reader.cancel();
          return { status: "unavailable" };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    if (!length) return { status: "unavailable" };
    const body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { status: "available", body, contentType };
  }
  return { status: "unavailable" };
}

export async function getInstructorPhoto(
  identity: string,
): Promise<InstructorPhoto> {
  if (!validPhotoIdentity(identity)) return { status: "missing" };
  const entry = cache.get(identity);
  if (entry && entry.expires > Date.now()) {
    cache.delete(identity);
    cache.set(identity, entry);
    return entry.photo;
  }
  removeCached(identity);
  const inflight = pending.get(identity);
  if (inflight) return inflight;
  if (pending.size >= MAX_CONCURRENT) return { status: "unavailable" };
  const promise = readPhoto(identity)
    .catch((): InstructorPhoto => ({ status: "unavailable" }))
    .then((photo) => {
      const ttl =
        photo.status === "available"
          ? PHOTO_TTL
          : photo.status === "missing"
            ? MISSING_TTL
            : ERROR_TTL;
      cache.set(identity, { photo, expires: Date.now() + ttl });
      if (photo.status === "available") cacheBytes += photo.body.byteLength;
      while (cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES)
        removeCached(cache.keys().next().value!);
      return photo;
    })
    .finally(() => pending.delete(identity));
  pending.set(identity, promise);
  return promise;
}
