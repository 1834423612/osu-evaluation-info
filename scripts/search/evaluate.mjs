import pg from "pg";
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { loadCatalogCorpus } from "../../src/lib/search/catalog-source.ts";
import { compact, prose, terms } from "../../src/lib/search/analyzer.ts";
import {
  FIND_CATALOG_SNAPSHOT_SQL,
  LATEST_CATALOG_TERM_SQL,
} from "../../src/lib/catalog/snapshot-policy.ts";

const output = process.argv[2] ?? "/tmp/osu-search-engine-evaluation.json";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  statement_timeout: 20000,
});
let corpus;
const started = performance.now();
try {
  await client.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const term =
    process.env.SEARCH_EVAL_TERM ??
    (await client.query(LATEST_CATALOG_TERM_SQL)).rows[0]?.term_code;
  const snapshot = (await client.query(FIND_CATALOG_SNAPSHOT_SQL, [term, null]))
    .rows[0];
  if (!snapshot) throw new Error("No complete published corpus");
  corpus = await loadCatalogCorpus(client, {
    run: snapshot.id,
    term,
    snapshotAt: new Date(snapshot.completed_at).toISOString(),
    terms: snapshot.terms.map((code) => ({ code, label: code })),
  });
  await client.query("COMMIT");
} catch (error) {
  console.error(
    "Search evaluation source unavailable",
    error.code ?? error.name,
  );
  console.error(
    String(error.stack)
      .replace(/postgres(?:ql)?:\/\/\S+/g, "[redacted]")
      .split("\n")
      .slice(0, 7)
      .join("\n"),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
if (!corpus) process.exit(1);
const buildMs = performance.now() - started;
const documents = [...corpus.engine.documents.values()];
const subjects = new Map();
for (const doc of documents) {
  const candidate = subjects.get(doc.subject);
  if (
    !candidate ||
    (terms(candidate.title).length < 3 && terms(doc.title).length >= 3)
  )
    subjects.set(doc.subject, doc);
}
const identity = (doc) => `${doc.subject} ${doc.catalogNumber}`;
const cases = [],
  skipped = { validNumberCollision: 0, shortTitle: 0, shortDescription: 0 };
for (const doc of subjects.values()) {
  const expected = identity(doc),
    words = terms(doc.title).slice(0, 12);
  cases.push({ kind: "exact_code", query: expected, expected, doc });
  cases.push({
    kind: "reversed_code",
    query: `${doc.catalogNumber} ${doc.subject}`,
    expected,
    doc,
  });
  const number = doc.catalogNumber,
    position = [...number].findIndex(
      (c, i) =>
        i < number.length - 1 &&
        /^\d{2}$/.test(c + number[i + 1]) &&
        c !== number[i + 1],
    );
  if (position >= 0) {
    const swapped =
      number.slice(0, position) +
      number[position + 1] +
      number[position] +
      number.slice(position + 2);
    if (
      !documents.some(
        (other) =>
          other.subject === doc.subject && other.catalogNumber === swapped,
      )
    )
      cases.push({
        kind: "number_transposition",
        query: `${doc.subject} ${swapped}`,
        expected,
        doc,
      });
    else skipped.validNumberCollision++;
  }
  const label = terms(doc.subjectName)
    .map((word) => word.slice(0, 3))
    .join("");
  if (label.length >= 2 && label.length <= 20)
    cases.push({
      kind: "derived_abbreviation",
      query: `${label} ${doc.catalogNumber}`,
      expected,
      doc,
    });
  const longest = words
    .map((word, index) => ({ word, index }))
    .filter(({ word }) => word.length >= 5)
    .sort((a, b) => b.word.length - a.word.length);
  if (longest.length && words.length >= 2) {
    const { word, index } = longest[0],
      middle = Math.floor(word.length / 2);
    const deletion = [...words];
    deletion[index] = word.slice(0, middle) + word.slice(middle + 1);
    cases.push({
      kind: "word_deletion",
      query: deletion.join(" "),
      expected,
      doc,
    });
    const swap = [...words];
    swap[index] =
      word.slice(0, middle - 1) +
      word[middle] +
      word[middle - 1] +
      word.slice(middle + 1);
    cases.push({
      kind: "word_transposition",
      query: swap.join(" "),
      expected,
      doc,
    });
    if (longest.length >= 2) {
      const other = longest[1],
        offset = Math.floor(other.word.length / 2);
      deletion[other.index] =
        other.word.slice(0, offset) + "z" + other.word.slice(offset + 1);
      cases.push({
        kind: "multiple_word_errors",
        query: deletion.join(" "),
        expected,
        doc,
      });
    }
  } else skipped.shortTitle++;
  const description = terms(prose(doc.description));
  if (description.length >= 8) {
    const start = Math.floor((description.length - 8) / 2);
    cases.push({
      kind: "description_fragment",
      query: description.slice(start, start + 8).join(" "),
      expected,
      doc,
    });
  } else skipped.shortDescription++;
}
for (let i = 0; i < 40; i++)
  cases.push({
    kind: "negative",
    query: `zxqvjkpl${String.fromCharCode(97 + (i % 26))}wtnm${String.fromCharCode(97 + Math.floor(i / 26))}`,
    expected: null,
  });
for (const doc of new Map(
  documents.map((doc) => [identity(doc), doc]),
).values())
  cases.push({
    kind: "catalog_code_sweep",
    query: identity(doc),
    expected: identity(doc),
    doc,
  });
for (const doc of new Map(
  documents.map((doc) => [compact(doc.title), doc]),
).values())
  if (terms(doc.title).length)
    cases.push({
      kind: "catalog_title_sweep",
      query: doc.title,
      expected: identity(doc),
      doc,
    });
const metrics = {},
  failures = [],
  timings = [];
// A second sweep corrupts a varying word in every distinct title, including
// short words; it is deliberately broader than the longest-word subject sample.
for (const [index, doc] of [
  ...new Map(documents.map((doc) => [compact(doc.title), doc])).values(),
].entries()) {
  const words = terms(doc.title).slice(0, 12),
    eligible = words
      .map((word, i) => ({ word, i }))
      .filter(({ word }) => word.length >= 3 && /^\p{L}+$/u.test(word));
  if (!eligible.length) continue;
  const selected = eligible[index % eligible.length],
    middle = Math.floor(selected.word.length / 2);
  const mutated = [...words];
  mutated[selected.i] =
    index % 2
      ? selected.word.slice(0, middle) + "z" + selected.word.slice(middle + 1)
      : selected.word.slice(0, middle) + selected.word.slice(middle + 1);
  if (mutated[selected.i] === selected.word) continue;
  cases.push({
    kind: "title_error_sweep",
    query: mutated.join(" "),
    expected: identity(doc),
    doc,
  });
}
for (let index = 0; index < cases.length; index++) {
  const item = cases[index],
    before = performance.now();
  const result = corpus.engine.search(item.query);
  timings.push(performance.now() - before);
  const acceptable = (hit) => {
    const found = corpus.engine.documents.get(hit.id);
    return (
      identity(found) === item.expected ||
      ((item.kind.startsWith("word_") ||
        item.kind === "multiple_word_errors" ||
        item.kind === "catalog_title_sweep") &&
        compact(found.title) === compact(item.doc.title)) ||
      (item.kind === "title_error_sweep" &&
        compact(found.title) === compact(item.doc.title)) ||
      (item.kind === "description_fragment" &&
        prose(found.description) === prose(item.doc.description))
    );
  };
  const rank = item.expected
    ? result.hits.findIndex(acceptable) + 1
    : result.hits.length
      ? 0
      : 1;
  const metric = (metrics[item.kind] ??= {
    cases: 0,
    recall1: 0,
    recall5: 0,
    recall12: 0,
    reciprocalRank: 0,
  });
  metric.cases++;
  metric.recall1 += Number(rank === 1);
  metric.recall5 += Number(rank > 0 && rank <= 5);
  metric.recall12 += Number(rank > 0 && rank <= 12);
  metric.reciprocalRank += rank > 0 ? 1 / rank : 0;
  if (!rank || rank > 5)
    failures.push({
      kind: item.kind,
      query: item.query,
      expected: item.expected,
      rank,
      top: result.hits.slice(0, 3).map((hit) => ({
        course: identity(corpus.engine.documents.get(hit.id)),
        title: corpus.engine.documents.get(hit.id).title,
        mode: hit.evidence.mode,
      })),
    });
  if (index % 200 === 0) {
    console.log(`Evaluated ${index}/${cases.length}`);
    await new Promise((resolve) => setImmediate(resolve));
  }
}
for (const metric of Object.values(metrics))
  for (const key of ["recall1", "recall5", "recall12", "reciprocalRank"])
    metric[key] = Number((metric[key] / metric.cases).toFixed(4));
timings.sort((a, b) => a - b);
globalThis.gc?.();
const report = {
  generatedAt: new Date().toISOString(),
  snapshotAt: corpus.snapshotAt,
  term: corpus.term,
  documents: documents.length,
  subjects: subjects.size,
  cases: cases.length,
  skipped,
  buildMs: Math.round(buildMs),
  queryMs: {
    p50: timings[Math.floor(timings.length * 0.5)],
    p95: timings[Math.floor(timings.length * 0.95)],
    max: timings.at(-1),
  },
  heapMb: Math.round(process.memoryUsage().heapUsed / 1048576),
  metrics,
  failures,
};
await writeFile(output, JSON.stringify(report, null, 2));
console.log(
  JSON.stringify({ ...report, failures: failures.slice(0, 12) }, null, 2),
);
console.log(`Report: ${output}`);
if (
  ["exact_code", "catalog_code_sweep", "catalog_title_sweep", "negative"].some(
    (kind) => metrics[kind].recall5 < 1,
  )
)
  process.exitCode = 1;
