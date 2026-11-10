import assert from "node:assert/strict";
import test from "node:test";
import {
  cloudFontSize,
  cloudWordAngle,
  packWordCloud,
  CLOUD_COLORS,
} from "../../src/lib/rmp/word-cloud.ts";

test("word weights determine a visible font hierarchy and every supported word has its own color", () => {
  const counts = [100, 50, 10, 1];
  const sizes = counts.map((count) => cloudFontSize(count, counts));
  for (let i = 1; i < sizes.length; i++) assert(sizes[i - 1] > sizes[i]);
  assert(sizes[0] - sizes.at(-1) >= 16);
  assert.equal(new Set(CLOUD_COLORS).size, 12);
  assert.equal(cloudFontSize(5, [5, 5]), cloudFontSize(5, [5, 5]));
});
test("seeded clouds preserve every word and avoid overlaps or clipping across widths and translated lengths", () => {
  for (const width of [210, 254, 324, 610, 900]) {
    for (const translated of [false, true]) {
      const boxes = Array.from({ length: 12 }, (_, i) => ({
        id: `course:review-tag-${i}`,
        width: Math.min(width - 20, (translated ? 24 : 36) + (12 - i) * 11),
        height: i === 11 ? 45 : 20 + (12 - i),
        angle: cloudWordAngle(`review-tag-${i}`, i),
      }));
      const layout = packWordCloud(boxes, width);
      assert.deepEqual(layout, packWordCloud(boxes, width));
      assert.equal(layout.words.length, boxes.length);
      const bounds = layout.words.map((word) => {
        const angle = (word.angle * Math.PI) / 180;
        const w =
          Math.abs(word.width * Math.cos(angle)) +
          Math.abs(word.height * Math.sin(angle));
        const h =
          Math.abs(word.width * Math.sin(angle)) +
          Math.abs(word.height * Math.cos(angle));
        return {
          left: word.x - w / 2,
          right: word.x + w / 2,
          top: word.y - h / 2,
          bottom: word.y + h / 2,
        };
      });
      bounds.forEach((a, i) => {
        assert(
          a.left >= 0 &&
            a.right <= width &&
            a.top >= 0 &&
            a.bottom <= layout.height,
        );
        bounds
          .slice(i + 1)
          .forEach((b) =>
            assert(
              a.right <= b.left ||
                b.right <= a.left ||
                a.bottom <= b.top ||
                b.bottom <= a.top,
            ),
          );
      });
      assert(
        new Set(layout.words.map((word) => Math.round(word.x))).size > 3,
        "words scatter across horizontal positions",
      );
    }
  }
});
