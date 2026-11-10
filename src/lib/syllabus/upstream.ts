import {
  envelope,
  normalizeDocument,
  normalizeLibraryPage,
  normalizeTerms,
  SyllabusError,
  SYLLABUS_API,
  validCode,
  validQuery,
  validUuid,
} from "./normalize.ts";
import type { SyllabusQuery, SyllabusTerm } from "./types.ts";

export async function officialSyllabusJson(
  path: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<unknown> {
  const response = await fetcher(`${SYLLABUS_API}${path}`, {
    headers: { Accept: "application/json" },
    mode: "cors",
    credentials: "omit",
    redirect: "error",
    cache: "no-store",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (response.status === 401 || response.status === 403) {
    const kind = response.headers.get("content-type")?.includes("json")
      ? "restricted"
      : "unavailable";
    await response.body?.cancel();
    throw new SyllabusError(kind);
  }
  if (response.status === 404) throw new SyllabusError("missing");
  if (!response.ok || !response.headers.get("content-type")?.includes("json"))
    throw new SyllabusError("unavailable");
  // Enforce a real streamed byte limit, including chunked and compressed responses.
  const reader = response.body?.getReader();
  if (!reader) throw new SyllabusError("unavailable");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > 8_000_000) throw new SyllabusError("unavailable");
      chunks.push(part.value);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(bytes));
    envelope(json);
    return json;
  } catch (error) {
    if (error instanceof SyllabusError) throw error;
    throw new SyllabusError("unavailable");
  }
}

export async function discoverSyllabusTerms(
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  return normalizeTerms(
    await officialSyllabusJson("app-state?locale=en-US", fetcher, signal),
  );
}

export async function readSyllabusPage(
  term: SyllabusTerm,
  page: number,
  query?: SyllabusQuery,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (
    !validUuid(term.id) ||
    !Number.isSafeInteger(page) ||
    page < 0 ||
    page > 2000 ||
    (query && !validQuery(query))
  )
    throw new SyllabusError("invalid");
  const params = new URLSearchParams({ term_id: term.id, page: String(page) });
  if (query) {
    params.set("subject_name", query.subject.toUpperCase());
    params.set("course_number", query.catalogNumber.toUpperCase());
  }
  const result = normalizeLibraryPage(
    await officialSyllabusJson(`doc-library-search?${params}`, fetcher, signal),
    page,
  );
  if (result.entries.some((entry) => entry.termId !== term.id))
    throw new SyllabusError(
      "unavailable",
      "Official service ignored the fixed term filter",
    );
  return result;
}

export async function readSyllabusDocument(
  code: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
) {
  if (!validCode(code)) throw new SyllabusError("invalid");
  return normalizeDocument(
    await officialSyllabusJson(
      `doc-full-page-get?code=${encodeURIComponent(code)}`,
      fetcher,
      signal,
    ),
    code,
  );
}
