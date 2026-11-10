import assert from "node:assert/strict";
import test from "node:test";
import { createSyllabusClient } from "../../src/lib/syllabus/client.ts";
import {
  readSyllabusDocument,
  readSyllabusPage,
} from "../../src/lib/syllabus/upstream.ts";
import {
  documentFixture,
  envelope,
  rawEntry,
  state,
  term,
} from "./fixtures.mjs";

test("reads official data in browser with no credentials and a fixed term UUID", async () => {
  const seen = [];
  const client = createSyllabusClient(async (url, options) => {
    seen.push({ url: String(url), options });
    return Response.json(
      String(url).includes("app-state")
        ? state
        : String(url).includes("doc-library")
          ? envelope([rawEntry])
          : documentFixture(),
    );
  });
  const query = { subject: "ART", catalogNumber: "2000", termCode: "1268" };
  const result = await client.entries(query);
  assert.equal(result.source, "official-direct");
  assert.equal(result.data.length, 1);
  assert.ok(seen.every((call) => call.options.credentials === "omit"));
  const search = new URL(
    seen.find((call) => call.url.includes("doc-library")).url,
  );
  assert.equal(search.searchParams.get("term_id"), term.id);
  assert.equal(search.searchParams.has("term_statuses[]"), false);
  assert.equal((await client.document("example123")).data.components.length, 1);
});
test("CORS failure uses the anonymous relay and avoids repeated direct probes", async () => {
  let direct = 0,
    relay = 0;
  const client = createSyllabusClient(async (url) => {
    if (String(url).startsWith("https:")) {
      direct++;
      throw new TypeError("Failed to fetch");
    }
    relay++;
    const resource = new URL(
      String(url),
      "https://local.example",
    ).searchParams.get("resource");
    return Response.json({
      data: resource === "terms" ? [term] : resource === "entries" ? [] : {},
      source: "official-relay",
      fetchedAt: new Date().toISOString(),
    });
  });
  await client.entries({
    subject: "ART",
    catalogNumber: "2000",
    termCode: "1268",
  });
  await client.document("example123");
  assert.equal(direct, 1);
  assert.equal(relay, 3);
});
test(
  "concurrent course reads share metadata without queue deadlocks",
  { timeout: 3000 },
  async () => {
    let terms = 0;
    const client = createSyllabusClient(async (url) => {
      if (String(url).includes("app-state")) {
        terms++;
        return Response.json(state);
      }
      return Response.json(envelope([rawEntry]));
    });
    await Promise.all([
      client.entries({
        subject: "ART",
        catalogNumber: "2000",
        termCode: "1268",
      }),
      client.entries({
        subject: "ART",
        catalogNumber: "2100",
        termCode: "1268",
      }),
    ]);
    assert.equal(terms, 1);
  },
);
test("ignores responses for other terms and rejects repeated/missing pages", async () => {
  await assert.rejects(
    readSyllabusPage(term, 0, undefined, async () =>
      Response.json(
        envelope([
          { ...rawEntry, term_id: "cca63d71-251d-46c4-9b7b-9465e0a260aa" },
        ]),
      ),
    ),
  );
  const client = createSyllabusClient(async (url) => {
    if (String(url).startsWith("/api"))
      return Response.json({ error: "unavailable" }, { status: 503 });
    if (String(url).includes("app-state")) return Response.json(state);
    const page = Number(new URL(url).searchParams.get("page"));
    return Response.json(
      envelope([rawEntry], { total: 2, returned: 1, page, page_size: 1 }),
    );
  });
  await assert.rejects(
    client.entries({ subject: "ART", catalogNumber: "2000", termCode: "1268" }),
  );
});
test("keeps denied access, absent publications and HTML error pages distinct", async () => {
  for (const [status, kind] of [
    [403, "restricted"],
    [404, "missing"],
    [503, "unavailable"],
  ])
    await assert.rejects(
      readSyllabusDocument("example123", async () =>
        Response.json({ error: "blocked" }, { status }),
      ),
      (error) => error.kind === kind,
    );
  await assert.rejects(
    readSyllabusDocument(
      "example123",
      async () =>
        new Response("<html>Request blocked</html>", {
          status: 403,
          headers: { "Content-Type": "text/html" },
        }),
    ),
    (error) => error.kind === "unavailable",
  );
  await assert.rejects(
    readSyllabusDocument(
      "example123",
      async () =>
        new Response("<html>login</html>", {
          headers: { "Content-Type": "text/html" },
        }),
    ),
    (error) => error.kind === "unavailable",
  );
});
test("cancellation does not fall back to another transport", async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = createSyllabusClient(async () => {
    calls++;
    throw new Error("unexpected");
  });
  await assert.rejects(client.document("example123", controller.signal));
  assert.equal(calls, 0);
});
