import test from "node:test";
import assert from "node:assert/strict";
import { CourseSearchEngine } from "../../src/lib/search/engine.ts";
import { buildCatalogCorpus } from "../../src/lib/search/catalog-source.ts";
import {
  encodePreparedCorpus,
  decodePreparedCorpus,
  loadPreparedCorpus,
} from "../../src/lib/search/prepared-corpus.ts";
import {
  prepareSearchArtifacts,
  prepareSearchGeneration,
} from "../../scripts/search/prepare.mjs";
const snapshot = {
  run: "12345678-1234-1234-1234-123456789012",
  term: "1272",
  snapshotAt: "2026-11-12T00:00:00.000Z",
  terms: [{ code: "1272", label: "Spring 2027" }],
};
const docs = [
  {
    id: "CSE-2221",
    subject: "CSE",
    subjectName: "Computer Science and Engineering",
    catalogNumber: "2221",
    campusCode: "COL",
    title: "Software Components",
    description: "Data structures and algorithms.",
    instructors: "Example Teacher",
  },
  {
    id: "MATH-1151",
    subject: "MATH",
    subjectName: "Mathematics",
    catalogNumber: "1151",
    campusCode: "COL",
    title: "Calculus I",
    description: "Differential and integral calculus.",
    instructors: "Example Instructor",
  },
];
test("prepared engine preserves exact, fuzzy, subject and keyword results", () => {
  const original = new CourseSearchEngine(docs);
  const restored = CourseSearchEngine.restore(
    JSON.parse(JSON.stringify(original.snapshot())),
  );
  for (const query of [
    "CSE 2221",
    "software",
    "softwre",
    "computer science",
    "data structures",
    "1151",
    "calclus",
  ])
    assert.deepEqual(restored.search(query), original.search(query), query);
});
function corpus() {
  const row = { subject: "CSE", catalog_number: "2221", campus_code: "COL" };
  return buildCatalogCorpus(
    [
      {
        ...row,
        data: {
          subject: "CSE",
          subjectDesc: "Computer Science",
          catalogNumber: "2221",
          campusCode: "COL",
          courseId: "1",
          offeringNumber: "1",
          title: "Software Components",
          description: "Data structures",
        },
      },
    ],
    [
      {
        ...row,
        data: {
          classNumber: "100",
          termCode: "1272",
          courseId: "1",
          courseOfferingNumber: 1,
          section: "001",
          meetings: [],
          attributes: [],
        },
      },
    ],
    snapshot,
  );
}
test("compressed corpus round-trips maps and rejects corrupt or mismatched generations", () => {
  const original = corpus(),
    encoded = encodePreparedCorpus(original);
  const decoded = decodePreparedCorpus(
    encoded.payload,
    encoded.digest,
    snapshot,
  );
  assert.deepEqual(decoded.courses, original.courses);
  assert.deepEqual(
    [...decoded.metadata],
    JSON.parse(JSON.stringify([...original.metadata])),
  );
  assert.deepEqual(
    decoded.engine.search("software"),
    original.engine.search("software"),
  );
  assert.throws(
    () => decodePreparedCorpus(encoded.payload, "0".repeat(64), snapshot),
    /integrity/,
  );
  assert.throws(
    () =>
      decodePreparedCorpus(encoded.payload, encoded.digest, {
        ...snapshot,
        term: "1268",
      }),
    /generation/,
  );
});
test("request reader performs no DDL or writes, and missing schema/artifact falls back", async () => {
  const sql = [];
  assert.equal(
    await loadPreparedCorpus(
      {
        query: async (q) => {
          sql.push(q);
          return { rows: [{ installed: false }] };
        },
      },
      snapshot,
    ),
    null,
  );
  assert.equal(sql.length, 1);
  assert.equal(
    await loadPreparedCorpus(
      {
        query: async (q) => {
          sql.push(q);
          return {
            rows: q.includes("to_regclass") ? [{ installed: true }] : [],
          };
        },
      },
      snapshot,
    ),
    null,
  );
  assert.ok(sql.every((q) => q.startsWith("SELECT")));
});
test("prepared reader restores latest publication metadata without rebuilding", async () => {
  const encoded = encodePreparedCorpus(corpus());
  const current = {
    ...snapshot,
    terms: [...snapshot.terms, { code: "1268", label: "Autumn 2026" }],
  };
  const result = await loadPreparedCorpus(
    {
      query: async (q) => ({
        rows: q.includes("to_regclass") ? [{ installed: true }] : [encoded],
      }),
    },
    current,
  );
  assert.deepEqual(result.terms, current.terms);
  assert.equal(result.engine.search("software").hits.length, 1);
});
test("preparation requires explicit migration and reuses existing artifacts", async () => {
  await assert.rejects(
    () =>
      prepareSearchArtifacts({
        query: async () => ({ rows: [{ installed: false }] }),
      }),
    /migration|migrate/,
  );
  const sql = [];
  const result = await prepareSearchArtifacts({
    query: async (q) => {
      sql.push(q);
      if (q.includes("to_regclass")) return { rows: [{ installed: true }] };
      if (q.includes("FROM osu_catalog.term_archives"))
        return { rows: snapshot.terms };
      if (q.includes("FROM osu_catalog.sync_runs"))
        return {
          rows: [{ id: snapshot.run, completed_at: snapshot.snapshotAt }],
        };
      return { rows: [encodePreparedCorpus(corpus())], rowCount: 1 };
    },
  });
  assert.deepEqual(result, { built: 0, reused: 1 });
  assert.ok(
    !sql.some((q) => q.includes("course_snapshots") || q.startsWith("CREATE")),
  );
  assert.ok(
    sql.some((q) => q.startsWith("DELETE FROM osu_catalog.search_artifacts")),
  );
});

