import assert from "node:assert/strict";
import { it } from "node:test";
import { groupSharedItems } from "../../src/lib/saved/share-groups.ts";
import { course, snapshot } from "./fixtures.mjs";

it("places course, section and syllabus under their shared course while keeping teachers separate", () => {
  const input = structuredClone(snapshot.items).reverse();
  const before = structuredClone(input);
  const groups = groupSharedItems(input);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].kind, "course");
  assert.equal(groups[0].label, "MATH 1151");
  assert.equal(groups[0].title, "Calculus I");
  assert.equal(groups[0].termCode, "1268");
  assert.equal(groups[0].campusCode, "COL");
  assert.deepEqual(
    groups[0].items.map((item) => item.kind),
    ["course", "section", "syllabus"],
  );
  assert.equal(groups[1].kind, "instructors");
  assert.equal(groups[1].items[0].payload.name, "Example Teacher");
  assert.deepEqual(input, before);
});

it("separates the same course in different terms and campuses", () => {
  const items = [
    { kind: "course", payload: course },
    {
      kind: "course",
      payload: { ...course, id: "mns", campus: "Mansfield", campusCode: "MNS" },
    },
    {
      kind: "course",
      payload: {
        ...course,
        id: "spring",
        term: "Spring 2027",
        termCode: "1272",
      },
    },
  ];
  const groups = groupSharedItems(items);
  assert.equal(groups.length, 3);
  assert.equal(new Set(groups.map((group) => group.id)).size, 3);
  assert.deepEqual(
    groups.map((group) => [group.termCode, group.campusCode]),
    [
      ["1272", "COL"],
      ["1268", "COL"],
      ["1268", "MNS"],
    ],
  );
});

it("uses explicit parent metadata for a filtered legacy section without adding unselected items", () => {
  const section = structuredClone(snapshot.items[1]);
  delete section.payload.termCode;
  delete section.payload.campusCode;
  const groups = groupSharedItems([section], snapshot.items);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].termCode, "1268");
  assert.equal(groups[0].campusCode, "COL");
  assert.deepEqual(groups[0].items, [section]);
  assert.equal(groups[0].title, course.title);
});

it("does not infer a teacher's identity or course membership from their name", () => {
  const first = structuredClone(snapshot.items[2]);
  const second = structuredClone(first);
  second.payload.id = "unrelated-teacher";
  second.payload.courses = [];
  const groups = groupSharedItems([first, snapshot.items[0], second]);
  assert.equal(groups.length, 2);
  assert.deepEqual(
    groups[1].items.map((item) => item.payload.id),
    ["example.1", "unrelated-teacher"],
  );
  assert.equal(groups[0].items.length, 1);
  assert.equal(groups[1].items[1].payload.courses.length, 0);
});

it("keeps parent-only courses distinct when campus and term context is absent", () => {
  const original = structuredClone(snapshot.items[1]);
  const other = structuredClone(original);
  for (const item of [original, other]) {
    item.payload.term = "";
    item.payload.campus = "";
    delete item.payload.termCode;
    delete item.payload.campusCode;
  }
  other.payload.courseId = "another-parent";
  other.payload.id = "another-parent:12345";
  assert.equal(groupSharedItems([original, other]).length, 2);
});

it("does not borrow missing term codes from a conflicting parent snapshot", () => {
  const section = structuredClone(snapshot.items[1]);
  section.payload.term = "Spring 2027";
  delete section.payload.termCode;
  const groups = groupSharedItems([snapshot.items[0], section]);
  assert.equal(groups.length, 2);
  assert.equal(
    groups.find((group) => group.term === "Spring 2027").termCode,
    undefined,
  );
});
