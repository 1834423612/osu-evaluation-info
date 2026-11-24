import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createPlanningCatalog,
  catalogDetailUrl,
  planningCredits,
  prerequisiteText,
  prerequisiteReferences,
} from "../../src/lib/planning/course-catalog.ts";

test("planning metadata requests whitelist public identifiers and share duplicate reads", async () => {
  let calls = 0;
  const reader = createPlanningCatalog(async (url) => {
    calls++;
    assert.equal(new URL(url, "https://local.test").searchParams.size, 4);
    return Response.json({
      course: {
        subject: "CSE",
        catalogNumber: "2998",
        creditsMin: 3,
        creditsMax: 3,
      },
      sourceMode: "mirror",
    });
  });
  const query = {
    subject: "CSE",
    number: "2998",
    term: "1272",
    campus: "COL",
    studentId: "PRIVATE_SENTINEL",
  };
  const controller = new AbortController();
  const [a, b] = await Promise.all([
    reader.read(query, controller.signal),
    reader.read(query, controller.signal),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  assert.equal(a.sourceMode, "mirror");
  assert.doesNotMatch(catalogDetailUrl(query), /PRIVATE_SENTINEL|student/);
  assert.throws(() =>
    catalogDetailUrl({ ...query, number: "2998&student=secret" }),
  );
});

test("catalog estimates preserve variable credits and original PDF facts", () => {
  const course = { kind: "course", credits: 5 };
  assert.deepEqual(
    planningCredits(course, { course: { creditsMin: 1, creditsMax: 6 } }),
    { range: { min: 1, max: 6 }, source: "catalog" },
  );
  assert.equal(course.credits, 5);
  assert.equal(planningCredits(course).source, "record");
  assert.equal(
    prerequisiteText(
      "Some course. Prereq: CSE 2221; and Math 1151, or permission.",
    ),
    "Prereq: CSE 2221; and Math 1151, or permission.",
  );
  assert.equal(prerequisiteText("Introductory course."), null);
});

test("mismatched course responses cannot fill a planning card", async () => {
  const reader = createPlanningCatalog(async () =>
    Response.json({
      course: {
        subject: "CSE",
        catalogNumber: "2999",
        creditsMin: 3,
        creditsMax: 3,
      },
    }),
  );
  await assert.rejects(
    reader.read(
      { subject: "CSE", number: "2998", term: "", campus: "COL" },
      new AbortController().signal,
    ),
  );
});

test("prerequisite navigation inherits subject prefixes and excludes restriction prose", () => {
  const result = prerequisiteReferences(
    "Prereq: 1212, 1221, Engr 1281.01H, 1281.02H, or CSE Placement Level A. Prereq or concur: Math 1151, 1161.01, or 1161.02. Not open to students with credit for 5022.",
    "CSE",
    [
      { code: "CSE", title: "Computer Science and Engineering" },
      { code: "ENGR", title: "Engineering" },
      { code: "MATH", title: "Mathematics" },
    ],
  );
  assert.deepEqual(
    result.map((c) => c.subject + " " + c.number),
    [
      "CSE 1212",
      "CSE 1221",
      "ENGR 1281.01H",
      "ENGR 1281.02H",
      "MATH 1151",
      "MATH 1161.01",
      "MATH 1161.02",
    ],
  );
});

test("failed planning metadata retries while successful course reads stay cached", async () => {
  const calls = [];
  let unavailable = true;
  const reader = createPlanningCatalog(async (url) => {
    const number = new URL(url, "https://local.test").searchParams.get(
      "catalog",
    );
    calls.push(number);
    if (number === "4444" && unavailable)
      return new Response(null, { status: 503 });
    return Response.json({
      course: {
        subject: "CSE",
        catalogNumber: number,
        creditsMin: 3,
        creditsMax: 3,
      },
    });
  });
  const query = (number) => ({
    subject: "CSE",
    number,
    term: "1272",
    campus: "COL",
  });
  const signal = new AbortController().signal;
  await reader.read(query("1111"), signal);
  await assert.rejects(reader.read(query("4444"), signal));
  unavailable = false;
  const [cached, retried] = await Promise.all([
    reader.read(query("1111"), signal),
    reader.read(query("4444"), signal),
  ]);
  assert.equal(cached.course.catalogNumber, "1111");
  assert.equal(retried.course.catalogNumber, "4444");
  assert.deepEqual(calls, ["1111", "4444", "4444"]);
});
