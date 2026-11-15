import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { course } from "../user-data/fixtures.mjs";
import { officialEndpointPlan } from "../../src/lib/catalog/official-endpoints.ts";
if (process.env.ALLOW_UMAMI_WRITES !== "1")
  throw Error(
    "Set ALLOW_UMAMI_WRITES=1: this test creates synthetic Umami events/replays.",
  );
for (const name of [".env.local", ".env"]) {
  const path = fileURLToPath(new URL("../../" + name, import.meta.url));
  if (existsSync(path)) process.loadEnvFile(path);
}
const { chromium } = await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  ),
  base = new URL(
    process.env.USER_DATA_TEST_BASE_URL ?? "http://127.0.0.1:3001",
  ),
  collector = new URL(process.env.NEXT_PUBLIC_UMAMI_TRACKER_URL).origin,
  out = resolve(process.env.USER_DATA_SCREENSHOT_DIR ?? ".cache/replay-live");
await mkdir(out, { recursive: true });
const rrweb = await readFile(
    process.env.REPLAY_RRWEB_DIR
      ? resolve(process.env.REPLAY_RRWEB_DIR, "dist/rrweb.umd.cjs")
      : new URL("../../node_modules/rrweb/dist/rrweb.umd.cjs", import.meta.url),
    "utf8",
  ),
  rrwebCss = await readFile(
    process.env.REPLAY_RRWEB_DIR
      ? resolve(process.env.REPLAY_RRWEB_DIR, "dist/style.css")
      : new URL("../../node_modules/rrweb/dist/style.css", import.meta.url),
    "utf8",
  );
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
});
const width = Number(process.env.REPLAY_TEST_WIDTH ?? 1440),
  height = 1000,
  marker = randomBytes(6).toString("hex"),
  context = await browser.newContext({
    viewport: { width, height },
    locale: "en-US",
    reducedMotion: "reduce",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0." +
      parseInt(marker.slice(0, 4), 16) +
      "." +
      parseInt(marker.slice(4, 8), 16) +
      " Safari/537.36",
  });
const requests = [],
  statuses = [],
  errors = [],
  checkpoints = [],
  network = [],
  visits = new Set(),
  pendingRecords = [];
