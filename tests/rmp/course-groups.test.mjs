import assert from "node:assert/strict";
import test from "node:test";
import { groupCourseRmp } from "../../src/lib/rmp/course-groups.ts";
const profile = (id, name, username = null, association = "unconfirmed") => ({
  professorId: id,
  name,
  nameDotNumber: username,
  association,
  reviewCount: 4,
  recentQuality: 4,
});
const course = {
  sections: [
    {
      instructors: [
        { name: "Current Teacher", email: "teacher.1@osu.edu" },
        { name: "Foster, Paméla", email: "foster.2@osu.edu" },
      ],
    },
  ],
  evaluation: { instructors: [{ nameDotNumber: "history.1" }] },
};
test("current sections determine the group, not historical evaluations or the date of a review", () => {
  const current = profile("c", "Changed Name", "teacher.1", "verified");
  const nameLead = profile("n", "Pamela Foster");
  const past = profile("h", "Historical Teacher", "history.1", "verified");
  const groups = groupCourseRmp(
    [
      current,
      nameLead,
      past,
      { ...current, professorId: "empty", reviewCount: 0 },
    ],
    course,
  );
  assert.deepEqual(
    groups.current.map((p) => p.professorId),
    ["c", "n"],
  );
  assert.deepEqual(
    groups.history.map((p) => p.professorId),
    ["h"],
  );
  assert.equal(nameLead.association, "unconfirmed");
  assert.equal(nameLead.recentQuality, 4);
});
test("same names cannot override a conflicting known account or ambiguous official identities", () => {
  const same = profile("x", "Current Teacher", "other.1");
  assert.equal(groupCourseRmp([same], course).current.length, 0);
  const ambiguous = {
    sections: [
      {
        instructors: [
          { name: "Alex Teacher", email: "teacher.1@osu.edu" },
          { name: "Alex Teacher", email: "teacher.2@osu.edu" },
        ],
      },
    ],
  };
  assert.equal(
    groupCourseRmp([profile("a", "Alex Teacher")], ambiguous).current.length,
    0,
  );
});
test("unavailable or refreshed rosters keep every profile and recompute grouping without changing scores", () => {
  const p = profile("p", "Pamela Foster");
  assert.deepEqual(groupCourseRmp([p], { sections: [] }), {
    current: [],
    history: [p],
  });
  assert.equal(groupCourseRmp([p], course).current[0], p);
});

test("repeated roster entries without an email do not make one known teacher ambiguous", () => {
  const roster = {
    sections: [
      {
        instructors: [
          { name: "Pamela Foster", email: "foster.2@osu.edu" },
          { name: "Pamela Foster", email: null },
        ],
      },
    ],
  };
  assert.equal(
    groupCourseRmp([profile("p", "Pamela Foster")], roster).current.length,
    1,
  );
});
