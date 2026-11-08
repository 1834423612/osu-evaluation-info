import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogTransport } from "../../src/lib/catalog/browser-transport.ts";
import { officialEndpointPlan } from "../../src/lib/catalog/official-endpoints.ts";
const item = {
  course: {
    courseId: "151332",
    offeringNumber: "1",
    subject: "ANTHROP",
    catalogNumber: "2200",
    title: "Biological Anthropology",
    campusCode: "COL",
    minUnits: 4,
    maxUnits: 4,
  },
  sections: [
    {
      classNumber: "15047",
      section: "0040",
      termCode: "1268",
      sessionCode: "1",
      courseOfferingNumber: 1,
      enrollmentTotal: 777,
      enrollmentStatus: "Open",
      meetings: [],
    },
  ],
};
function fixture() {
  const seen = [];
  const transport = createCatalogTransport(async (input, options = {}) => {
    const url = String(input);
    seen.push({ url, options });
    if (url === "/api/evaluations")
      return Response.json({
        summaries: {
          "1268-ANTHROP-2200-COL": {
            status: "available",
            marker: "local database",
          },
        },
      });
    if (url.startsWith("/api/catalog")) {
      const resource =
        url === "/api/catalog/course"
          ? "course"
          : url === "/api/catalog/facets"
            ? "facets"
            : "catalog";
      return Response.json(officialEndpointPlan(resource));
    }
    if (url.includes("searchableTermsV2"))
      return Response.json({
        data: {
          data: [{ classSearch: "Y", strm: "1268", descr: "Autumn 2026" }],
        },
      });
    return Response.json({
      data: { courses: [item], totalPages: 1, totalItems: 1, filters: [] },
    });
  });
  return { transport, seen };
}
test("normalizes direct search data and enriches it only from the local evaluation database", async () => {
  const { transport, seen } = fixture();
  const response = await transport.request(
    "/api/catalog?q=ANTHROP2200&term=1268&campus=col",
  );
  const result = await response.json();
  assert.equal(result.courses[0].courseId, "151332");
  assert.equal(result.courses[0].creditsMin, 4);
  assert.equal(result.courses[0].sections[0].enrollmentTotal, null);
  assert.equal(result.courses[0].evaluation.marker, "local database");
  assert.equal(result.evaluationStatus, "available");
  assert.deepEqual(
    seen.filter((x) => x.url.startsWith("/api/catalog")).map((x) => x.url),
    ["/api/catalog"],
  );
  const upstream = seen.find((x) => x.url.includes("/classes/search?"));
  const params = new URL(upstream.url).searchParams;
  assert.equal(params.get("q"), "2200");
  assert.equal(params.get("subject"), "anthrop");
  assert.equal(upstream.options.credentials, "omit");
  const batch = seen.find((x) => x.url === "/api/evaluations");
  assert.equal(batch.options.method, "POST");
  assert.ok(!batch.options.body.includes("777"));
  await transport.request("/api/catalog?q=ANTHROP2200&term=1268&campus=col");
  assert.equal(seen.filter((x) => x.url === "/api/catalog").length, 1);
  assert.equal(
    seen.filter((x) => x.url.includes("searchableTermsV2")).length,
    1,
  );
});
test("course and facets discovery use their existing paths, then read official data in the browser", async () => {
  const { transport, seen } = fixture();
  const d = await (
    await transport.request(
      "/api/catalog/course?subject=ANTHROP&catalog=2200&term=1268&campus=COL",
    )
  ).json();
  assert.equal(d.course.courseId, "151332");
  assert.equal(d.course.sections[0].enrollmentTotal, null);
  const f = await (
    await transport.request("/api/catalog/facets?term=1268&campus=all")
  ).json();
  assert.deepEqual(f.filters, []);
  assert.ok(seen.some((x) => x.url === "/api/catalog/course"));
  assert.ok(seen.some((x) => x.url === "/api/catalog/facets"));
});
test("official failure uses only an explicit database snapshot, and text search does not invent a backup", async () => {
  const seen = [];
  const transport = createCatalogTransport(async (input) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("mode=snapshot"))
      return Response.json({ courses: [], sourceMode: "mirror" });
    if (url === "/api/catalog")
      return Response.json(officialEndpointPlan("catalog"));
    return new Response(null, { status: 503 });
  });
  const fallback = await (
    await transport.request("/api/catalog?term=1268")
  ).json();
  assert.equal(fallback.sourceMode, "mirror");
  assert.equal(seen.filter((x) => x.startsWith("/api/catalog?")).length, 1);
  await assert.rejects(
    transport.request("/api/catalog?q=ANTHROP2200&term=1268"),
  );
  assert.equal(seen.filter((x) => x.startsWith("/api/catalog?")).length, 1);
});

test("one cancelled discovery subscriber does not cancel another subscriber or poison cached discovery", async () => {
  let resolvePlan;
  let calls = 0;
  const transport = createCatalogTransport(async () => {
    calls++;
    return new Promise((resolve) => {
      resolvePlan = () =>
        resolve(Response.json(officialEndpointPlan("catalog")));
    });
  });
  const abort = new AbortController();
  const first = transport.discover("catalog", abort.signal);
  const rejection = assert.rejects(first, { name: "AbortError" });
  const second = transport.discover("catalog");
  abort.abort();
  await rejection;
  resolvePlan();
  assert.equal((await second).resource, "catalog");
  assert.equal(calls, 1);
  assert.equal((await transport.discover("catalog")).resource, "catalog");
  assert.equal(calls, 1);
});
