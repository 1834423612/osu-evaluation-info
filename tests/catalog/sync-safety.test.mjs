import assert from "node:assert/strict";
import { it } from "node:test";
import { discoverPlan, samePlan } from "../../scripts/catalog/plan.mjs";
import { preparePage } from "../../scripts/catalog/rows.mjs";
import {
  fetchOfficialJson,
  actualCount,
  searchableTerms,
} from "../../scripts/catalog/upstream.mjs";

const term = { strm: "1272", descr: "Spring" };
const partition = {
  query: { term: "1272", subject: "math" },
  partition_key: "term=1272&subject=math",
  expected_sections: 2,
};
function fixture() {
  return {
    totalItems: 2,
    totalPages: 1,
    filters: [],
    courses: [
      {
        course: {
          courseId: "1",
          subject: "MATH",
          catalogNumber: "1151",
          title: "Calculus",
          enrollmentTotal: 9,
        },
        sections: [1, 2].map((i) => ({
          termCode: "1272",
          classNumber: String(i),
          courseId: "1",
          courseOfferingNumber: "1",
          secCampus: "COL",
          enrollmentTotal: 4,
        })),
      },
    ],
  };
}

it("derives missing course offering/campus from official sections and strips volatile metadata", () => {
  const page = preparePage(fixture(), partition, 1);
  assert.equal(page.courses[0].offering_number, "1");
  assert.equal(page.courses[0].data.campusCode, "COL");
  assert.ok(!("enrollmentTotal" in page.courses[0].data));
  assert.ok(!("enrollmentTotal" in page.sections[0].data));
});
it("builds a separate parent for each official offering and campus", () => {
  const data = fixture();
  data.courses[0].sections[1].courseOfferingNumber = "2";
  data.courses[0].sections[1].secCampus = "MNS";
  const page = preparePage(data, partition, 1);
  assert.equal(page.courses.length, 2);
  for (const section of page.sections)
    assert.ok(
      page.courses.some(
        (c) =>
          c.offering_number === section.offering_number &&
          c.campus_code === section.campus_code,
      ),
    );
});
it("rejects absent keys, wrong terms/subjects, and disagreement before any write", () => {
  for (const alter of [
    (d) => delete d.courses[0].sections[0].classNumber,
    (d) => delete d.courses[0].sections[0].courseOfferingNumber,
    (d) => (d.courses[0].sections[0].courseId = "2"),
    (d) => (d.courses[0].sections[0].termCode = "1268"),
    (d) => (d.courses[0].course.subject = "PHYSICS"),
    (d) => (d.courses[0].sections[0].secCampus = "undefined"),
  ]) {
    const data = fixture();
    alter(data);
    assert.throws(
      () => preparePage(data, partition, 1),
      /official|disagree|different/i,
    );
  }
});
it("deduplicates identical hits but refuses conflicting term/class identities", () => {
  const data = fixture();
  data.courses[0].sections[1] = { ...data.courses[0].sections[0] };
  assert.equal(preparePage(data, partition, 1).sections.length, 1);
  data.courses[0].sections[1].courseOfferingNumber = "2";
  assert.throws(() => preparePage(data, partition, 1), /Conflicting/);
});
it("rejects cap/count drift, malformed counts and unexpected empty pages", () => {
  for (const alter of [
    (d) => (d.totalItems = 3),
    (d) => (d.totalItems = 10000),
    (d) => (d.totalItems = -1),
    (d) => (d.totalPages = 0),
    (d) => (d.courses = []),
  ]) {
    const data = fixture();
    alter(data);
    assert.throws(() => preparePage(data, partition, 1));
  }
  assert.throws(() => actualCount({ totalItems: "2", filters: [] }));
  assert.throws(
    () =>
      searchableTerms({
        data: [
          term,
          { ...term, classSearch: "Y" },
          { ...term, classSearch: "Y" },
        ],
      }),
    /duplicate/,
  );
});
it("compares partition keys and individual counts even when totals match", () => {
  const a = { query: { term: "1272", subject: "a" }, expected_sections: 2 },
    b = { query: { term: "1272", subject: "b" }, expected_sections: 2 };
  assert.ok(
    samePlan([a, b], [b, { ...a, query: { subject: "a", term: "1272" } }]),
  );
  assert.ok(
    !samePlan(
      [a, b],
      [
        { ...a, expected_sections: 1 },
        { ...b, expected_sections: 3 },
      ],
    ),
  );
  assert.ok(
    !samePlan([a, b], [a, { ...b, query: { term: "1272", subject: "c" } }]),
  );
  assert.ok(!samePlan([a, a], [a, b]));
});
it("repairs omitted subject facets using cross-term discovery, before building partitions", async () => {
  const other = { strm: "1268", descr: "Autumn" };
  const search = async (q) => ({
    totalItems: q.subject ? 1 : 2,
    filters: [
      {
        slug: "subject",
        items:
          q.term === "1268"
            ? [
                { term: "a", count: 1 },
                { term: "b", count: 1 },
              ]
            : [{ term: "a", count: 1 }],
      },
    ],
  });
  const plan = await discoverPlan([term], [term, other], search);
  assert.equal(plan.expectedTotal, 2);
  assert.equal(plan.partitions.length, 2);
});
it("refuses incomplete discovery and overlapping recursive facets", async () => {
  await assert.rejects(
    discoverPlan([term], [term], async () => ({
      totalItems: 2,
      filters: [{ slug: "subject", items: [{ term: "a", count: 1 }] }],
    })),
    /coverage mismatch/,
  );
  await assert.rejects(
    discoverPlan([term], [term], async (q) => ({
      totalItems: 10000,
      filters: [
        { slug: "subject", items: [{ term: "a", count: 10000 }] },
        {
          slug: "campus",
          items: q.subject ? [{ term: "col", count: 9999 }] : [],
        },
      ],
    })),
    /Incomplete or overlapping/,
  );
});
it("HTTP retries transient errors with bounded Retry-After and does not retry 403", async () => {
  let calls = 0;
  const waits = [];
  const data = await fetchOfficialJson("test", {
    fetcher: async () =>
      ++calls === 1
        ? new Response("", {
            status: 429,
            headers: { "Retry-After": "999999" },
          })
        : Response.json({ data: { ok: true } }),
    wait: async (ms) => waits.push(ms),
  });
  assert.equal(data.ok, true);
  assert.deepEqual(waits, [30000]);
  calls = 0;
  await assert.rejects(
    fetchOfficialJson("test", {
      fetcher: async () => {
        calls++;
        return new Response("", { status: 403 });
      },
      wait: async () => {},
    }),
    /403/,
  );
  assert.equal(calls, 1);
});
it("HTTP bounds transport retries and rejects malformed envelopes", async () => {
  let calls = 0;
  await assert.rejects(
    fetchOfficialJson("test", {
      fetcher: async () => {
        calls++;
        throw new Error("network");
      },
      wait: async () => {},
    }),
    /network/,
  );
  assert.equal(calls, 5);
  calls = 0;
  await assert.rejects(
    fetchOfficialJson("test", {
      fetcher: async () => {
        calls++;
        return Response.json({ data: [] });
      },
      wait: async () => {},
    }),
    /envelope/,
  );
  assert.equal(calls, 1);
});

it("an exhausted overall request budget stops without HTTP retries", async () => {
  const controller = new AbortController();
  controller.abort(new Error("budget exhausted"));
  let calls = 0;
  await assert.rejects(
    fetchOfficialJson("test", {
      signal: controller.signal,
      fetcher: async () => {
        calls++;
        return Response.json({ data: {} });
      },
    }),
    /budget exhausted/,
  );
  assert.equal(calls, 0);
});
