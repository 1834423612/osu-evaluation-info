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
const propertyMap = new Map();
let propertyRows = 0;
for (let page = 1; ; page++) {
  const result = await read("/event-data", {
    event: "course_search",
    page: String(page),
    pageSize: "500",
  });
  for (const event of result.data) {
    const props = propertyMap.get(event.eventId) ?? {};
    for (const item of event.eventProperties) {
      propertyRows++;
      props[item.dataKey] =
        item.stringValue ?? item.numberValue ?? item.dateValue;
    }
    propertyMap.set(event.eventId, props);
  }
  if (propertyRows >= result.count) break;
  if (!result.data.length || page >= 1000)
    throw new Error("Incomplete search-property pagination");
  await new Promise((resolve) => setTimeout(resolve, 350));
}
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
    const props = propertyMap.get(event.id) ?? {};
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
const report = {
  site: { name: site.name, domain: site.domain, createdAt: site.createdAt },
  coverage: {
    through: new Date(end).toISOString(),
    eventsFetched: events.length,
    searchPropertyRows: propertyRows,
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
    eventNames: counts(
      productionEvents
        .filter((event) => event.eventType === 2)
        .map((event) => event.eventName),
    ),
  },
  searches,
};
const output = process.argv[2] ?? "/tmp/osu-search-audit.json";
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, searches: undefined }, null, 2));
console.log(`Search report: ${output}`);
