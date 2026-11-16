import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { collectionIcons } from "../../src/lib/saved/collection-icons.ts";
import {
  collectionIconCatalog,
  collectionIconCategories,
  collectionIconData,
  findCollectionIcons,
} from "../../src/lib/saved/collection-icon-catalog.ts";
import { collectionSchema } from "../../src/lib/saved/collection-schema.ts";

test("all bundled icons retain valid identities and localized category metadata", () => {
  assert.ok(collectionIcons.length >= 99);
  assert.equal(
    new Set(collectionIcons.map((icon) => icon.id)).size,
    collectionIcons.length,
  );
  assert.equal(collectionIconCatalog.length, collectionIcons.length);
  for (const icon of collectionIconCatalog) {
    assert.match(icon.zh, /[\u3400-\u9fff]/);
    assert.ok(
      collectionIconCategories.some(
        (category) => category.id === icon.category,
      ),
    );
    assert.ok(
      collectionSchema.safeParse({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Test",
        icon: icon.id,
        tags: [],
        members: [],
      }).success,
    );
    assert.ok(icon.body.length > 0);
    assert.doesNotMatch(icon.body, /<script|https?:|onload|onclick/i);
  }
});
test("local search accepts Chinese, English, category aliases and whitespace", () => {
  assert.ok(
    findCollectionIcons("书").some((icon) => icon.id === "lucide:book-open"),
  );
  assert.ok(
    findCollectionIcons(" LAB ").some(
      (icon) => icon.id === "lucide:flask-conical",
    ),
  );
  assert.ok(
    findCollectionIcons("机器人").some((icon) => icon.id === "lucide:bot"),
  );
  assert.ok(
    findCollectionIcons("", "tech").every((icon) => icon.category === "tech"),
  );
  assert.equal(findCollectionIcons("not-an-icon-123").length, 0);
  assert.equal(findCollectionIcons("   ").length, collectionIcons.length);
});
test("line icons explicitly retain Lucide strokes instead of default filled silhouettes", () => {
  for (const icon of collectionIcons) {
    const data = collectionIconData(icon.id);
    assert.match(
      data.body,
      /^<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">/,
    );
    assert.equal(data.width, 24);
    assert.equal(data.height, 24);
  }
  assert.deepEqual(
    collectionIconData("unknown"),
    collectionIconData("lucide:folder"),
  );
});
test("search does not submit the collection and selection has a non-color cue", () => {
  const picker = readFileSync(
    new URL(
      "../../src/components/saved/collection-icon-picker.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(picker, /event.key === "Enter"/);
  assert.match(picker, /event.preventDefault\(\)/);
  assert.match(picker, /aria-pressed=/);
  assert.match(picker, /<Check/);
  assert.doesNotMatch(picker, /fetch\(|https?:\/\//);
});
