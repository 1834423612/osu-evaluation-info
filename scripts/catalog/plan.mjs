import {
  actualCount,
  catalogError,
  facet,
  searchOfficial,
} from "./upstream.mjs";

export const partitionKey = (query) =>
  new URLSearchParams(
    Object.entries(query).sort(([a], [b]) => a.localeCompare(b)),
  ).toString();
const dimensions = ["campus", "component", "catalog-number", "academic-career"];

/** Discover a complete, reconciled plan without changing any saved checkpoint. */
export async function discoverPlan(
  terms,
  availableTerms,
  search = searchOfficial,
) {
  const discoveries = new Map();
  const universe = new Set();
  for (const term of availableTerms) {
    const data = await search({ term: term.strm });
    discoveries.set(term.strm, data);
    for (const subject of facet(data, "subject")) universe.add(subject.term);
  }
  const partitions = [];
  async function divide(query, expected, depth = 0) {
    if (!expected) return;
    if (expected < 10_000) {
      partitions.push({
        partition_key: partitionKey(query),
        query,
        expected_sections: expected,
      });
      return;
    }
    const dimension = dimensions[depth];
    if (!dimension)
      throw catalogError(
        `Cannot safely partition ${partitionKey(query)} below the official cap.`,
      );
    const data = await search(query);
    if (actualCount(data) !== expected)
      throw catalogError(
        "Official index changed during partition discovery.",
        "CATALOG_INDEX_CHANGED",
      );
    const values = facet(data, dimension);
    if (!values.length || values.reduce((n, i) => n + i.count, 0) !== expected)
      throw catalogError(
        `Incomplete or overlapping ${dimension} facets for ${partitionKey(query)}.`,
      );
    for (const item of values)
      await divide({ ...query, [dimension]: item.term }, item.count, depth + 1);
  }
  let expectedTotal = 0;
  for (const term of terms) {
    const data = discoveries.get(term.strm);
    const expected = actualCount(data);
    // Empty terms would otherwise silently replace a usable publication.
    if (!expected)
      throw catalogError(
        `Official term ${term.strm} is empty; preserving existing publications.`,
      );
    const subjects = new Map(
      facet(data, "subject").map((s) => [s.term, s.count]),
    );
    let discovered = [...subjects.values()].reduce((n, count) => n + count, 0);
    for (const subject of [...universe].sort()) {
      if (discovered >= expected) break;
      if (subjects.has(subject)) continue;
      const count = actualCount(await search({ term: term.strm, subject }));
      if (count) {
        subjects.set(subject, count);
        discovered += count;
      }
    }
    if (discovered !== expected)
      throw catalogError(
        `Subject discovery coverage mismatch for ${term.strm}: ${discovered} vs official ${expected} hits.`,
      );
    expectedTotal += expected;
    for (const [subject, count] of [...subjects].sort(([a], [b]) =>
      a.localeCompare(b),
    ))
      await divide({ term: term.strm, subject }, count);
    console.log(
      `${term.descr}: ${expected} official hits, ${subjects.size} subjects (reconciled)`,
    );
  }
  const plan = {
    expectedTotal,
    partitions: partitions.sort((a, b) =>
      a.partition_key.localeCompare(b.partition_key),
    ),
  };
  if (
    new Set(partitions.map((p) => p.partition_key)).size !==
      partitions.length ||
    partitions.reduce((n, p) => n + p.expected_sections, 0) !== expectedTotal
  )
    throw catalogError("Partition plan does not reconcile exactly.");
  return plan;
}

export function samePlan(saved, current) {
  if (saved.length !== current.length) return false;
  const entries = new Map(
    current.map((p) => [partitionKey(p.query), p.expected_sections]),
  );
  const seen = new Set();
  return saved.every((p) => {
    const key = partitionKey(p.query);
    if (seen.has(key)) return false;
    seen.add(key);
    return entries.get(key) === p.expected_sections;
  });
}
