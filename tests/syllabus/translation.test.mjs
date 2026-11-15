import { test } from "node:test";
import assert from "node:assert/strict";
import {
  translateSyllabus,
  splitSyllabusText,
} from "../../src/lib/syllabus/translation.ts";
test("translation chunks preserve Unicode without splitting surrogate pairs or dropping content", () => {
  const source = "Detailed课程内容😀".repeat(800);
  const parts = splitSyllabusText(source);
  assert.equal(parts.join(""), source);
  assert.ok(parts.every((x) => x.length <= 3800));
  assert.ok(parts.every((x) => !/[\uD800-\uDBFF]$/.test(x)));
});

test("translated syllabi preserve links, tables and component identities while escaping provider markup", async () => {
  const source = {
    entry: { code: "test" },
    snapshotId: "original",
    modifiedAt: null,
    components: [
      {
        id: "overview",
        type: "text",
        order: 1,
        locale: "en",
        html: "<p>Fallback</p>",
        officialHtml:
          '<p>Read <a href="https://osu.edu/">official material</a><img src="https://example.invalid/image.png" alt="Diagram"></p><table><tr><td><p>Assessment details</p></td></tr></table><div>Standalone note</div>',
      },
    ],
  };
  const original = JSON.stringify(source);
  const seen = [];
  const translate = async (text) => {
    seen.push(text);
    return "译文 <script>bad()</script> " + text;
  };
  const replaced = await translateSyllabus(source, translate, {
    mode: "replace",
    target: "zh-CN",
    signal: new AbortController().signal,
  });
  assert.equal(JSON.stringify(source), original);
  assert.equal(replaced.components[0].id, "overview");
  assert.match(replaced.components[0].html, /<table>/);
  assert.match(replaced.components[0].html, /href="https:\/\/osu.edu\/"/);
  assert.match(replaced.components[0].html, /<img /);
  assert.ok(!replaced.components[0].html.includes("<script>bad()"));
  assert.ok(replaced.components[0].html.includes("&lt;script&gt;"));
  assert.ok(seen.includes("Read official material"));
  assert.ok(seen.includes("Standalone note"));
  const bilingual = await translateSyllabus(source, async () => "中文翻译", {
    mode: "bilingual",
    target: "zh-CN",
    signal: new AbortController().signal,
  });
  assert.match(bilingual.components[0].html, /Read <a/);
  assert.match(bilingual.components[0].html, /中文翻译/);
  assert.deepEqual(bilingual.translation, {
    mode: "bilingual",
    target: "zh-CN",
  });
});
test("syllabus translation aborts without publishing a partial document", async () => {
  const c = new AbortController();
  const source = {
    components: [
      { id: "x", html: "<p>First paragraph</p><p>Second paragraph</p>" },
    ],
  };
  await assert.rejects(
    translateSyllabus(
      source,
      async () => {
        c.abort();
        return "译文";
      },
      { mode: "replace", target: "zh-CN", signal: c.signal },
    ),
    (e) => e.name === "AbortError",
  );
  assert.equal(
    source.components[0].html,
    "<p>First paragraph</p><p>Second paragraph</p>",
  );
});
