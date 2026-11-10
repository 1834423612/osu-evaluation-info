import assert from "node:assert/strict";
import test from "node:test";
import {
  entryMatches,
  normalizeDocument,
  normalizeEntry,
  normalizeLibraryPage,
  normalizeTerms,
  termCodeFromName,
  validCode,
  validQuery,
} from "../../src/lib/syllabus/normalize.ts";
import {
  cleanSyllabusHtml,
  extractSyllabusSections,
  syllabusText,
} from "../../src/lib/syllabus/content.ts";
import {
  componentId,
  documentFixture,
  envelope,
  rawEntry,
  snapshotId,
  state,
  termId,
} from "./fixtures.mjs";

test("discovers real term UUIDs and keeps current independent of catalog codes", () => {
  assert.equal(termCodeFromName("Autumn 2026"), "1268");
  assert.equal(termCodeFromName("Spring 2027"), "1272");
  assert.equal(termCodeFromName("Summer 2027"), "1274");
  assert.equal(termCodeFromName("Demo Term"), null);
  const old = normalizeTerms(state)[0];
  const future = structuredClone(state);
  future.items[0].state.terms[0].name = "Spring 2027";
  assert.equal(normalizeTerms(future)[0].code, "1272");
  assert.equal(old.id, termId);
  assert.equal(old.code, "1268");
});
test("matches exact term, course suffix/decimal and class identity", () => {
  const entry = normalizeEntry(rawEntry),
    query = { subject: "ART", catalogNumber: "2000", termCode: "1268" };
  assert.equal(entryMatches(entry, query, ["15115"]), true);
  assert.equal(entryMatches(entry, { ...query, termCode: "1272" }), false);
  assert.equal(entryMatches(entry, query, ["25478"]), false);
  assert.equal(
    entryMatches(entry, { ...query, catalogNumber: "2000H" }),
    false,
  );
  assert.equal(
    normalizeEntry({ ...rawEntry, title: "ACADAFF 1100.07 29982" })
      .catalogNumber,
    "1100.07",
  );
  assert.equal(
    normalizeEntry({ ...rawEntry, title: "ART 2000H 15115" }).catalogNumber,
    "2000H",
  );
  assert.equal(normalizeEntry({ ...rawEntry, title: "Unknown format" }), null);
  const synthetic = normalizeEntry({ ...rawEntry, title: "ARCH 4410 s_10356" });
  assert.equal(synthetic.sectionIdentifier, "s_10356");
  assert.equal(synthetic.classNumber, "");
  assert.equal(
    entryMatches(
      synthetic,
      { subject: "ARCH", catalogNumber: "4410", termCode: "1268" },
      ["10356"],
    ),
    false,
  );
});
test("rejects malformed envelopes, pagination and unsafe query inputs", () => {
  assert.throws(() => normalizeLibraryPage({ items: [] }, 0));
  assert.throws(() =>
    normalizeLibraryPage(
      envelope([], { total: 10, returned: 0, page: 0, page_size: 50 }),
      0,
    ),
  );
  assert.throws(() => normalizeLibraryPage(envelope([rawEntry]), 1));
  assert.throws(() =>
    normalizeLibraryPage(
      envelope([{ ...rawEntry, title: "changed format" }]),
      0,
    ),
  );
  assert.equal(
    validQuery({
      subject: "ART&evil",
      catalogNumber: "2000",
      termCode: "1268",
    }),
    false,
  );
  assert.equal(validCode("../doc"), false);
});
test("only reads published public components from the expected snapshot", () => {
  const input = documentFixture();
  const c = input.items[0].doc_data.components[0];
  input.items[0].doc_data.components.push(
    {
      ...c,
      component_id: "974e3a66-0083-44d3-8625-ba3c1b9d44d1",
      is_public: false,
      html: "private",
    },
    { ...c, snapshot_id: termId, html: "draft" },
    { ...c, locale: "es-419", html: "other language" },
  );
  const doc = normalizeDocument(input, "example123");
  assert.equal(doc.components.length, 1);
  assert.equal(doc.snapshotId, snapshotId);
  assert.throws(() =>
    normalizeDocument(documentFixture({ is_published: false }), "example123"),
  );
  assert.throws(() =>
    normalizeDocument(documentFixture({ is_working: true }), "example123"),
  );
  assert.throws(() => normalizeDocument(input, "different1"));
  assert.equal(doc.components[0].id, componentId);
});
test("removes executable HTML, Angular attributes, CSS and unsafe links", () => {
  const result = cleanSyllabusHtml(
    '<app-heading><h2 onclick="bad()" style="width:816px">Reading</h2><script>secret()</script><svg><script>bad()</script></svg><iframe src="https://bad.example"></iframe><a href="javascript:alert(1)">bad</a><a href="/en-US/doc/abc123">official</a><p>Safe text</p></app-heading>',
  );
  for (const word of [
    "onclick",
    "style=",
    "script",
    "secret()",
    "<svg",
    "iframe",
    "javascript:",
    "app-heading",
  ])
    assert.equal(result.includes(word), false, word);
  assert.match(result, /https:\/\/osu.simplesyllabus.com\/en-US\/doc\/abc123/);
  assert.match(result, /noopener noreferrer/);
  assert.match(result, /Safe text/);
});
test("extracts exact readable content, headings and reusable categories", () => {
  const doc = normalizeDocument(documentFixture(), "example123"),
    sections = extractSyllabusSections(doc);
  assert.equal(sections[0].category, "grading");
  assert.equal(sections[0].title, "Grading");
  assert.match(sections[0].text, /40% & essays: 60%/);
  assert.equal(
    syllabusText("<table><tr><td>Week 1</td><td>Intro</td></tr></table>"),
    "Week 1\nIntro",
  );
});
