import assert from "node:assert/strict";
import test from "node:test";
import { createDetailRefresh } from "../../src/lib/catalog/detail-refresh.ts";
const flush = () => new Promise((resolve) => setImmediate(resolve));
const course = () => ({
  id: "course",
  courseId: "151332",
  availability: { source: "official", fetchedAt: new Date().toISOString() },
  sections: [
    {
      classNumber: "1",
      enrollmentStatus: "Open",
      enrollmentTotal: 777,
      waitlistTotal: 3,
    },
  ],
});

test("course metadata loads once, retains identifiers and never validates search placeholders", async () => {
  let calls = 0;
  const updates = [];
  const engine = createDetailRefresh({
    course: course(),
    url: "/api/catalog/course",
    onUpdate: (s) => updates.push(s),
    fetcher: async (_url, options) => {
      calls++;
      assert.equal(options.cache, "no-store");
      return Response.json({ course: course(), sourceMode: "official" });
    },
  });
  engine.start();
  engine.start();
  await flush();
  assert.equal(calls, 1);
  assert.equal(updates.at(-1).course.courseId, "151332");
  assert.equal(updates.at(-1).course.sections[0].enrollmentTotal, null);
  assert.equal(updates.at(-1).course.availability.source, "unavailable");
  await engine.refresh();
  assert.equal(calls, 2);
  engine.stop();
  await engine.refresh();
  assert.equal(calls, 2);
});

test("metadata failure is reported separately from per-section seat checks", async () => {
  const updates = [];
  const engine = createDetailRefresh({
    course: course(),
    url: "/api/catalog/course",
    onUpdate: (s) => updates.push(s),
    fetcher: async () => new Response("Unavailable", { status: 503 }),
  });
  engine.start();
  await flush();
  assert.equal(updates.at(-1).error, true);
  assert.equal(updates.at(-1).course.sections[0].enrollmentTotal, null);
  engine.stop();
});

test("closing aborts metadata and a late response cannot replace another course", async () => {
  let finish, signal;
  const updates = [];
  const engine = createDetailRefresh({
    course: course(),
    url: "/api/catalog/course",
    onUpdate: (s) => updates.push(s),
    fetcher: (_url, options) => {
      signal = options.signal;
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  engine.start();
  await flush();
  const count = updates.length;
  engine.stop();
  assert.equal(signal.aborted, true);
  finish(Response.json({ course: course(), sourceMode: "official" }));
  await flush();
  assert.equal(updates.length, count);
});
