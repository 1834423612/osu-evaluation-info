import test from "node:test";
import assert from "node:assert/strict";
import {
  teacherOfficialMetrics,
  teacherScoreTone,
} from "../../src/lib/syllabus/teacher-data.ts";

test("teacher ratings require exact OSU identities and never mix instruments or people", () => {
  const person = { name: "Same Name", email: "teacher.1@osu.edu" };
  const SEI = { instrument: "SEI", score: 4.2 },
    SSLE = { instrument: "SSLE", score: 3.1 };
  const summary = {
    instructors: [
      {
        name: "Same Name",
        nameDotNumber: "other.2",
        match: "exact-email",
        metrics: [{ instrument: "SEI", score: 5 }],
      },
      {
        nameDotNumber: "teacher.1",
        match: "exact-email",
        metrics: [SEI, SSLE],
      },
    ],
  };
  assert.deepEqual(teacherOfficialMetrics(summary, person), { SEI, SSLE });
  assert.deepEqual(
    teacherOfficialMetrics(summary, { ...person, email: null }),
    { SEI: null, SSLE: null },
  );
  assert.deepEqual(
    teacherOfficialMetrics(
      {
        instructors: [
          { nameDotNumber: "teacher.1", match: "unmatched", metrics: [SEI] },
        ],
      },
      person,
    ),
    { SEI: null, SSLE: null },
  );
});
test("score colors preserve unknown values and use the actual five-point scale", () => {
  for (const value of [null, undefined, NaN, 0, 6])
    assert.equal(teacherScoreTone(value), "unknown");
  assert.equal(teacherScoreTone(2.9), "caution");
  assert.equal(teacherScoreTone(3.8), "mixed");
  assert.equal(teacherScoreTone(4.5), "positive");
});
