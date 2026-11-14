import assert from "node:assert/strict";
import test from "node:test";
import {
  syllabusAssetKind,
  syllabusAssetMime,
  readSyllabusAssetBytes,
} from "../../src/lib/syllabus/asset-policy.ts";

test("relay accepts only fixed public OSU image and BUX font paths", () => {
  assert.equal(
    syllabusAssetKind(
      "https://osu.simplesyllabus.com/ui/account-image/599fa2fe-1930-4572-84b1-565ca4085b56",
    ),
    "image",
  );
  assert.equal(
    syllabusAssetKind(
      "https://assets.bux.osu.edu/bux-webfonts2/BuckeyeSans/BuckeyeSans2-Regular.woff2",
    ),
    "font",
  );
  for (const url of [
    "http://localhost/foo",
    "https://osu.simplesyllabus.com/api2/doc-full-page-get?code=a",
    "https://osu.simplesyllabus.com.evil.test/ui/account-image/599fa2fe-1930-4572-84b1-565ca4085b56",
    "https://user:pass@osu.simplesyllabus.com/ui/account-image/599fa2fe-1930-4572-84b1-565ca4085b56",
    "https://assets.bux.osu.edu/bux-webfonts2/evil.woff2",
    "https://bux-fonts.s3.us-east-1.amazonaws.com/bux-webfonts2/BuckeyeSans/BuckeyeSans2-Regular.woff2",
  ])
    assert.equal(syllabusAssetKind(url), null);
});
test("does not relay HTML or SVG as image/font and bounds streamed bytes", async () => {
  const encoder = new TextEncoder();
  assert.equal(
    syllabusAssetMime(encoder.encode("<html>Denied</html>"), "image"),
    null,
  );
  assert.equal(syllabusAssetMime(encoder.encode("<svg></svg>"), "image"), null);
  assert.equal(
    syllabusAssetMime(encoder.encode("wOF2..."), "font"),
    "font/woff2",
  );
  assert.equal(
    syllabusAssetMime(Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10), "image"),
    "image/png",
  );
  await assert.rejects(readSyllabusAssetBytes(new Response("12345"), 4));
  await assert.rejects(
    readSyllabusAssetBytes(new Response("x", { status: 403 }), 10),
  );
  assert.equal(
    (await readSyllabusAssetBytes(new Response("1234"), 4)).length,
    4,
  );
});
