import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { after, describe, it } from "node:test";
import {
  directoryAccountFromTerm,
  validDirectoryFallbackName,
  validDirectorySearchTerm,
} from "../../src/lib/people/directory.ts";

const fixtureKey = Symbol.for("osu-directory-cache-test");
const databaseText = stripTypeScriptTypes(
  await readFile(
    new URL("../../src/lib/people/database.ts", import.meta.url),
    "utf8",
  ),
)
  .replace(
    'import { queryDatabase } from "@/lib/db";',
    `const queryDatabase = (...args) => globalThis[Symbol.for("osu-directory-cache-test")].queryDatabase(...args);`,
  )
  .replace(
    '"./directory"',
    JSON.stringify(
      new URL("../../src/lib/people/directory.ts", import.meta.url).href,
    ),
  );
const database = await import(
  "data:text/javascript;base64," + Buffer.from(databaseText).toString("base64")
);
globalThis[fixtureKey] = {
  queryDatabase: () => {
    throw new Error("No query fixture set");
  },
  ...database,
  directoryAccountFromTerm,
  validDirectoryFallbackName,
  validDirectorySearchTerm,
};

const routeText = stripTypeScriptTypes(
  await readFile(
    new URL("../../src/app/api/people/lookup/route.ts", import.meta.url),
    "utf8",
  ),
)
  .replace(
    /import\s*\{[^;]*\}\s*from "@\/lib\/people\/directory";/,
    `const { directoryAccountFromTerm, validDirectoryFallbackName, validDirectorySearchTerm } = globalThis[Symbol.for("osu-directory-cache-test")];
     const lookupDirectory = (...args) => globalThis[Symbol.for("osu-directory-cache-test")].lookupDirectory(...args);`,
  )
  .replace(
    /import\s*\{[^;]*\}\s*from "@\/lib\/people\/database";/,
    `const { directoryPersonIsFresh, directoryPersonResponse, isVerifiedDirectoryPerson, readDirectoryPerson, writeDirectoryPerson } = globalThis[Symbol.for("osu-directory-cache-test")];`,
  );
const route = await import(
  "data:text/javascript;base64," + Buffer.from(routeText).toString("base64")
);

after(() => {
  delete globalThis[fixtureKey];
});

