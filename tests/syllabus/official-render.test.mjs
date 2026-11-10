import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  cleanOfficialSyllabusHtml,
  officialSyllabusFrame,
} from "../../src/lib/syllabus/official-render.ts";
import { normalizeDocument } from "../../src/lib/syllabus/normalize.ts";
import { documentFixture } from "./fixtures.mjs";

test("keeps published layout classes, typography, table widths and image sources", () => {
  const html = cleanOfficialSyllabusHtml(
    '<app-form-editor style="display:block"><div class="fr-view"><p><img src="/ui/account-image/example" alt="The Ohio State University" style="width:300px"></p><h2 class="component-name app-name-view">Schedule</h2><table style="width:100%"><tr><td style="width:10.5%;text-align:left">Week</td><td>Topic</td></tr></table></div></app-form-editor>',
  );
  assert.match(html, /class="fr-view"/);
  assert.match(html, /width:300px/);
  assert.match(html, /width:10.5%/);
  assert.match(
    html,
    /https:\/\/osu.simplesyllabus.com\/ui\/account-image\/example/,
  );
  assert.match(html, /app-form-editor/);
});
test("removes executable markup and CSS that could affect the embedding page", () => {
  const html = cleanOfficialSyllabusHtml(
    '<div onclick="evil()" style="position:fixed;z-index:99999;background-image:url(https://bad.example);width:100%;color:#242526"><script>evil()</script><form action="https://bad.example"><input name="secret"></form><a href="javascript:evil()">link</a><img src="javascript:evil()"><p>Safe</p></div>',
  );
  for (const word of [
    "onclick",
    "position",
    "z-index",
    "background-image",
    "<script",
    "<form",
    "<input",
    "javascript:",
  ])
    assert.equal(html.includes(word), false, word);
  assert.match(html, /width:100%/);
  assert.match(html, /color:#242526/);
});
test("isolated published document carries only local styles and restrictive CSP", async () => {
  const doc = normalizeDocument(documentFixture(), "example123"),
    html = officialSyllabusFrame(doc.components, "zh");
  assert.match(html, /style-src 'self' 'unsafe-inline'/);
  assert.match(html, /default-src 'none'/);
  assert.match(html, /\/syllabus\/official.css/);
  assert.equal(html.includes("<script"), false);
  const css = await readFile(
    new URL("../../public/syllabus/official.css", import.meta.url),
    "utf8",
  );
  assert.match(css, /BuckeyeSans2-Regular.woff2/);
  assert.match(css, /BuckeyeSerif2-Black.woff2/);
  assert.match(css, /width: 816px/);
});
