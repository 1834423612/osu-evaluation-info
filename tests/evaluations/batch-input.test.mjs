import assert from "node:assert/strict";
import test from "node:test";
import {
  parseEvaluationBatch,
  readEvaluationBatch,
} from "../../src/lib/evaluations/batch-input.ts";
const course = {
  id: "1268-ANTHROP-2200-COL",
  subject: "ANTHROP",
  catalogNumber: "2200",
  campusCode: "COL",
  instructors: [{ name: "Fixture", email: "fixture.1@osu.edu" }],
};
test("accepts bounded evaluation identities without carrying official course payloads or seat counts", () => {
  const actual = parseEvaluationBatch({
    courses: [{ ...course, enrollmentTotal: 777, description: "not needed" }],
  });
  assert.deepEqual(actual, [course]);
  assert.throws(() =>
    parseEvaluationBatch({ courses: Array(25).fill(course) }),
  );
  assert.throws(() =>
    parseEvaluationBatch({ courses: [{ ...course, campusCode: "ALL" }] }),
  );
  assert.throws(() =>
    parseEvaluationBatch({ courses: [{ ...course, subject: "bad' OR 1=1" }] }),
  );
  assert.throws(() =>
    parseEvaluationBatch({
      courses: [
        { ...course, instructors: Array(31).fill(course.instructors[0]) },
      ],
    }),
  );
  assert.throws(() =>
    parseEvaluationBatch({
      courses: [
        {
          ...course,
          instructors: [{ name: "Fixture", email: "broken-email" }],
        },
      ],
    }),
  );
});

test("bounds streamed request bytes and preserves multi-byte names across chunks", async () => {
  const text = JSON.stringify({
    courses: [{ ...course, instructors: [{ name: "张老师", email: null }] }],
  });
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < bytes.length) controller.enqueue(bytes.slice(i, (i += 1)));
      else controller.close();
    },
  });
  const parsed = await readEvaluationBatch(
    new Request("http://local/evaluations", {
      method: "POST",
      body,
      duplex: "half",
    }),
  );
  assert.equal(parsed[0].instructors[0].name, "张老师");
  await assert.rejects(
    readEvaluationBatch(
      new Request("http://local/evaluations", {
        method: "POST",
        body: "中".repeat(22000),
      }),
    ),
    /too large/,
  );
  assert.throws(
    () => parseEvaluationBatch({ courses: [course, course] }),
    /Duplicate/,
  );
});