function request(body) {
  return new Request("http://localhost/api/people/lookup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function row(verifiedAt = new Date().toISOString()) {
  return {
    name_dot_number: "verifiedfixture.1",
    display_name: "Verified Fixture",
    roles: ["lecturer", "employee"],
    appointments: [{ title: "Senior Lecturer", organization: "Mathematics" }],
    source: "osu-search",
    cache_version: 3,
    verified_at: verifiedAt,
  };
}

describe("verified directory cache", { concurrency: false }, () => {
  it("serves an unexpired database identity without any source request or write", async () => {
    const queries = [];
    globalThis[fixtureKey].queryDatabase = async (sql, params) => {
      queries.push({ sql, params });
      assert.match(sql, /^SELECT/);
      return { rows: [row()] };
    };
    globalThis[fixtureKey].lookupDirectory = async () => {
      throw new Error("A database cache hit must not query OSU");
    };
    const response = await route.POST(request({ term: "verifiedfixture.1" }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.cache, "database");
    assert.equal(body.source, "osu-search");
    assert.equal(body.results[0].name, "Verified Fixture");
    assert.equal(queries.length, 1);
    assert.deepEqual(queries[0].params, ["verifiedfixture.1"]);
  });

  it("rejects malformed cached data and stores only the official lookup result", async () => {
    const official = {
      name: "Official Changed Fixture",
      roles: ["professor", "employee"],
      appointments: [
        { title: "Professor", organization: "Official department" },
      ],
    };
    const queries = [];
    globalThis[fixtureKey].queryDatabase = async (sql, params) => {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT"))
        return { rows: [{ ...row(), roles: "not-an-array" }] };
      return { rows: [] };
    };
    globalThis[fixtureKey].lookupDirectory = async (term, fallback) => {
      assert.equal(term, "verifiedfixture.1");
      assert.equal(fallback, "Verified Fixture");
      return {
        status: "available",
        source: "osu-search",
        cache: "source",
        verifiedAt: new Date().toISOString(),
        results: [official],
      };
    };
    const response = await route.POST(
      request({
        term: "verifiedfixture.1",
        fallbackName: "Verified Fixture",
        source: "attacker",
        person: { name: "Fake Person", roles: ["professor"] },
        roles: ["professor"],
        appointments: [{ title: "Fake Appointment", organization: "Fake" }],
      }),
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.results[0].name, official.name);
    const saved = queries.find((entry) => entry.sql.startsWith("INSERT"));
    assert.equal(saved.params[1], official.name);
    assert.deepEqual(JSON.parse(saved.params[2]), official.roles);
    assert.deepEqual(JSON.parse(saved.params[3]), official.appointments);
    assert.equal(saved.params[4], "osu-search");
    assert.equal(JSON.stringify(saved.params).includes("Fake"), false);
  });

  it("refreshes an expired identity with changed official appointments", async () => {
    const queries = [];
    const before = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    globalThis[fixtureKey].queryDatabase = async (sql, params) => {
      queries.push({ sql, params });
      return { rows: sql.startsWith("SELECT") ? [row(before)] : [] };
    };
    const after = new Date().toISOString();
    globalThis[fixtureKey].lookupDirectory = async () => ({
      status: "available",
      source: "content-api-v2",
      cache: "source",
      verifiedAt: after,
      results: [
        {
          name: "Verified Fixture",
          roles: ["professor", "employee"],
          appointments: [
            { title: "Associate Professor", organization: "New department" },
          ],
        },
      ],
    });
    const response = await route.POST(request({ term: "verifiedfixture.1" }));
    const body = await response.json();
    assert.equal(body.cache, "source");
    const saved = queries.find((entry) => entry.sql.startsWith("INSERT"));
    assert.ok(saved);
    assert.equal(saved.params[4], "content-api-v2");
    assert.equal(saved.params[5], after);
    assert.equal(JSON.parse(saved.params[3])[0].title, "Associate Professor");
  });

  it("uses a stale verified record when its refresh fails without overwriting it", async () => {
    const before = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();
    let writes = 0;
    globalThis[fixtureKey].queryDatabase = async (sql) => {
      if (sql.startsWith("INSERT")) writes++;
      return { rows: sql.startsWith("SELECT") ? [row(before)] : [] };
    };
    globalThis[fixtureKey].lookupDirectory = async () => ({
      status: "unavailable",
      source: null,
      results: [],
    });
    const response = await route.POST(request({ term: "verifiedfixture.1" }));
    const body = await response.json();
    assert.equal(body.cache, "database");
    assert.equal(body.stale, true);
    assert.equal(body.verifiedAt, before);
    assert.equal(writes, 0);
  });

  it("continues with a verified source response when the cache database is unavailable", async () => {
    globalThis[fixtureKey].queryDatabase = async () => {
      throw new Error("database unavailable");
    };
    globalThis[fixtureKey].lookupDirectory = async () => ({
      status: "available",
      source: "osu-search",
      cache: "source",
      verifiedAt: new Date().toISOString(),
      results: [
        {
          name: "Verified Fixture",
          roles: ["lecturer"],
          appointments: [{ title: "Lecturer", organization: "Mathematics" }],
        },
      ],
    });
    const response = await route.POST(request({ term: "verifiedfixture.1" }));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.cache, "source");
    assert.equal(body.results[0].name, "Verified Fixture");
  });

  it("refreshes an old protocol row and shortens caching for empty role evidence", async () => {
    const person = {
      nameDotNumber: "verifiedfixture.1",
      person: { name: "Verified Fixture", roles: [], appointments: [] },
      source: "osu-search",
      verifiedAt: new Date().toISOString(),
      cacheVersion: 2,
    };
    assert.equal(database.directoryPersonIsFresh(person), false);
    assert.equal(
      database.directoryPersonIsFresh({ ...person, cacheVersion: 3 }),
      true,
    );
    assert.equal(
      database.directoryPersonIsFresh({
        ...person,
        cacheVersion: 3,
        verifiedAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      }),
      false,
    );
  });

  it("enriches a fresh incomplete account when its department subject becomes available", async () => {
    let upstreamCalls = 0;
    const queries = [];
    globalThis[fixtureKey].queryDatabase = async (sql, params) => {
      queries.push({ sql, params });
      return {
        rows: sql.startsWith("SELECT")
          ? [{ ...row(), roles: [], appointments: [] }]
          : [],
      };
    };
    globalThis[fixtureKey].lookupDirectory = async (
      term,
      fallback,
      subject,
    ) => {
      upstreamCalls++;
      assert.equal(term, "verifiedfixture.1");
      assert.equal(subject, "MATH");
      return {
        status: "available",
        source: "department-profile",
        cache: "source",
        sourceUrl: "https://math.osu.edu/people/verifiedfixture.1",
        verifiedAt: new Date().toISOString(),
        results: [
          {
            name: "Verified Fixture",
            roles: ["lecturer", "employee"],
            appointments: [
              { title: "Lecturer", organization: "Department of Mathematics" },
            ],
          },
        ],
      };
    };
    const noSubject = await route.POST(request({ term: "verifiedfixture.1" }));
    assert.equal((await noSubject.json()).cache, "database");
    assert.equal(upstreamCalls, 0);
    const withSubject = await route.POST(
      request({ term: "verifiedfixture.1", subject: "MATH" }),
    );
    const enriched = await withSubject.json();
    assert.equal(upstreamCalls, 1);
    assert.equal(enriched.results[0].appointments[0].title, "Lecturer");
    assert.ok(queries.some((entry) => entry.sql.startsWith("INSERT")));
  });
});
