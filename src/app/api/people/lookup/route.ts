import { createHash } from "node:crypto";
import {
  lookupDirectory,
  validDirectoryFallbackName,
  validDirectorySearchTerm,
  directoryAccountFromTerm,
} from "@/lib/people/directory";
import {
  directoryPersonIsFresh,
  directoryPersonResponse,
  isVerifiedDirectoryPerson,
  readDirectoryPerson,
  writeDirectoryPerson,
} from "@/lib/people/database";

export const runtime = "nodejs";

const MAX_REQUEST_BYTES = 4 * 1024;
const RATE_WINDOW_MS = 60 * 1000;
// Visible instructor lists can contain many distinct people; the client queues
// requests and the provider layer separately bounds simultaneous upstream work.
const RATE_LIMIT = 60;
const MAX_RATE_ENTRIES = 2048;
const requests = new Map<string, { start: number; count: number }>();

function response(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}

function rateKey(request: Request) {
  const value =
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  return createHash("sha256").update(value.slice(0, 128)).digest("hex");
}

function allowRequest(request: Request) {
  const key = rateKey(request);
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

async function readRequestBody(request: Request): Promise<unknown | null> {
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

export async function POST(request: Request) {
  if (!allowRequest(request))
    return response({ error: "Please wait before searching again." }, 429);

  const body = await readRequestBody(request);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return response({ error: "A valid search term is required." }, 400);
  const term = (body as { term?: unknown }).term;
  if (!validDirectorySearchTerm(term))
    return response({ error: "Enter a name or OSU name.#." }, 400);
  const fallbackName = (body as { fallbackName?: unknown }).fallbackName;
  const subjectValue = (body as { subject?: unknown }).subject;
  const subject =
    typeof subjectValue === "string" && /^[A-Za-z]{2,8}$/.test(subjectValue)
      ? subjectValue.toUpperCase()
      : undefined;
  if (fallbackName !== undefined && !validDirectoryFallbackName(fallbackName))
    return response(
      { error: "Enter a full instructor name for fallback." },
      400,
    );

  const identity = directoryAccountFromTerm(term);
  let savedPerson = null;
  if (identity) {
    try {
      savedPerson = await readDirectoryPerson(identity);
    } catch {
      // The official source remains available when the optional cache is down.
    }
    if (
      savedPerson &&
      isVerifiedDirectoryPerson(savedPerson, identity) &&
      directoryPersonIsFresh(savedPerson, subject)
    )
      return response(directoryPersonResponse(savedPerson));
  }

  const result = await lookupDirectory(term, fallbackName, subject);
  if (
    identity &&
    result.status === "available" &&
    result.results.length === 1
  ) {
    try {
      await writeDirectoryPerson(identity, result.results[0], result);
    } catch {
      // Persistence is best effort; do not turn an official lookup into failure.
    }
  }
  if (result.status === "unavailable" && identity && savedPerson) {
    return response(directoryPersonResponse(savedPerson, { stale: true }));
  }
  if (result.status === "unavailable")
    return response(
      { error: "The OSU directory is temporarily unavailable." },
      503,
    );
  return response(result);
}
