import { setTimeout as delay } from "node:timers/promises";

export function catalogError(message, code = "CATALOG_DATA_INVALID") {
  return Object.assign(new Error(message), { code });
}

/** Retry transport failures and temporary HTTP errors, with bounded Retry-After. */
export async function fetchOfficialJson(
  path,
  {
    fetcher = fetch,
    wait = delay,
    signal,
    report = (event) => console.warn(JSON.stringify(event)),
  } = {},
) {
  const [endpoint, query] = path.split("?");
  const scope = Object.fromEntries(
    [...new URLSearchParams(query)].filter(
      ([key, value]) =>
        ["term", "campus", "subject", "p"].includes(key) &&
        /^[\w.-]{1,32}$/.test(value),
    ),
  );
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    let response;
    try {
      response = await fetcher(`https://content.osu.edu/v2/classes/${path}`, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
          : AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        const error = catalogError(
          `Official OSU endpoint returned HTTP ${response.status}.`,
          "CATALOG_HTTP_ERROR",
        );
        error.retryable =
          response.status === 408 ||
          response.status === 429 ||
          response.status >= 500;
        throw error;
      }
      const value = await response.json();
      if (
        !value?.data ||
        typeof value.data !== "object" ||
        Array.isArray(value.data)
      )
        throw catalogError("Invalid OSU response envelope.");
      return value.data;
    } catch (error) {
      const detail = {
        endpoint,
        ...scope,
        attempt: attempt + 1,
        status: response?.status ?? null,
        code: error.code ?? "CATALOG_TRANSPORT_ERROR",
      };
      if (
        signal?.aborted ||
        attempt >= 4 ||
        error.retryable === false ||
        error.code === "CATALOG_DATA_INVALID"
      ) {
        report({ event: "catalog.upstream_failed", ...detail });
        throw error;
      }
      const header = response?.headers.get("retry-after");
      const retryAfter =
        header == null
          ? 0
          : /^\d+$/.test(header)
            ? Number(header) * 1000
            : Date.parse(header) - Date.now();
      const waitMs = Math.min(
        30_000,
        Math.max(
          800 * 2 ** attempt,
          Number.isFinite(retryAfter) ? retryAfter : 0,
        ),
      );
      report({ event: "catalog.upstream_retry", ...detail, waitMs });
      await wait(waitMs);
    }
  }
}

export const searchOfficial = (query, options) =>
  fetchOfficialJson(
    `search?${new URLSearchParams({ q: "", client: "class-search-ui", sort: "subject", ...query })}`,
    options,
  );

export function hitCount(value, label = "hit count") {
  if (!Number.isSafeInteger(value) || value < 0)
    throw catalogError(`Invalid official ${label}.`);
  return value;
}

export function facet(data, slug) {
  const items = officialFilters(data).find((f) => f.slug === slug)?.items ?? [];
  if (!Array.isArray(items)) throw catalogError(`Invalid ${slug} facets.`);
  const keys = new Set();
  for (const item of items) {
    if (
      typeof item.term !== "string" ||
      !item.term.trim() ||
      keys.has(item.term)
    )
      throw catalogError(`Invalid or duplicate ${slug} facet key.`);
    keys.add(item.term);
    hitCount(item.count, `${slug} facet count`);
  }
  return items;
}

export function actualCount(data) {
  hitCount(data.totalItems);
  const selected = officialFilters(data).flatMap((f) => {
    return f.items.filter((i) => i.selected).map((i) => hitCount(i.count));
  });
  return selected.length ? Math.min(...selected) : data.totalItems;
}

function officialFilters(data) {
  if (!Array.isArray(data?.filters))
    throw catalogError("Missing official filters.");
  for (const filter of data.filters)
    if (
      !filter ||
      typeof filter !== "object" ||
      !Array.isArray(filter.items) ||
      filter.items.some(
        (item) => !item || typeof item !== "object" || Array.isArray(item),
      )
    )
      throw catalogError("Invalid official filter items.");
  return data.filters;
}

export function searchableTerms(data) {
  if (!Array.isArray(data.data))
    throw catalogError("Invalid official searchable terms.");
  if (
    data.data.some(
      (term) =>
        term !== null && (typeof term !== "object" || Array.isArray(term)),
    )
  )
    throw catalogError("Invalid official term entry.");
  const placeholders = data.data.filter((t) => t === null).length;
  if (placeholders)
    console.warn(
      JSON.stringify({
        event: "catalog.term_placeholders",
        endpoint: "searchableTermsV2",
        count: placeholders,
      }),
    );
  const terms = data.data.filter((t) => t?.classSearch === "Y");
  const seen = new Set();
  for (const term of terms) {
    if (
      !/^\d{4}$/.test(term.strm) ||
      typeof term.strm !== "string" ||
      seen.has(term.strm)
    )
      throw catalogError("Invalid or duplicate searchable term.");
    seen.add(term.strm);
  }
  if (!terms.length) throw catalogError("No searchable terms returned.");
  return terms;
}
