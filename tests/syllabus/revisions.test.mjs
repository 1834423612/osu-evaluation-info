import test from "node:test";
import assert from "node:assert/strict";
import * as revisions from "../../src/lib/syllabus/diff.ts";

const document = (html, overrides = {}) => ({
  entry: { code: "example123", title: "Course" },
  snapshotId: "published-a",
  modifiedAt: "2026-11-01T10:00:00Z",
  components: [
    {
      id: "section-a",
      type: "content",
      locale: "en-US",
      order: 0,
      html,
      officialHtml: html,
    },
  ],
  ...overrides,
});

test("rendered history retains semantic tables and marks deleted and inserted text safely", () => {
  const before = document(
    "<div><h2>Grading</h2><p>Exam 40%</p><table><tr><th>Week</th><td>One</td></tr></table></div>",
  );
  const after = document(
    '<div onclick="evil()"><h2>Grading</h2><p>Exam 50% &amp; project</p><table><tr><th>Week</th><td>One</td></tr></table><script>evil()</script><a href="javascript:evil()">Resource</a></div>',
  );
  const result = revisions.compareSyllabusRevisions?.(before, after);
  assert.ok(result, "rendered comparison is available");
  assert.equal(result.changes.text, true);
  assert.ok(
    result.blocks.some(
      (block) =>
        block.kind === "removed" && block.html.includes("<del>Exam 40%</del>"),
    ),
  );
  assert.ok(
    result.blocks.some(
      (block) =>
        block.kind === "added" &&
        block.html.includes("<ins>Exam 50% &amp; project</ins>"),
    ),
  );
  const html = result.blocks.map((block) => block.html).join("");
  assert.match(html, /<h2>Grading<\/h2>/);
  assert.match(html, /<table><tr><th>Week<\/th><td>One<\/td><\/tr><\/table>/);
  assert.doesNotMatch(html, /onclick|javascript:|<script|evil\(\)/);
});

test("zero-line comparisons distinguish links, presentation, source metadata and archive enrichment", () => {
  const original = document('<p><a href="https://osu.edu/old">Reading</a></p>');
  const link = revisions.compareSyllabusRevisions?.(
    original,
    document('<p><a href="https://osu.edu/new">Reading</a></p>'),
  );
  assert.ok(link, "revision classification is available");
  assert.equal(link.changes.text, false);
  assert.equal(link.changes.links, true);
  const layout = revisions.compareSyllabusRevisions(
    original,
    document(original.components[0].html, {
      components: [
        {
          ...original.components[0],
          officialHtml:
            '<p style="text-align:center"><a href="https://osu.edu/old">Reading</a></p>',
        },
      ],
    }),
  );
  assert.equal(layout.changes.presentation, true);
  const metadata = revisions.compareSyllabusRevisions(original, {
    ...original,
    modifiedAt: "2026-11-20T10:00:00Z",
  });
  assert.equal(metadata.changes.metadata, true);
  assert.equal(metadata.changes.presentation, false);
  const legacy = structuredClone(original);
  delete legacy.components[0].officialHtml;
  const enriched = revisions.compareSyllabusRevisions(legacy, original);
  assert.equal(enriched.changes.archiveRepresentation, true);
  assert.equal(enriched.changes.presentation, false);
});

test("same-label file and image replacements are reported without claiming a text or layout change", () => {
  const before = document(
    '<p><a href="https://osu.edu/old.pdf">Download</a></p><p><img src="https://osu.edu/old.png" alt="Diagram"></p>',
  );
  const after = document(
    '<p><a href="https://osu.edu/new.pdf">Download</a></p><p><img src="https://osu.edu/new.png" alt="Diagram"></p>',
  );
  const result = revisions.compareSyllabusRevisions(before, after);
  assert.equal(result.changes.text, false);
  assert.equal(result.changes.links, true);
  assert.equal(result.changes.media, true);
  assert.equal(result.changes.presentation, false);
  const textChange = revisions.compareSyllabusRevisions(
    document("<p>Exam 40%</p>"),
    document("<p>Exam 50%</p>"),
  );
  assert.equal(textChange.changes.presentation, false);
});

