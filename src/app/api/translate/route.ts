import { createHash } from "node:crypto";
import {
  MAX_TRANSLATION_LENGTH,
  translateWithFallback,
  type TranslationTarget,
} from "@/lib/translation/service";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 20 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 30;
const MAX_RATE_ENTRIES = 2048;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_LIMIT = 512;
const MAX_PENDING_TRANSLATIONS = 8;
const requests = new Map<string, { start: number; count: number }>();
const cache = new Map<string, { value: string; expires: number }>();
const pending = new Map<string, Promise<string>>();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "private, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
      ...(status >= 500 ? { "Cache-Control": "no-store" } : {}),
    },
  });
}

function readClientKey(request: Request) {
  const address =
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return createHash("sha256").update(address.slice(0, 128)).digest("hex");
}

function allowRequest(request: Request) {
  const key = readClientKey(request);
  const now = Date.now();
  const current = requests.get(key);
  if (!current || now - current.start >= RATE_WINDOW_MS) {
    requests.set(key, { start: now, count: 1 });
  } else if (current.count >= RATE_LIMIT) {
    return false;
  } else {
    current.count += 1;
  }
  while (requests.size > MAX_RATE_ENTRIES)
    requests.delete(requests.keys().next().value!);
  return true;
}

async function readJson(request: Request): Promise<unknown | null> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES)
    return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 3_000);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  if (timedOut) return null;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function validatePayload(value: unknown): {
  text: string;
  target: TranslationTarget;
} | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as { text?: unknown; target?: unknown };
  if (
    typeof body.text !== "string" ||
    !body.text.trim() ||
    body.text.length > MAX_TRANSLATION_LENGTH ||
    (body.target !== "en" && body.target !== "zh-CN")
  )
    return null;
  return { text: body.text, target: body.target };
}

async function cachedTranslation(source: string, target: TranslationTarget) {
  const key = createHash("sha256")
    .update(target)
    .update("\0")
    .update(source)
    .digest("hex");
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.value;
  if (saved) cache.delete(key);
  const ongoing = pending.get(key);
  if (ongoing) return ongoing;
  if (pending.size >= MAX_PENDING_TRANSLATIONS)
    throw new Error("Translation capacity is temporarily full.");
  const request = translateWithFallback(source, target)
    .then((value) => {
      cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
      while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

export async function POST(request: Request) {
  if (!allowRequest(request))
    return response(
      { error: "Please wait before translating more text." },
      429,
    );
  const payload = validatePayload(await readJson(request));
  if (!payload)
    return response(
      { error: "A valid text and target language are required." },
      400,
    );
  try {
    const translation = await cachedTranslation(payload.text, payload.target);
    return response({ translation });
  } catch {
    return response({ error: "Translation is temporarily unavailable." }, 503);
  }
}