let active;
const catalog = {
  courses: [course],
  page: 1,
  hasMore: false,
  nextCursor: null,
  totalItems: 1,
  totalCourses: 1,
  totalPages: 1,
  matchedSections: 1,
  capped: false,
  filters: [],
  terms: [{ code: "1268", label: "Autumn 2026" }],
  source: "fixture",
  fetchedAt: new Date().toISOString(),
  evaluationStatus: "unavailable",
};
function measure(doc) {
  const visible = (selector) =>
    [...doc.querySelectorAll(selector)].filter((e) => {
      const s = doc.defaultView.getComputedStyle(e),
        r = e.getBoundingClientRect();
      return (
        s.display !== "none" &&
        s.visibility !== "hidden" &&
        r.width > 4 &&
        r.height > 4
      );
    });
  const inputs = visible(".search-bar input"),
    panels = visible(".course-detail-panel, .course-detail-drawer"),
    rect = (e) => {
      const r = e.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
  return {
    inputs: inputs.map(rect),
    panels: panels.map(rect),
    terms: visible("#term-select").map(rect),
    menus: visible('[role="listbox"], [role="menu"]').map(rect),
    pageScroll: doc.scrollingElement.scrollTop,
    panelScroll: panels.map((p) => {
      const inner = p.querySelector("[data-scroll-panel]");
      return inner && inner.scrollHeight > inner.clientHeight + 2
        ? inner.scrollTop
        : p.scrollTop;
    }),
    overflow: doc.documentElement.scrollWidth > doc.defaultView.innerWidth,
  };
}
function restore(chunks) {
  const all = chunks.flatMap((x) => x.payload.events),
    groups = new Map(),
    events = [];
  for (const e of all) {
    if (e.type !== "umami:rrweb-event-fragment") {
      events.push(e);
      continue;
    }
    const d = e.data,
      g = groups.get(d.id) ?? { total: d.total, parts: new Map() };
    g.parts.set(d.index, d.value);
    groups.set(d.id, g);
  }
  for (const g of groups.values()) {
    assert.equal(g.parts.size, g.total, "Complete event fragments");
    events.push(
      JSON.parse(
        Array.from({ length: g.total }, (_, i) => g.parts.get(i)).join(""),
      ),
    );
  }
  return events.sort((a, b) => a.timestamp - b.timestamp);
}
try {
  await context.addInitScript(() => {
    localStorage.setItem("course-atlas:locale:v1", "en");
    localStorage.setItem("course-atlas:translation-guide:v1", "done");
  });
  await context.route("**/*", (r) => {
    const u = new URL(r.request().url());
    if (u.origin === collector) return r.continue();
    if (u.origin === "https://content.osu.edu") {
      if (u.pathname.endsWith("/searchableTermsV2"))
        return r.fulfill({
          json: {
            data: {
              data: [{ classSearch: "Y", strm: "1268", descr: "Autumn 2026" }],
            },
          },
        });
      if (u.pathname.endsWith("/search"))
        return r.fulfill({
          json: {
            data: {
              courses: [
                {
                  course: {
                    courseId: "001234",
                    offeringNumber: "1",
                    subject: "MATH",
                    subjectDesc: "Mathematics",
                    catalogNumber: "1151",
                    title: "Calculus I",
                    description: "Course description",
                    campusCode: "COL",
                    minUnits: 5,
                    maxUnits: 5,
                  },
                  sections: Array.from({ length: 20 }, (_, index) => ({
                    classNumber: String(12345 + index),
                    section: String(index + 1).padStart(4, "0"),
                    termCode: "1268",
                    sessionCode: "1",
                    courseOfferingNumber: 1,
                    campus: "Columbus",
                    component: "Lecture",
                    meetings: [{ instructors: [] }],
                  })),
                },
              ],
              totalItems: 1,
              totalPages: 1,
              filters: [],
            },
          },
        });
      return r.fulfill({ json: { data: {} } });
    }
    if (u.origin !== base.origin) return r.abort();
    if (u.pathname.startsWith("/_vercel")) return r.abort();
    if (u.pathname === "/qa-replay-viewer")
      return r.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><head></head><body style='margin:0'></body></html>",
      });
    if (u.pathname === "/api/catalog/search")
      return r.fulfill({ json: catalog });
    if (
      [
        "/api/catalog",
        "/api/catalog/course",
        "/api/catalog/facets",
        "/api/catalog/availability",
      ].includes(u.pathname)
    )
      return r.fulfill({
        json: officialEndpointPlan(
          u.pathname === "/api/catalog"
            ? "catalog"
            : u.pathname.split("/").pop(),
        ),
      });
    if (u.pathname === "/api/catalog/subjects")
      return r.fulfill({
        json: {
          filters: [
            {
              slug: "subject",
              items: [{ value: "MATH", label: "Mathematics" }],
            },
          ],
        },
      });
    if (u.pathname.startsWith("/api/"))
      return r.fulfill({ status: 503, json: { error: "QA isolated" } });
    return r.continue();
  });
  const p = await context.newPage();
  active = p;
  p.on("pageerror", (e) => errors.push(e.message));
  p.on("request", (r) => {
    if (
      new URL(r.url()).origin === collector &&
      new URL(r.url()).pathname === "/api/record" &&
      r.method() === "POST"
    ) {
      const data = r.postDataJSON();
      if (data.type === "record") {
        requests.push(data);
        pendingRecords.push(
          r
            .response()
            .then(async (response) => {
              if (!response)
                return {
                  failed: r.failure()?.errorText ?? "no_response",
                  bytes: r.postData()?.length ?? 0,
                  types: data.payload.events.map((e) => e.type),
                };
              const body = await response.json();
              return {
                status: response.status(),
                ok: body.ok,
                bytes: r.postData()?.length ?? 0,
                types: data.payload.events.map((e) => e.type),
              };
            })
            .catch(() => ({ failed: "response_unavailable" })),
        );
      }
    }
  });
  p.on("response", async (r) => {
    if (new URL(r.url()).origin === collector) {
      const entry = {
        path: new URL(r.url()).pathname.replace(/[a-f0-9-]{36}/g, "[id]"),
        status: r.status(),
      };
      network.push(entry);
      if (r.request().method() === "POST") {
        try {
          const data = await r.json();
          if (typeof data.visitId === "string") visits.add(data.visitId);
          entry.keys = Object.keys(data);
          entry.cacheType = typeof data.cache;
          entry.bot = !!data.beep;
        } catch {
          entry.body = "not_json";
        }
      }
    }
    if (
      new URL(r.url()).origin === collector &&
      new URL(r.url()).pathname === "/api/record" &&
      r.request().method() === "POST"
    )
      statuses.push(r.status());
  });
  async function checkpoint(name) {
    await p.waitForTimeout(300);
    checkpoints.push({
      name,
      time: Date.now(),
      metrics: await p.evaluate("(" + measure.toString() + ")(document)"),
    });
    await p.screenshot({ path: out + "/live-" + name + "-" + width + ".png" });
  }
  await p.goto(base.href);
  await p.locator(".search-bar input").first().waitFor();
  await p.waitForFunction(() => window.umami?.getSession?.()?.cache, null, {
    timeout: 15000,
  });
  await p.evaluate(
    (width) =>
      window.umami.track("qa_replay_verification", {
        synthetic: true,
        width,
        case: "single_tab",
      }),
    width,
  );
  await p.waitForFunction(() => document.querySelector("#umami-recorder"));
  await p.waitForTimeout(2200);
  assert.ok(
    requests.length,
    "Recorder emitted a full snapshot using the remote policy",
  );
  await p.locator(".search-bar input").first().fill("MATH 1151");
  await p.locator(".search-bar input").first().press("Enter");
  await p.getByRole("button", { name: "Calculus I", exact: true }).waitFor();
  await checkpoint("search");
  await p.locator("#term-select").click();
  await p.getByRole("listbox").waitFor();
  await checkpoint("term");
  await p.keyboard.press("Escape");
  await p.getByRole("listbox").waitFor({ state: "hidden" });
  await p.getByRole("button", { name: "Calculus I", exact: true }).click();
  await p.locator(".course-detail-panel, .course-detail-drawer").waitFor();
  await p.waitForFunction(() => {
    const n = document.querySelector(
        ".course-detail-panel, .course-detail-drawer",
      ),
      inner = n?.querySelector("[data-scroll-panel]");
    return (
      n &&
      (n.scrollHeight - n.clientHeight > 200 ||
        (inner && inner.scrollHeight - inner.clientHeight > 200))
    );
  });
  await checkpoint("panel");
  await p
    .locator(".course-detail-panel, .course-detail-drawer")
    .evaluate((node) => {
      const inner = node.querySelector("[data-scroll-panel]");
      (inner && inner.scrollHeight > inner.clientHeight + 2
        ? inner
        : node
      ).scrollTop = 500;
    });
  await checkpoint("scroll");
  await p.keyboard.press("Escape");
  await p
    .locator(".course-detail-panel, .course-detail-drawer")
    .waitFor({ state: "hidden" });
  await checkpoint("closed");
  const cache = await p.evaluate(() => window.umami.getSession().cache);
  await p.waitForTimeout(2500);
  const emitted = restore(requests);
  const completed = await Promise.all(pendingRecords);
  console.log(JSON.stringify({ recordRequests: completed }));
  assert.ok(
    completed.every((r) => r.ok === true),
    "All replay chunks were accepted",
  );
  await writeFile(
    out + "/emitted-events-" + width + ".json",
    JSON.stringify(emitted),
  );
  assert.ok(emitted.some((e) => e.type === 2));
  assert.ok(
    statuses.length && statuses.every((s) => s >= 200 && s < 300),
    "Remote collector accepted all chunks",
  );
  let events = emitted,
    roundTrip = false;
  try {
    const claims = JSON.parse(
      Buffer.from(cache.split(".")[1], "base64url").toString("utf8"),
    );
    if (claims.visitId && process.env.UMAMI_API_KEY) {
      const url = new URL(
          "/api/websites/" +
            process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID +
            "/replays/" +
            claims.visitId,
          collector,
        ),
        r = await fetch(url, {
          headers: { Authorization: "Bearer " + process.env.UMAMI_API_KEY },
          signal: AbortSignal.timeout(15000),
        });
      assert.equal(r.status, 200);
      let saved = await r.json();
      for (
        let attempt = 0;
        attempt < 6 && !saved.events?.some((e) => e.type === 2);
        attempt++
      ) {
        await p.waitForTimeout(1000);
        const retry = await fetch(url, {
          headers: { Authorization: "Bearer " + process.env.UMAMI_API_KEY },
          signal: AbortSignal.timeout(15000),
        });
        saved = await retry.json();
      }
      assert.ok(saved.events?.length);
      await writeFile(
        out + "/server-events-" + width + ".json",
        JSON.stringify({
          events: saved.events,
          eventCount: saved.eventCount,
          chunkCount: saved.chunkCount,
        }),
      );
      events = saved.events;
      roundTrip = true;
    }
  } catch (e) {
    if (process.env.REPLAY_REQUIRE_ROUND_TRIP === "1") throw e;
  }
  if (process.env.REPLAY_REQUIRE_ROUND_TRIP === "1")
    assert.ok(
      roundTrip,
      "Read the synthetic replay back through the authenticated Umami API",
    );
  assert.equal(
    visits.size,
    1,
    "All startup and interaction events use one visit token",
  );
  assert.ok(
    events.some((e) => e.type === 2),
    "The saved replay contains its full snapshot, not just mutations",
  );
  await writeFile(
    out + "/synthetic-events-" + width + ".json",
    JSON.stringify(events),
  );
  const viewer = await context.newPage();
  await viewer.goto(new URL("/qa-replay-viewer", base).href);
  await viewer.addStyleTag({ content: rrwebCss + "iframe{border:0}" });
  await viewer.addScriptTag({ content: rrweb });
  await viewer.evaluate((events) => {
    window.qaReplayer = new rrweb.Replayer(events, {
      root: document.body,
      showWarning: true,
      mouseTail: false,
      loadTimeout: 3000,
      triggerFocus: false,
    });
  }, events);
  const start = events[0].timestamp;
  for (const point of checkpoints) {
    await viewer.evaluate(
      (offset) => window.qaReplayer.pause(offset),
      point.time - start,
    );
    await viewer.waitForTimeout(350);
    const replay = await viewer.evaluate(
      "(" +
        measure.toString() +
        ")(document.querySelector('iframe').contentDocument)",
    );
    await viewer.screenshot({
      path: out + "/replay-" + point.name + "-" + width + ".png",
    });
    assert.equal(
      replay.inputs.length,
      point.metrics.inputs.length,
      point.name + ": visible search inputs",
    );
    assert.equal(
      replay.panels.length,
      point.metrics.panels.length,
      point.name + ": visible panels",
    );
    assert.equal(
      replay.terms.length,
      point.metrics.terms.length,
      point.name + ": visible term controls",
    );
    assert.equal(
      replay.overflow,
      point.metrics.overflow,
      point.name + ": overflow",
    );
    assert.deepEqual(
      replay.panelScroll,
      point.metrics.panelScroll,
      point.name + ": panel scroll positions",
    );
    assert.equal(
      replay.menus.length,
      point.metrics.menus.length,
      point.name + ": visible menus",
    );
    for (const kind of ["inputs", "panels", "terms", "menus"])
      for (let i = 0; i < replay[kind].length; i++)
        for (const axis of ["x", "y", "width", "height"])
          assert.ok(
            Math.abs(replay[kind][i][axis] - point.metrics[kind][i][axis]) < 3,
            point.name +
              ": " +
              kind +
              " " +
              axis +
              " " +
              JSON.stringify({
                live: point.metrics[kind][i],
                replay: replay[kind][i],
              }),
          );
    await viewer.screenshot({
      path: out + "/replay-" + point.name + "-" + width + ".png",
    });
  }
  assert.deepEqual(errors, []);
  await writeFile(
    out + "/summary-" + width + ".json",
    JSON.stringify(
      {
        width,
        roundTrip,
        chunks: requests.length,
        events: events.length,
        fullSnapshots: events.filter((e) => e.type === 2).length,
        checkpoints: checkpoints.map((p) => p.name),
        collectorStatuses: statuses,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      width,
      roundTrip,
      chunks: requests.length,
      events: events.length,
      checkpoints: checkpoints.map((p) => p.name),
      passed: true,
    }),
  );
} catch (e) {
  if (active) {
    await active
      .screenshot({ path: out + "/failure-" + width + ".png", timeout: 3000 })
      .catch(() => {});
    console.log(
      JSON.stringify({
        network,
        errors,
        diagnostic: await active.evaluate(() => ({
          ready: document.readyState,
          scripts: [...document.scripts]
            .filter((s) => s.id.includes("umami"))
            .map((s) => s.id),
          umamiKeys: Object.keys(window.umami ?? {}),
          cacheReady: !!window.umami?.getSession?.()?.cache,
          dnt: navigator.doNotTrack,
          disabled: localStorage.getItem("umami.disabled"),
        })),
      }),
    );
  }
  throw e;
} finally {
  await context.close();
  await browser.close();
}
