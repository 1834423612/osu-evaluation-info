import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  directorySchema,
  queryDirectory,
} from "../../src/lib/planning/directory.ts";
const directory = directorySchema.parse(
  JSON.parse(
    await readFile(
      new URL("../../data/planning/directory.json", import.meta.url),
      "utf8",
    ),
  ),
);
test("public index retains program rows and reports incomplete coverage", () => {
  assert.ok(directory.programs.length >= 150);
  assert.equal(new Set(directory.programs.map((p) => p.college)).size, 14);
  assert.equal(directory.coverage, "partial");
  assert.ok(directory.documents.every((d) => d.reviewStatus === "pending"));
  const ids = new Set(directory.documents.map((d) => d.id));
  assert.ok(
    directory.programs.every((p) => p.documentIds.every((id) => ids.has(id))),
  );
  assert.doesNotMatch(
    JSON.stringify(directory),
    /Cookie|Bearer |student_id|rawText/i,
  );
});
test("directory queries are bounded and omit detailed course lists", () => {
  const result = queryDirectory(directory, new URLSearchParams());
  assert.ok(result.documents.length <= 24);
  assert.ok(result.documents.every((d) => !("courseReferences" in d)));
  assert.equal(result.total, directory.documents.length);
  assert.throws(() => queryDirectory(directory, new URLSearchParams("page=0")));
  assert.throws(() =>
    queryDirectory(directory, new URLSearchParams("ge=unknown")),
  );
  assert.equal(
    queryDirectory(
      directory,
      new URLSearchParams("q=impossible-synthetic-title"),
    ).total,
    0,
  );
});

test("college and requirement-term filters retain association boundaries", () => {
  const program = directory.programs.find((p) => p.documentIds.length);
  const result = queryDirectory(
    directory,
    new URLSearchParams({ college: program.college }),
  );
  assert.ok(result.total > 0);
  assert.ok(
    result.documents.every((d) =>
      d.programIds.some((id) =>
        directory.programs.some(
          (p) => p.id === id && p.college === program.college,
        ),
      ),
    ),
  );
  assert.throws(() =>
    queryDirectory(directory, new URLSearchParams("version=2026")),
  );
  if (result.versions.length) {
    const version = result.versions[0];
    assert.ok(
      queryDirectory(
        directory,
        new URLSearchParams({ version }),
      ).documents.every(
        (d) =>
          d.effectiveTerms.includes(version) ||
          d.appliedVersions.includes(version),
      ),
    );
  }
});
