import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCourseQuery,
  matchesCourseQuery,
} from "../../src/lib/catalog/course-query.ts";
import { createIndexedCatalogSearch } from "../../src/lib/search/client.ts";
const course = {
  subject: "CSE",
  catalogNumber: "2221",
  title: "Software I",
  description:
    "Uses MATH 1151 in examples. Prereq: CSE 1223 or CSE 1222. Not open to students with credit for 2231.",
  sections: [{ instructors: [{ name: "Jane Smith" }] }],
};
test("field filters combine with plain keywords and preserve decimal identifiers", () => {
  const query = parseCourseQuery(
    'software prereq:"CSE 1223" instructor:"Jane Smith"',
  );
  assert.equal(query.text, "software");
  assert.equal(query.filters.length, 2);
  assert.equal(matchesCourseQuery(course, query), true);
  assert.equal(
    matchesCourseQuery(course, parseCourseQuery('prereq:"MATH 1151"')),
    false,
  );
  assert.equal(
    matchesCourseQuery(
      { ...course, description: "Prereq: MATH 1151.01 or 1152." },
      parseCourseQuery('prereq:"MATH 1151.02"'),
    ),
    false,
  );
  assert.equal(
    matchesCourseQuery(
      { ...course, description: "Prereq: MATH 1151.01 or 1152." },
      parseCourseQuery('prereq:"MATH 1151.01"'),
    ),
    true,
  );
  assert.equal(
    matchesCourseQuery(course, parseCourseQuery('title:"Software I"')),
    true,
  );
});
test("malformed advanced syntax reports errors instead of silently broadening", () => {
  for (const q of ["prereq:", 'prereq:"CSE 1223', "teacher:Jane"])
    assert.throws(() => parseCourseQuery(q), /filter|quote|field/i);
  assert.equal(
    matchesCourseQuery(
      { ...course, description: "MATH 1151 is discussed." },
      parseCourseQuery('prereq:"MATH 1151"'),
    ),
    false,
  );
});
test("advanced filters never fall back to official keyword semantics", async () => {
  let live = 0,
    direct = 0;
  const search = createIndexedCatalogSearch(
    async () => Response.json({}, { status: 503 }),
    async () => {
      live++;
      return {};
    },
    async () => {
      direct++;
      return null;
    },
  );
  await assert.rejects(
    search("/api/catalog?" + new URLSearchParams({ q: 'prereq:"CSE 1223"' })),
    /filter|indexed|archive/i,
  );
  assert.equal(live, 0);
  assert.equal(direct, 0);
});

test("combined prerequisite/corequisite headings share the planner's recognition", () => {
  assert.equal(
    matchesCourseQuery(
      { ...course, description: "Prerequisites and Corequisites: MATH 1151." },
      parseCourseQuery('prereq:"MATH 1151"'),
    ),
    true,
  );
  assert.equal(
    matchesCourseQuery(
      { ...course, description: "Prereq or concur: MATH 1151." },
      parseCourseQuery('prereq:"MATH 1151"'),
    ),
    true,
  );
});

test("an instructor phrase cannot span two different people's names", () => {
  const coTaught = {
    ...course,
    sections: [{ instructors: [{ name: "John Smith" }, { name: "Jane Doe" }] }],
  };
  assert.equal(
    matchesCourseQuery(coTaught, parseCourseQuery('instructor:"Smith Jane"')),
    false,
  );
  assert.equal(
    matchesCourseQuery(coTaught, parseCourseQuery('instructor:"Jane Doe"')),
    true,
  );
});
