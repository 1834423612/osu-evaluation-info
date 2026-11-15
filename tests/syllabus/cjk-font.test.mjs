import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import decompress from "woff2-encoder/decompress";
test("the locally bundled PDF font has real Chinese glyphs and retains its OFL license", async () => {
  const require = createRequire(import.meta.url),
    pdfmakeRequire = createRequire(require.resolve("pdfmake")),
    pdfkitRequire = createRequire(pdfmakeRequire.resolve("pdfkit"));
  const fontkit = pdfkitRequire("fontkit");
  const asset = readFileSync("public/fonts/noto-sans-sc-regular.woff2");
  assert.ok(asset.length < 8_000_000);
  const bytes = await decompress(asset),
    font = fontkit.create(Buffer.from(bytes));
  for (const char of "课程大纲双语对照学分教师邮箱验证码隐私安全")
    assert.ok(
      font.hasGlyphForCodePoint(char.codePointAt(0)),
      "Missing CJK glyph: " + char,
    );
  assert.match(
    readFileSync("public/fonts/OFL-NotoSansSC.txt", "utf8"),
    /SIL Open Font License/,
  );
});
