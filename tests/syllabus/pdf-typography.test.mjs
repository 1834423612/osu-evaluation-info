import assert from "node:assert/strict";
import test from "node:test";
import { pdfFontHeightRatio } from "../../src/lib/syllabus/pdf-typography.ts";

test("CSS line height compensates for the actual embedded font ascent and descent", () => {
  const bytes = new Uint8Array(100);
  const view = new DataView(bytes.buffer);
  view.setUint16(4, 2);
  bytes.set(new TextEncoder().encode("head"), 12);
  view.setUint32(20, 44);
  bytes.set(new TextEncoder().encode("hhea"), 28);
  view.setUint32(36, 68);
  view.setUint16(62, 1000);
  view.setInt16(72, 1000);
  view.setInt16(74, -300);
  assert.equal(pdfFontHeightRatio(bytes), 1.3);
  const cssEm = 1.5;
  assert.equal(12 * 1.3 * (cssEm / pdfFontHeightRatio(bytes)), 18);
  assert.throws(() => pdfFontHeightRatio(new Uint8Array(3)), /Invalid/);
});
