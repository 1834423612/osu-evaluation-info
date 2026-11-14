import test from "node:test";
import assert from "node:assert/strict";
import {
  exactOfficialQuery,
  createExactOfficialSearch,
} from "../../src/lib/search/exact-route.ts";
import { createOfficialCatalogClient } from "../../src/lib/catalog/official-client.ts";
import { createIndexedCatalogSearch } from "../../src/lib/search/client.ts";
const facets = [
  {
    slug: "subject",
    items: [
      { value: "CSE", label: "Computer Science and Engineering" },
      { value: "MATH", label: "Mathematics" },
      { value: "BIOLOGY", label: "Biology" },
      { value: "ENGR", label: "Engineering" },
      { value: "ENGLISH", label: "English" },
      { value: "UNSEEN", label: "Newly Added Quantum Chemistry" },
    ],
  },
];
test("complete codes use catalog-derived names and abbreviations without a fixed mapping", () => {
  assert.deepEqual(exactOfficialQuery("CS 1100", facets), {
    subject: "CSE",
    catalogNumber: "1100",
  });
  assert.deepEqual(exactOfficialQuery("ＮＡＱＣ 1234", facets), {
    subject: "UNSEEN",
    catalogNumber: "1234",
  });
  assert.deepEqual(exactOfficialQuery("BIO 1100", facets), {
    subject: "BIOLOGY",
    catalogNumber: "1100",
  });
  assert.deepEqual(exactOfficialQuery("1151", facets, "MATH"), {
    subject: "MATH",
    catalogNumber: "1151",
  });
  assert.deepEqual(exactOfficialQuery("1151.01H", facets, "MATH"), {
    subject: "MATH",
    catalogNumber: "1151.01H",
  });
  assert.equal(exactOfficialQuery("1151", facets), null);
  assert.equal(exactOfficialQuery("ENG 2040", facets), null);
  assert.deepEqual(exactOfficialQuery("NEWSUBJ1234", facets), {
    subject: "NEWSUBJ",
    catalogNumber: "1234",
  });
  assert.equal(exactOfficialQuery("CSE 22", facets), null);
  assert.equal(exactOfficialQuery("CSE 2221", facets, "MATH"), null);
});
test("an official exact match returns fresh data before querying the index, retaining filters", async () => {
  let official = 0,
    index = 0;
  const direct = createExactOfficialSearch(
    async (url) => {
      official++;
      const params = new URL(url, "https://local").searchParams;
      assert.equal(params.get("subject"), "CSE");
      assert.equal(params.get("component"), "lec");
      return Response.json({
        sourceMode: "official",
        courses: [
          {
            subject: "CSE",
            catalogNumber: "2221",
            title: "Current official title",
          },
        ],
        capped: false,
      });
    },
    async () => facets,
  );
  const search = createIndexedCatalogSearch(
    async () => {
      index++;
      throw Error("index should not load");
    },
    async () => {
      throw Error("not needed");
    },
    direct,
  );
  const result = await search("/api/catalog?q=CS2221&term=1272&component=lec");
  assert.equal(result.courses[0].title, "Current official title");
  assert.equal(official, 1);
  assert.equal(index, 0);
});
test("empty, slow, ambiguous or misspelled codes use the index without official fanout", async () => {
  let official = 0,
    index = 0;
  const fetcher = async () => {
    official++;
    return Response.json({ courses: [], capped: false });
  };
  const direct = createExactOfficialSearch(fetcher, async () => facets, 100);
  const search = createIndexedCatalogSearch(
    async () => {
      index++;
      return Response.json({
        sourceMode: "index",
        courses: [],
        searchInfo: { engine: "bm25-1" },
      });
    },
    async () => {
      throw Error("no broad official retries");
    },
    direct,
  );
  await search("/api/catalog?q=CS1100");
  assert.equal(official, 1);
  assert.equal(index, 1);
  await search("/api/catalog?q=ENG2040");
  assert.equal(official, 1);
  assert.equal(index, 2);
  const slow = createExactOfficialSearch(
    async () => new Promise(() => {}),
    async () => facets,
    15,
  );
  assert.equal(await slow("/api/catalog?q=MATH1151"), null);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    direct("/api/catalog?q=MATH1151", { signal: controller.signal }),
  );
});
test("capacity responses do not amplify traffic to the official service", async () => {
  let live = 0;
  const search = createIndexedCatalogSearch(
    async () => new Response(null, { status: 429 }),
    async () => {
      live++;
      return {};
    },
  );
  await assert.rejects(search("/api/catalog?q=chemistry"), /busy/);
  assert.equal(live, 0);
});

test("automatic exact previews never auto-fetch additional official result pages", async () => {
  let pages = 0;
  const client = createOfficialCatalogClient(
    {
      search: "https://source.test/search",
      terms: "https://source.test/terms",
    },
    async (url) => {
      if (url.endsWith("terms"))
        return Response.json({
          data: {
            data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
          },
        });
      pages++;
      return Response.json({
        data: {
          courses: [
            {
              course: {
                courseId: "1",
                offeringNumber: 1,
                subject: "MATH",
                catalogNumber: "1151",
                title: "Calculus I",
                campusCode: "COL",
              },
              sections: [
                {
                  classNumber: "12345",
                  termCode: "1272",
                  section: "0010",
                  sessionCode: "1",
                  courseOfferingNumber: 1,
                  meetings: [],
                },
              ],
            },
          ],
          totalItems: 100,
          totalPages: 12,
        },
      });
    },
  );
  const result = await client.searchOfficialCatalog(
    { q: "MATH1151", term: "1272", campus: "COL" },
    false,
    { exactPages: 1 },
  );
  assert.equal(pages, 1);
  assert.equal(result.capped, true);
  assert.equal(result.totalCourses, null);
  assert.equal(result.courses[0].sectionsPartial, true);
});