test("history folds repeated archive renderings but retains source updates and real content changes", () => {
  const base = document("<p>Exam 40%</p>");
  const withEditor = (id) => ({
    ...base,
    components: [
      {
        ...base.components[0],
        officialHtml: `<div id="editor-0.${id}"><p>Exam 40%</p></div>`,
      },
    ],
  });
  const rows = [
    {
      id: "new-source",
      document: { ...withEditor("3"), modifiedAt: "2026-11-21T10:00:00Z" },
      fetchedAt: "2026-11-21T12:00:00Z",
    },
    {
      id: "new-copy",
      document: withEditor("2"),
      fetchedAt: "2026-11-20T12:00:00Z",
    },
    {
      id: "old-copy",
      document: withEditor("1"),
      fetchedAt: "2026-11-19T12:00:00Z",
    },
    {
      id: "changed-text",
      document: document("<p>Exam 30%</p>"),
      fetchedAt: "2026-11-18T12:00:00Z",
    },
  ];
  const versions = revisions.distinctSyllabusRevisions?.(rows);
  assert.ok(versions, "distinct archived revisions are available");
  assert.deepEqual(
    versions.map((row) => row.id),
    ["new-source", "new-copy", "changed-text"],
  );
  assert.equal(versions[1].archivedCopies, 2);
});

test("an incomplete newest archive cannot hide distinct complete layouts", () => {
  const base = document("<p>Exam 40%</p>");
  const legacy = structuredClone(base);
  delete legacy.components[0].officialHtml;
  const centered = structuredClone(base);
  centered.components[0].officialHtml =
    '<p style="text-align:center">Exam 40%</p>';
  const right = structuredClone(base);
  right.components[0].officialHtml = '<p style="text-align:right">Exam 40%</p>';
  const versions = revisions.distinctSyllabusRevisions([
    {
      id: "unknown-newest",
      document: legacy,
      fetchedAt: "2026-11-23T12:00:00Z",
    },
    { id: "centered", document: centered, fetchedAt: "2026-11-22T12:00:00Z" },
    { id: "right", document: right, fetchedAt: "2026-11-21T12:00:00Z" },
  ]);
  assert.deepEqual(
    versions.map((version) => version.id),
    ["unknown-newest", "centered", "right"],
  );
  const unambiguous = revisions.distinctSyllabusRevisions([
    {
      id: "unknown-newest",
      document: legacy,
      fetchedAt: "2026-11-23T12:00:00Z",
    },
    { id: "complete", document: centered, fetchedAt: "2026-11-22T12:00:00Z" },
  ]);
  assert.deepEqual(
    unambiguous.map((version) => [version.id, version.archivedCopies]),
    [["complete", 2]],
  );
});

test("missing layout in one component cannot hide known layout or media changes in another", () => {
  const component = (id, officialHtml) => ({
    id,
    type: "content",
    order: id === "a" ? 0 : 1,
    locale: "en-US",
    html: "<p>Same text</p>",
    ...(officialHtml === undefined ? {} : { officialHtml }),
  });
  const partial = document("", {
    components: [
      component(
        "a",
        '<p style="text-align:center"><img src="https://osu.edu/old.png" alt="Diagram">Same text</p>',
      ),
      component("b", undefined),
    ],
  });
  const complete = document("", {
    components: [
      component(
        "a",
        '<p style="text-align:right"><img src="https://osu.edu/new.png" alt="Diagram">Same text</p>',
      ),
      component("b", "<p>Same text</p>"),
    ],
  });
  const comparison = revisions.compareSyllabusRevisions(partial, complete);
  assert.equal(comparison.changes.presentation, true);
  assert.equal(comparison.changes.media, true);
  const versions = revisions.distinctSyllabusRevisions([
    { id: "newer", document: complete, fetchedAt: "2026-11-23T12:00:00Z" },
    { id: "partial", document: partial, fetchedAt: "2026-11-22T12:00:00Z" },
  ]);
  assert.deepEqual(
    versions.map((row) => row.id),
    ["newer", "partial"],
  );
  const secondPartial = structuredClone(complete);
  delete secondPartial.components[1].officialHtml;
  assert.equal(
    revisions.distinctSyllabusRevisions([
      {
        id: "partial-right",
        document: secondPartial,
        fetchedAt: "2026-11-23T12:00:00Z",
      },
      {
        id: "partial-center",
        document: partial,
        fetchedAt: "2026-11-22T12:00:00Z",
      },
    ]).length,
    2,
  );
});
