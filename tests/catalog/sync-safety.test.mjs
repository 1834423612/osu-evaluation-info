import assert from "node:assert/strict";
import { it } from "node:test";
import { discoverPlan, samePlan } from "../../scripts/catalog/plan.mjs";
import { preparePage } from "../../scripts/catalog/rows.mjs";
import { catalogFailure } from "../../scripts/catalog/diagnostics.mjs";
import {
  fetchOfficialJson,
  actualCount,
  searchableTerms,
} from "../../scripts/catalog/upstream.mjs";

const term = { strm: "1272", descr: "Spring" };
it("maintenance errors redact credentials and preserve the failed stage", () => {
  const event = catalogFailure(
    "catalog.sync_failed",
    Object.assign(
      Error(
        "connect postgresql://user:secret@database/db password='hidden'\n::error::untrusted",
      ),
      { code: "ECONNRESET" },
    ),
    { stage: "discovery" },
  );
  assert.equal(event.stage, "discovery");
  assert.equal(event.code, "ECONNRESET");
  assert.ok(!JSON.stringify(event).includes("secret"));
  assert.ok(!JSON.stringify(event).includes("hidden"));
  assert.ok(!event.message.includes("\n"));
});
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

// Minimal, non-personal fields observed at the official endpoint on 2026-11-25.
function mixedIdentity() {
  const data = fixture();
  data.totalItems = 1;
  data.filters = [
    {
      slug: "subject",
      items: [
        {
          term: "airsci",
          title: "Air Force Aerospace Studies",
          count: 1,
          selected: true,
        },
      ],
    },
  ];
  data.courses[0].course = {
    courseId: "165133",
    offeringNumber: "1",
    subject: "KNSFHP",
    subjectDesc: "Kinesiology:Sprt, Ftns & Hlth Pr",
    catalogNumber: "1155.03",
    title: "Physical Fitness Training for the ROTC: Air Force",
  };
  data.courses[0].sections = [
    {
      termCode: "1272",
      classNumber: "14598",
      courseId: "165133",
      courseOfferingNumber: "1",
      secCampus: "COL",
      _parent: "165133-1-1272",
      subject: "Air Force Aerospace Studies",
      subjectDesc: "Air Force Aerospace Studies",
      catalogNumber: "1155.01",
      secCatalogNumber: "1155.01",
    },
  ];
  return data;
}
const airPartition = {
  query: { term: "1272", subject: "airsci" },
  partition_key: "subject=airsci&term=1272",
  expected_sections: 1,
};

it("reconciles an official parent/section mismatch only from verified section and selected-facet evidence", () => {
  const page = preparePage(mixedIdentity(), airPartition, 1);
  assert.equal(page.courses[0].subject, "AIRSCI");
  assert.equal(page.courses[0].catalog_number, "1155.01");
  assert.equal(page.sections[0].subject, "AIRSCI");
  assert.equal(page.courses[0].data.subjectDesc, "Air Force Aerospace Studies");
  assert.deepEqual(page.courses[0].data.officialParentIdentity, {
    subject: "KNSFHP",
    catalogNumber: "1155.03",
    subjectDesc: "Kinesiology:Sprt, Ftns & Hlth Pr",
  });
  assert.equal(page.identityResolutions.length, 1);
  assert.equal(page.identityResolutions[0].path, "courses[0].course");
  assert.equal(page.identityResolutions[0].classNumber, "14598");
});

it("rejects unproven subject reconciliation with the exact record and expected/actual field", () => {
  for (const alter of [
    (d) => {
      d.filters = [];
    },
    (d) => {
      d.filters[0].items[0].selected = false;
    },
    (d) => {
      d.courses[0].sections[0].subject = "Mathematics";
    },
    (d) => {
      d.courses[0].sections[0].subjectDesc = "Mathematics";
    },
    (d) => {
      d.courses[0].sections[0]._parent = "999-1-1272";
    },
    (d) => {
      d.courses[0].sections[0].secCatalogNumber = "9999";
    },
    (d) => {
      delete d.courses[0].sections[0].catalogNumber;
    },
    (d) => {
      delete d.courses[0].sections[0].courseId;
    },
  ]) {
    const data = mixedIdentity();
    alter(data);
    assert.throws(
      () => preparePage(data, airPartition, 1),
      (error) => {
        assert.ok(error.details?.path, "failure must identify its JSON field");
        assert.ok(Object.hasOwn(error.details, "expected"));
        assert.ok(Object.hasOwn(error.details, "actual"));
        assert.equal(error.details.courseId, "165133");
        assert.equal(error.details.classNumber, "14598");
        return true;
      },
    );
  }
});

