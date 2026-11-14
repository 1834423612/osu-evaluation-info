import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
const base = new URL(
  process.env.SEARCH_BENCH_BASE_URL ?? "http://localhost:3100",
);
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))
  throw new Error("This benchmark only targets a local test server");
const clients = Math.max(
  1,
  Math.min(200, Number(process.env.SEARCH_BENCH_CLIENTS) || 200),
);
const output = process.argv[2] ?? ".cache/search-benchmark.json";
const params = new URLSearchParams({
  q: "data structures",
  term: "1272",
  campus: "COL",
});
async function request(path) {
  const start = performance.now(),
    response = await fetch(new URL(path, base));
  const body = await response.json();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return {
    ms: performance.now() - start,
    count: body.courses?.length ?? body.filters?.[0]?.items.length ?? 0,
  };
}
const vocabulary = await request("/api/catalog/subjects?term=1272");
const first = await request(`/api/catalog/search?${params}`);
const start = performance.now();
const result = await Promise.all(
  Array.from({ length: clients }, () =>
    request(`/api/catalog/search?${params}`),
  ),
);
const elapsed = performance.now() - start,
  times = result.map((r) => r.ms).sort((a, b) => a - b);
const report = {
  clients,
  vocabularyMs: Math.round(vocabulary.ms),
  firstQueryMs: Math.round(first.ms),
  courses: first.count,
  batchMs: Math.round(elapsed),
  p50Ms: Math.round(times[Math.floor(clients * 0.5)]),
  p95Ms: Math.round(times[Math.min(clients - 1, Math.floor(clients * 0.95))]),
  maxMs: Math.round(times.at(-1)),
  allReturnedSamePage: result.every((r) => r.count === first.count),
};
await mkdir(dirname(output), { recursive: true });
await writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
