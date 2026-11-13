import { writeFile } from "node:fs/promises";

// Read-only Umami 3.4.x audit. The key stays in process memory and request headers.
const website = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;
const key = process.env.UMAMI_API_KEY;
if (!key || !website) throw new Error("Missing UMAMI_API_KEY or website ID");
const origin =
  process.env.UMAMI_API_BASE_URL ??
  new URL(process.env.NEXT_PUBLIC_UMAMI_TRACKER_URL).origin;
const end = Date.now();
const range = {
  startAt: "0",
  endAt: String(end),
  timezone: "America/New_York",
};
async function read(resource, params = {}) {
  const url = new URL(`/api/websites/${website}${resource}`, origin);
  url.search = new URLSearchParams({ ...range, ...params });
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw new Error(`Umami ${resource}: HTTP ${response.status}`);
  return response.json();
}
const site = await read("");
if (typeof site.domain !== "string" || !site.domain)
  throw new Error("Umami did not return the website domain");
const stats = await read("/stats");
const events = [];
for (let page = 1; ; page++) {
  const result = await read("/events", { page: String(page), pageSize: "500" });
  if (result.isCapped) throw new Error("Umami response was capped");
  events.push(...result.data);
  if (events.length >= result.count) break;
  if (!result.data.length || page >= 1000)
    throw new Error("Incomplete analytics pagination");
  await new Promise((resolve) => setTimeout(resolve, 350));
}
async function readProperties(eventName) {
  const properties = new Map();
  let rows = 0;
  for (let page = 1; ; page++) {
    const result = await read("/event-data", {
      event: eventName,
      page: String(page),
      pageSize: "500",
    });
    if (result.isCapped)
      throw new Error(`Umami capped ${eventName} properties`);
    for (const event of result.data) {
      const props = properties.get(event.eventId) ?? {};
      for (const item of event.eventProperties) {
        rows++;
        props[item.dataKey] =
          item.stringValue ?? item.numberValue ?? item.dateValue;
      }
      properties.set(event.eventId, props);
    }
    if (rows >= result.count) break;
    if (!result.data.length || page >= 1000)
      throw new Error(`Incomplete ${eventName} property pagination`);
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  return { properties, rows };
}
const submissions = await readProperties("course_search");
const outcomes = await readProperties("course_search_results");
const counts = (values) =>
  Object.fromEntries(
    [
      ...values.reduce(
        (map, value) => map.set(value, (map.get(value) ?? 0) + 1),
        new Map(),
      ),
    ].sort((a, b) => b[1] - a[1]),
  );
const searches = events
  .filter((event) => event.eventName === "course_search")
  .map((event) => {
    const props = submissions.properties.get(event.id) ?? {};
    return {
      at: event.createdAt,
      hostname: event.hostname,
      query: props.search_term ?? null,
      type: props.search_type ?? null,
    };
  });
const productionEvents = events.filter(
  (event) => event.hostname === site.domain,
);
const productionSearches = searches.filter(
  (event) => event.hostname === site.domain,
);
const resultLoads = events
  .filter((event) => event.eventName === "course_search_results")
  .map((event) => {
    const props = outcomes.properties.get(event.id) ?? {};
    return {
      at: event.createdAt,
      hostname: event.hostname,
      query: props.search_term ?? null,
      status: props.status ?? "unknown",
      resultCount: props.result_count ?? null,
      totalCourses: props.total_courses ?? null,
      hasMore: props.has_more ?? null,
      complete: props.complete ?? null,
      term: props.term ?? null,
      campus: props.campus ?? null,
      engine: props.search_engine ?? "legacy",
      fuzzyResults: props.fuzzy_results ?? null,
      indexFallback: props.index_fallback ?? null,
    };
  });
const productionResultLoads = resultLoads.filter(
  (event) => event.hostname === site.domain,
);
const report = {
  site: { name: site.name, domain: site.domain, createdAt: site.createdAt },
  coverage: {
    through: new Date(end).toISOString(),
    eventsFetched: events.length,
    searchPropertyRows: submissions.rows,
    outcomePropertyRows: outcomes.rows,
    unlabelledSearches: searches.filter((row) => !row.query).length,
  },
  stats,
  hosts: counts(events.map((event) => event.hostname)),
  eventNames: counts(
    events
      .filter((event) => event.eventType === 2)
      .map((event) => event.eventName),
  ),
  pagePaths: counts(
    events
      .filter((event) => event.eventType === 1)
      .map((event) => event.urlPath),
  ),
  queryCounts: counts(searches.map((row) => row.query)),
  production: {
    stats: await read("/stats", { hostname: site.domain }),
    events: productionEvents.length,
    searches: productionSearches.length,
    queryCounts: counts(productionSearches.map((row) => row.query)),
    resultLoads: productionResultLoads.length,
    resultStatuses: counts(productionResultLoads.map((row) => row.status)),
    resultEngines: counts(productionResultLoads.map((row) => row.engine)),
    indexFallbacks: counts(
      productionResultLoads
        .filter((row) => row.indexFallback && row.indexFallback !== "none")
        .map((row) => row.indexFallback),
    ),
    confirmedEmptyQueries: counts(
      productionResultLoads
        .filter((row) => row.status === "no_matches")
        .map((row) => row.query),
    ),
    eventNames: counts(
      productionEvents
        .filter((event) => event.eventType === 2)
        .map((event) => event.eventName),
    ),
  },
  searches,
  resultLoads,
};
const output = process.argv[2] ?? "/tmp/osu-search-audit.json";
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify(
    { ...report, searches: undefined, resultLoads: undefined },
    null,
    2,
  ),
);
console.log(`Search report: ${output}`);