it("records missing identity fields and wrong terms without dropping their source location", () => {
  const data = fixture();
  delete data.courses[0].sections[1].classNumber;
  assert.throws(
    () => preparePage(data, partition, 1),
    (error) => {
      assert.equal(error.details?.path, "courses[0].sections[1].classNumber");
      assert.equal(error.details.actual, null);
      const failure = catalogFailure("catalog.sync_failed", error, {
        stage: "snapshot-ingestion",
        page: 1,
      });
      assert.equal(failure.details.path, error.details.path);
      assert.equal(failure.location.file, "scripts/catalog/rows.mjs");
      assert.ok(failure.location.line > 0);
      return true;
    },
  );
});

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
it("ignores null placeholders in the official term list but validates searchable identities", () => {
  assert.deepEqual(
    searchableTerms({ data: [null, { ...term, classSearch: "Y" }, null] }),
    [{ ...term, classSearch: "Y" }],
  );
  assert.throws(
    () => searchableTerms({ data: [null, { classSearch: "Y" }] }),
    /Invalid.*term/,
  );
  assert.throws(() => searchableTerms({ data: [null] }), /No searchable/);
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
it("upstream diagnostics report retries and terminal failures without query text or credentials", async () => {
  const events = [];
  await assert.rejects(
    fetchOfficialJson(
      "search?term=1272&campus=col&subject=psych&q=private-text",
      {
        fetcher: async () => new Response("", { status: 503 }),
        wait: async () => {},
        report: (event) => events.push(event),
      },
    ),
    /503/,
  );
  assert.equal(events.length, 5);
  assert.equal(events[0].event, "catalog.upstream_retry");
  assert.equal(events.at(-1).event, "catalog.upstream_failed");
  assert.equal(events.at(-1).attempt, 5);
  assert.equal(events[0].term, "1272");
  assert.equal(events[0].campus, "col");
  assert.equal(events[0].status, 503);
  assert.ok(!JSON.stringify(events).includes("private-text"));
});

it("terminal HTTP/transport errors retain reproducible safe scope and the underlying cause", async () => {
  for (const fetcher of [
    async () => new Response("private response body", { status: 403 }),
    async () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("DNS lookup failed"), {
          code: "EAI_AGAIN",
        }),
      });
    },
  ]) {
    await assert.rejects(
      fetchOfficialJson(
        "search?term=1272&subject=airsci&p=1&component=lec&q=private-query&token=private-token",
        {
          fetcher,
          wait: async () => {},
          report: () => {},
        },
      ),
      (error) => {
        assert.ok(error.details?.requestUrl.includes("subject=airsci"));
        assert.ok(error.details.requestUrl.includes("component=lec"));
        assert.ok(!JSON.stringify(error.details).includes("private"));
        if (error.details.status === null)
          assert.match(error.details.cause, /EAI_AGAIN.*DNS lookup failed/);
        else assert.equal(error.details.status, 403);
        return true;
      },
    );
  }
});
it("malformed official facet and term entries fail with a classified data error", () => {
  for (const filters of [
    [null],
    [{ slug: "campus", items: [null] }],
    [{ slug: "campus", items: null }],
  ])
    assert.throws(
      () => actualCount({ totalItems: 10, filters }),
      (error) => error.code === "CATALOG_DATA_INVALID",
    );
  assert.throws(
    () => searchableTerms({ data: [42, { ...term, classSearch: "Y" }] }),
    (error) => error.code === "CATALOG_DATA_INVALID",
  );
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
