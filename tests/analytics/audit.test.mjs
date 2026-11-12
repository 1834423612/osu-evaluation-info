import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("the audit paginates submissions and outcomes, isolates production and omits private event identifiers", async () => {
  const folder = await mkdtemp(join(tmpdir(), "osu-search-audit-")),
    output = join(folder, "audit.json");
  const credential = "fake-audit-test-key";
  const events = [
    {
      id: "private-production-event",
      eventType: 2,
      eventName: "course_search",
      hostname: "courses.example",
      createdAt: "now",
    },
    {
      id: "private-dev-event",
      eventType: 2,
      eventName: "course_search",
      hostname: "localhost",
      createdAt: "now",
    },
    {
      id: "private-result-event",
      eventType: 2,
      eventName: "course_search_results",
      hostname: "courses.example",
      createdAt: "now",
    },
  ];
  const property = (dataKey, value) =>
    typeof value === "number"
      ? { dataKey, numberValue: value }
      : { dataKey, stringValue: value };
  const server = createServer((req, res) => {
    assert.equal(req.headers.authorization, `Bearer ${credential}`);
    const url = new URL(req.url, "http://local"),
      page = Number(url.searchParams.get("page") ?? 1);
    let response;
    if (url.pathname.endsWith("/events"))
      response = {
        count: 3,
        data: page === 1 ? events.slice(0, 2) : events.slice(2),
      };
    else if (url.pathname.endsWith("/event-data")) {
      if (url.searchParams.get("event") === "course_search_results")
        response = {
          count: 5,
          data: [
            {
              eventId: events[2].id,
              eventProperties: [
                property("search_term", "missing"),
                property("status", "no_matches"),
                property("result_count", 0),
                property("total_courses", 0),
                property("term", "1272"),
              ],
            },
          ],
        };
      else
        response = {
          count: 3,
          data:
            page === 1
              ? [
                  {
                    eventId: events[0].id,
                    eventProperties: [
                      property("search_term", "production query"),
                    ],
                  },
                ]
              : [
                  {
                    eventId: events[0].id,
                    eventProperties: [property("search_type", "keyword")],
                  },
                  {
                    eventId: events[1].id,
                    eventProperties: [property("search_term", "dev query")],
                  },
                ],
        };
    } else if (url.pathname.endsWith("/stats"))
      response = { pageviews: { value: 2 } };
    else
      response = {
        name: "Courses",
        domain: "courses.example",
        createdAt: "now",
      };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const child = spawn(
      process.execPath,
      ["scripts/analytics/analyze-search.mjs", output],
      {
        env: {
          ...process.env,
          UMAMI_API_KEY: credential,
          NEXT_PUBLIC_UMAMI_WEBSITE_ID: "test",
          UMAMI_API_BASE_URL: `http://127.0.0.1:${server.address().port}`,
        },
      },
    );
    let log = "";
    child.stdout.on("data", (data) => {
      log += data;
    });
    child.stderr.on("data", (data) => {
      log += data;
    });
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    assert.equal(code, 0, log);
    const raw = await readFile(output, "utf8"),
      report = JSON.parse(raw);
    assert.equal(report.coverage.eventsFetched, 3);
    assert.equal(report.coverage.searchPropertyRows, 3);
    assert.equal(report.production.searches, 1);
    assert.deepEqual(report.production.queryCounts, { "production query": 1 });
    assert.deepEqual(report.production.resultStatuses, { no_matches: 1 });
    assert.equal(report.resultLoads[0].resultCount, 0);
    assert.equal(report.production.confirmedEmptyQueries.missing, 1);
    assert(!raw.includes("private-"));
    assert(!raw.includes(credential));
    assert(!log.includes(credential));
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await unlink(output).catch(() => {});
    await rmdir(folder);
  }
});
