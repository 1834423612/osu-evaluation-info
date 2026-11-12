import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeSyllabusPdfLinks,
  syllabusPdfColor,
} from "../../src/lib/syllabus/pdf-content.ts";
test("official gray heading rules keep their browser color in PDF canvas", () => {
  assert.equal(syllabusPdfColor("rgb(223, 225, 229)"), "#dfe1e5");
  assert.equal(syllabusPdfColor("#ba0c2f"), "#ba0c2f");
});

test("links and underlines stop at visible text and never annotate the container or padding", () => {
  const node = {
    link: "https://osu.edu",
    decoration: ["underline", []],
    stack: [{ text: "  Official link     " }, { text: "   \n " }],
  };
  normalizeSyllabusPdfLinks(node);
  assert.equal(node.link, undefined);
  assert.equal(node.decoration, undefined);
  assert.deepEqual(node.stack[0].text, [
    { text: "  " },
    {
      text: "Official link",
      link: "https://osu.edu",
      decoration: ["underline"],
    },
    { text: "     " },
  ]);
  assert.equal(node.stack[1].link, undefined);
  assert.equal(node.stack[1].decoration, undefined);
});
test("nested linked formatting preserves typography, separate destinations and ordinary text", () => {
  const node = {
    text: [
      { text: "Bold", bold: true },
      { text: " and " },
      { text: "Other", link: "mailto:teacher@osu.edu" },
    ],
    link: "https://osu.edu",
    font: "Buckeye",
    color: "#ba0c2f",
    decoration: "underline",
  };
  normalizeSyllabusPdfLinks(node);
  assert.equal(node.font, "Buckeye");
  assert.equal(node.text[0].bold, true);
  assert.equal(node.text[0].text[0].link, "https://osu.edu");
  assert.equal(node.text[0].text[0].font, "Buckeye");
  assert.equal(node.text[0].text[0].color, "#ba0c2f");
  assert.equal(node.text[0].text[0].bold, true);
  assert.equal(node.text[2].text[0].link, "mailto:teacher@osu.edu");
  const paragraph = { text: "  Ordinary text  ", fontSize: 12 };
  normalizeSyllabusPdfLinks(paragraph);
  assert.deepEqual(paragraph, { text: "  Ordinary text  ", fontSize: 12 });
});
test("linked images retain an annotation on the image rather than its parent container", () => {
  const value = {
    link: "https://osu.edu",
    stack: [{ image: "data:image/png;base64,example", width: 225 }],
  };
  normalizeSyllabusPdfLinks(value);
  assert.equal(value.link, undefined);
  assert.equal(value.stack[0].link, "https://osu.edu");
});
