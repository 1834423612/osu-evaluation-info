import { test } from "node:test";
import assert from "node:assert/strict";
import { syntheticPdf } from "./synthetic-pdf.mjs";
import { parsePlanLines } from "../../src/lib/planning/parser.ts";
test("PDF.js extracts a generated PDF without retaining identity in the plan", async () => {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(syntheticPdf()),
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const lines = content.items
      .filter((x) => "str" in x)
      .map((x) => ({ text: x.str, page: 1 }));
    const { plan } = parsePlanLines(lines, "student-plan");
    assert.equal(plan.semesters[0].courses[0].subject, "CSE");
    assert.equal(plan.semesters[0].reportedCredits, 13);
    assert.equal(plan.appliedVersion, "AU2017");
    assert.doesNotMatch(JSON.stringify(plan), /Synthetic|Private/);
  } finally {
    await task.destroy();
  }
});
