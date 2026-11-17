import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  archiveDirectory,
  archiveCurricula,
  archiveTemplate,
} from "../../scripts/planning/archive.mjs";
import {
  planningSchema,
  planningTable,
} from "../../src/lib/planning/namespace.ts";
const content = Buffer.from(
  "<h1>Synthetic public curriculum</h1><p>CSE 2999</p>",
);
const digest = createHash("sha256").update(content).digest("hex");
const time = "2026-11-16T00:00:00Z";
const doc = {
  id: "a".repeat(24),
  url: "https://students.cfaes.ohio-state.edu/synthetic/curriculum",
  resolvedUrl: "https://students.cfaes.ohio-state.edu/synthetic/curriculum",
  sha256: digest,
  fetchedAt: time,
  mediaType: "text/html",
  title: "Synthetic curriculum",
  programIds: [],
  documentKind: "source",
  academicYears: [],
  effectiveTerms: [],
  appliedVersions: [],
  geSystems: [],
  publicationStatus: "unknown",
  courseReferences: [],
  pageCount: null,
  extractionStatus: "unstructured",
  reviewStatus: "pending",
};
const directory = {
  schemaVersion: 1,
  generatedAt: time,
  index: {
    url: "https://undergrad.osu.edu/majors-and-academics/majors-by-college",
    sha256: digest,
    fetchedAt: time,
  },
  coverage: "partial",
  programs: [],
  documents: [doc],
  pending: [],
  counts: { downloadedVersions: 1 },
};
test("archive stores original bytes immutably, rolls back bad hashes, and restores a local backup", async () => {
  const db = new PGlite();
  try {
    const sql = (
      await readFile(
        new URL("../../db/schemas/planning.sql", import.meta.url),
        "utf8",
      )
    ).replaceAll("osu_planning", planningSchema());
    await db.exec(sql);
    await db.exec(sql);
    await db.query("BEGIN");
    await archiveDirectory(db, directory, async () => ({ content }));
    await archiveDirectory(db, directory, async () => ({ content }));
    await db.query("COMMIT");
    for (const version of ["parser-v1", "parser-v2", "parser-v2"]) {
      await archiveDirectory(db, directory, async () => ({
        content,
        extraction: {
          parserVersion: version,
          extractedAt: time,
          pageCount: 1,
          blocks: [
            {
              text: version === "parser-v2" ? "CSE 2999\0\ud800" : "CSE 2999",
              page: 1,
            },
          ],
        },
      }));
    }
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM " + planningTable("source_extraction"),
        )
      ).rows[0].n,
      2,
    );
    const encoding = (
      await db.query(
        "SELECT evidence FROM " +
          planningTable("source_extraction") +
          " WHERE parser_version='parser-v2'",
      )
    ).rows[0].evidence;
    assert.equal(encoding.blocks[0].text, "CSE 2999\ufffd\ufffd");
    assert.equal(encoding.textStorage, "unicode-replacement-v1");
    const candidates = JSON.parse(
      await readFile(
        new URL("../../data/planning/curricula.json", import.meta.url),
        "utf8",
      ),
    );
    const synthetic = {
      ...candidates[0],
      id: "synthetic",
      source: { ...candidates[0].source, url: doc.url, sha256: digest },
    };
    await archiveCurricula(db, [synthetic, synthetic]);
    const saved = (
      await db.query(
        "SELECT curriculum, review_status FROM " +
          planningTable("curriculum_version"),
      )
    ).rows;
    assert.equal(saved.length, 1);
    assert.equal(saved[0].review_status, "pending");
    assert.equal(saved[0].curriculum.semesters.length, 8);
    await assert.rejects(
      archiveCurricula(db, [{ ...synthetic, id: "colliding-version" }]),
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM " + planningTable("source_asset"),
        )
      ).rows[0].n,
      1,
    );
    assert.equal(
      (
        await db.query(
          "SELECT octet_length(content)::int n FROM " +
            planningTable("source_asset"),
        )
      ).rows[0].n,
      content.length,
    );
    await db.query("BEGIN");
    await assert.rejects(
      archiveDirectory(db, directory, async () => ({
        content: Buffer.from("tampered"),
      })),
      /integrity/,
    );
    await db.query("ROLLBACK");
    const restored = new PGlite({ loadDataDir: await db.dumpDataDir("gzip") });
    try {
      assert.equal(
        (
          await restored.query(
            "SELECT count(*)::int n FROM " +
              planningTable("directory_snapshot"),
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await restored.close();
    }
    await assert.rejects(
      archiveTemplate(db, { ...directory, studentId: "PRIVATE" }),
    );
  } finally {
    await db.close();
  }
});
