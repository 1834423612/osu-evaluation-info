import assert from "node:assert/strict";
import test from "node:test";
import { createCatalogTransport } from "../../src/lib/catalog/browser-transport.ts";
import {
  officialEndpointPlan,
  isOfficialEndpointPlan,
} from "../../src/lib/catalog/official-endpoints.ts";

const identifiers =
  "courseId=151332&courseOfferingNumber=1&classSection=0040&sessionCode=1&termCode=1268";
const payload = {
  status: "success",
  data: {
    availability: {
      isOpen: true,
      enrollmentStatus: "Open",
      enrollmentCapacity: 70,
      enrollmentTotal: 44,
      availableSeats: 26,
      waitlistCapacity: 999,
      waitlistTotal: 0,
    },
  },
};
test("discovers once, then requests each live read directly from OSU without credentials", async () => {
  const seen = [];
  const transport = createCatalogTransport(async (url, options) => {
    seen.push({ url: String(url), options });
    return String(url).startsWith("/api/")
      ? Response.json(officialEndpointPlan("availability"))
      : Response.json(payload);
  });
  for (let i = 0; i < 2; i++) {
    const response = await transport.request(
      "/api/catalog/availability?" + identifiers,
      { cache: "no-store" },
    );
    const { availability } = await response.json();
    assert.equal(availability.enrollmentTotal, 44);
    assert.equal(availability.availableSeats, 26);
    assert.equal(availability.waitlistTotal, 0);
  }
  assert.equal(seen.filter((x) => x.url.startsWith("/api/")).length, 1);
  const direct = seen.filter((x) => x.url.startsWith("https:"));
  assert.equal(direct.length, 2);
  for (const { url, options } of direct) {
    const u = new URL(url);
    assert.equal(u.origin, "https://content.osu.edu");
    assert.equal(u.pathname, "/v2/classes/availability");
    assert.equal(u.searchParams.get("classSection"), "0040");
    assert.equal(options.credentials, "omit");
    assert.equal(options.mode, "cors");
    assert.equal(options.cache, "no-store");
  }
});
test("rejects unapproved endpoint recipients and retries failed discovery", async () => {
  let calls = 0;
  const transport = createCatalogTransport(async () => {
    calls++;
    const plan = officialEndpointPlan("availability");
    if (calls === 1)
      return Response.json({
        ...plan,
        endpoints: {
          ...plan.endpoints,
          availability: "https://other.example/seats",
        },
      });
    return Response.json(plan);
  });
  await assert.rejects(
    transport.discover("availability"),
    /Invalid official endpoint/,
  );
  assert.ok(await transport.discover("availability"));
  assert.equal(calls, 2);
  assert.equal(
    isOfficialEndpointPlan(officialEndpointPlan("course"), "catalog"),
    false,
  );
});
test("propagates upstream throttling rather than silently proxying a second read", async () => {
  const seen = [];
  const transport = createCatalogTransport(async (url) => {
    seen.push(String(url));
    return String(url).startsWith("/api/")
      ? Response.json(officialEndpointPlan("availability"))
      : new Response(null, { status: 429, headers: { "Retry-After": "12" } });
  });
  const response = await transport.request(
    "/api/catalog/availability?" + identifiers,
  );
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "12");
  assert.equal(seen.length, 2);
});
