import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const source = (
  await readFile(
    new URL("../../src/lib/catalog/official-availability.ts", import.meta.url),
    "utf8",
  )
)
  .replace('import "server-only";', "")
  .replace(
    '"./request-pool"',
    JSON.stringify(
      new URL("../../src/lib/catalog/request-pool.ts", import.meta.url).href,
    ),
  )
  .replace(
    '"./section-availability"',
    JSON.stringify(
      new URL("../../src/lib/catalog/section-availability.ts", import.meta.url)
        .href,
    ),
  );
const { getOfficialSectionAvailability } = await import(
  "data:text/javascript;base64," +
    Buffer.from(stripTypeScriptTypes(source)).toString("base64")
);

test("queries the dedicated official endpoint with exact identifiers and coalesces duplicate requests", async () => {
  const previous = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push({ url: new URL(url), options });
    return Response.json({
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
    });
  };
  try {
    const query = {
      courseId: "151332",
      courseOfferingNumber: "1",
      classSection: "0040",
      sessionCode: "1",
      termCode: "1268",
    };
    const [first, second] = await Promise.all([
      getOfficialSectionAvailability(query),
      getOfficialSectionAvailability(query),
    ]);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url.origin, "https://content.osu.edu");
    assert.equal(seen[0].url.pathname, "/v2/classes/availability");
    assert.deepEqual(Object.fromEntries(seen[0].url.searchParams), query);
    assert.equal(seen[0].options.cache, "no-store");
    assert.deepEqual(seen[0].options.headers, { Accept: "application/json" });
    assert.equal(first, second);
    assert.equal(first.enrollmentTotal, 44);
    assert.equal(first.availableSeats, 26);
    assert.equal(first.waitlistTotal, 0);
    assert.equal(first.source, "official-availability");
  } finally {
    globalThis.fetch = previous;
  }
});