test("failed preparation rolls back without committing or publishing a generation", async () => {
  const statements = [];
  await assert.rejects(
    () =>
      prepareSearchGeneration(
        {
          query: async (sql) => {
            statements.push(sql);
            if (sql.includes("course_snapshots"))
              throw new Error("source unavailable");
            return { rows: [] };
          },
        },
        snapshot,
      ),
    /source unavailable/,
  );
  assert.deepEqual(
    statements.filter((sql) =>
      ["BEGIN ISOLATION LEVEL REPEATABLE READ", "COMMIT", "ROLLBACK"].includes(
        sql,
      ),
    ),
    ["BEGIN ISOLATION LEVEL REPEATABLE READ", "ROLLBACK"],
  );
  assert.ok(
    !statements.some(
      (sql) => sql.includes("published_at") || sql.startsWith("INSERT"),
    ),
  );
});
test("catalog CLI prepares indexes before exposing a generation and requires migration 7", async () => {
  const { readFile } = await import("node:fs/promises");
  const cli = await readFile(
    new URL("../../scripts/catalog/sync_osu_catalog.mjs", import.meta.url),
    "utf8",
  );
  assert.ok(
    cli.indexOf("await prepareSearchGeneration(") <
      cli.indexOf("await publishCatalogSnapshot("),
  );
  const database = await readFile(
    new URL("../../scripts/catalog/database.mjs", import.meta.url),
    "utf8",
  );
  assert.match(database, /CATALOG_SCHEMA_VERSION = 7/);
});

test("preparation repairs damaged artifacts atomically instead of reusing them", async () => {
  const { createHash } = await import("node:crypto");
  const statements = [];
  const wire = (value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    return {
      subject: "CSE",
      catalog_number: "2221",
      campus_code: "COL",
      data: bytes.toString("base64"),
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  };
  const client = {
    query: async (sql) => {
      statements.push(sql);
      if (sql.includes("to_regclass")) return { rows: [{ installed: true }] };
      if (sql.includes("FROM osu_catalog.term_archives"))
        return { rows: snapshot.terms };
      if (sql.includes("FROM osu_catalog.sync_runs"))
        return {
          rows: [{ id: snapshot.run, completed_at: snapshot.snapshotAt }],
        };
      if (sql.startsWith("SELECT payload,digest"))
        return {
          rows: [{ payload: Buffer.from("broken"), digest: "0".repeat(64) }],
        };
      if (sql.includes("FROM osu_catalog.course_snapshots"))
        return {
          rows: [
            wire({
              subject: "CSE",
              subjectDesc: "Computer Science",
              catalogNumber: "2221",
              campusCode: "COL",
              courseId: "1",
              offeringNumber: "1",
              title: "Software Components",
              description: "Data structures",
            }),
          ],
        };
      if (sql.includes("FROM osu_catalog.section_snapshots"))
        return {
          rows: [
            wire({
              classNumber: "100",
              termCode: "1272",
              courseId: "1",
              courseOfferingNumber: 1,
              section: "001",
              meetings: [],
              attributes: [],
            }),
          ],
        };
      return { rows: [], rowCount: 1 };
    },
  };
  assert.deepEqual(await prepareSearchArtifacts(client), {
    built: 1,
    reused: 0,
  });
  assert.ok(
    statements.some((sql) =>
      sql.includes("DO UPDATE SET payload=EXCLUDED.payload"),
    ),
  );
  assert.ok(statements.includes("COMMIT"));
  assert.ok(!statements.includes("ROLLBACK"));
});
