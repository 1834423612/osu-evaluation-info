import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import {
  officialEndpointPlan,
  OFFICIAL_ENDPOINTS,
} from "../../src/lib/catalog/official-endpoints.ts";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
const base = process.env.GUIDE_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.SEARCH_QA_DIR ?? "/tmp/osu-search-qa";
await mkdir(output, { recursive: true });
const subjects = {
  CSE: "Computer Science & Engineering",
  MATH: "Mathematics",
  PHILOS: "Philosophy",
  MECHENG: "Mechanical Engineering",
  ENGLISH: "English",
  ENGR: "Engineering",
  ENGRTECH: "Engineering Technology",
  CIVICLL: "Civics, Law, and Leadership",
  ANIMSCI: "Animal Sciences",
  ANMLTEC: "Animal Sciences Technology",
};
const filters = [
  {
    slug: "subject",
    title: "Subject",
    items: Object.entries(subjects).map(([term, title]) => ({
      term: term.toLowerCase(),
      title,
      count: 30,
    })),
  },
];
function course(subject, number, title, description = "Course overview.") {
  return {
    course: {
      courseId: `${subject}-${number}`,
      offeringNumber: "1",
      subject,
      subjectName: subjects[subject] ?? subject,
      catalogNumber: number,
      title,
      description,
      campusCode: "COL",
      minUnits: 3,
      maxUnits: 3,
    },
    sections: [
      {
        classNumber: `${subject}-${number}-1`,
        section: "0010",
        termCode: "1272",
        sessionCode: "1",
        courseOfferingNumber: 1,
        enrollmentStatus: "Open",
        meetings: [{ instructors: [] }],
      },
    ],
  };
}
const experiment = course("CIVICLL", "2110", "The American Experiment");
const death = course("PHILOS", "2465", "Death and the Meaning of Life");
const engineering = course(
  "ENGR",
  "1181",
  "Fundamentals of Engineering",
  "American experiment, death, meaning, life; prerequisite CSE 2221.",
);
const programming = Array.from({ length: 30 }, (_, index) =>
  course(
    "CSE",
    String(2200 + index),
    index === 21 ? "Software I" : "Computing Foundations",
  ),
);
let active;
try {
  for (const [width, locale] of [
    [1440, "zh"],
    [768, "en"],
    [390, "zh"],
  ]) {
    if (
      process.env.SEARCH_QA_WIDTH &&
      width !== Number(process.env.SEARCH_QA_WIDTH)
    )
      continue;
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      locale: locale === "zh" ? "zh-CN" : "en-US",
    });
    await context.addInitScript((locale) => {
      localStorage.setItem("course-atlas:locale:v1", locale);
      localStorage.setItem("course-atlas:translation-guide:v1", "done");
      window.searchEvents = [];
      window.umami = {
        track: (name, properties) =>
          window.searchEvents.push({ name, properties }),
      };
    }, locale);
    const page = await context.newPage();
    active = page;
    page.setDefaultTimeout(12000);
    const errors = [],
      requests = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (
        url.origin === new URL(base).origin &&
        !url.pathname.startsWith("/api/")
      )
        return route.continue();
      if (url.href === OFFICIAL_ENDPOINTS.terms)
        return route.fulfill({
          json: {
            data: {
              data: [{ classSearch: "Y", strm: "1272", descr: "Spring 2027" }],
            },
          },
        });
      if (
        url.origin === "https://content.osu.edu" &&
        url.pathname.endsWith("/search")
      ) {
        requests.push(url);
        const q = url.searchParams.get("q") ?? "",
          subject = url.searchParams.get("subject");
        if (q === "offline")
          return route.fulfill({ status: 503, json: { error: "Unavailable" } });
        let found =
          q === "american AND experiment"
            ? [engineering, experiment]
            : q === "death AND meaning AND life"
              ? [engineering, death]
              : q === "2465"
                ? [death]
                : q === "22"
                  ? [...programming, engineering]
                  : q === "2040"
                    ? [
                        course(
                          "MECHENG",
                          "2040",
                          "Statics and Introduction to Mechanics of Materials",
                        ),
                        engineering,
                      ]
                    : ["11", "1151"].includes(q)
                      ? [course("MATH", "1151", "Calculus I")]
                      : q === "ani"
                        ? [
                            course(
                              "ANIMSCI",
                              "1100",
                              "Animal Sciences Introduction",
                            ),
                            course("ART", "3500", "Animation"),
                            engineering,
                          ]
                        : q === ""
                          ? [experiment, death, engineering]
                          : [];
        if (subject)
          found = found.filter(
            (item) => item.course.subject.toLowerCase() === subject,
          );
        return route.fulfill({
          json: {
            data: {
              courses: found,
              totalItems: found.length,
              totalPages: found.length ? 1 : 0,
              filters,
            },
          },
        });
      }
      const resource = {
        "/api/catalog": "catalog",
        "/api/catalog/facets": "facets",
        "/api/catalog/course": "course",
        "/api/catalog/availability": "availability",
      }[url.pathname];
      if (resource)
        return route.fulfill({ json: officialEndpointPlan(resource) });
      if (
        url.pathname === "/api/evaluations" ||
        url.pathname === "/api/rmp/summaries"
      )
        return route.fulfill({ json: { summaries: {} } });
      return route.fulfill({ json: {} });
    });
    async function visit(q, extra = "") {
      requests.length = 0;
      await page.goto(`${base}/?q=${encodeURIComponent(q)}&term=1272${extra}`, {
        waitUntil: "networkidle",
      });
      await page.locator("[data-search-context]").waitFor();
      assert.equal(new URL(page.url()).searchParams.get("q"), q);
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        "no horizontal overflow",
      );
    }
    const outcomes = () =>
      page.evaluate(() =>
        window.searchEvents
          .filter((event) => event.name === "course_search_results")
          .map((event) => event.properties),
      );
    await visit(
      "american experiment",
      "&campus=all&component=lec&instruction-mode=dl",
    );
    assert.equal(await page.locator(".course-card").count(), 1);
    assert.match(
      await page.locator(".course-code").innerText(),
      /CIVICLL 2110/,
    );
    assert.equal((await outcomes()).length, 1);
    assert.equal((await outcomes())[0].status, "matches");
    assert.equal((await outcomes())[0].filter_count, 3);
    assert(
      requests.some(
        (url) =>
          url.searchParams.get("q") === "american AND experiment" &&
          url.searchParams.get("component") === "lec" &&
          url.searchParams.get("instruction-mode") === "dl" &&
          !url.searchParams.has("campus"),
      ),
    );
    await page.locator(".results-area").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/keywords-${width}-${locale}.png`,
    });
    // Submitting a fresh query must update the result, without replacing input text with its interpretation.
    const input = page.getByRole("searchbox", {
      name: locale === "zh" ? "搜索课程" : "Search courses",
      exact: true,
    });
    await input.fill("philosophy 2465");
    await input.press("Enter");
    await page.waitForFunction(() =>
      document
        .querySelector(".course-code")
        ?.textContent.includes("PHILOS 2465"),
    );
    assert.equal(new URL(page.url()).searchParams.get("q"), "philosophy 2465");
    await visit("death meaning life");
    assert.equal(await page.locator(".course-card").count(), 1);
    assert.match(await page.locator(".course-code").innerText(), /PHILOS 2465/);
    await visit("cse 22", "&campus=all&component=lec");
    assert.equal(await page.locator(".course-card").count(), 12);
    const firstCodes = await page.locator(".course-code").allTextContents();
    await page
      .getByRole("button", {
        name: locale === "zh" ? "下一页" : "Next",
        exact: true,
      })
      .click();
    await page.waitForFunction(
      () => new URL(location.href).searchParams.get("cursor") === "r:1:12",
    );
    const secondCodes = await page.locator(".course-code").allTextContents();
    assert.equal(
      (await outcomes()).length,
      1,
      "pagination is not a new search result load",
    );
    assert.equal(new Set([...firstCodes, ...secondCodes]).size, 24);
    await page
      .getByRole("button", {
        name: locale === "zh" ? "下一页" : "Next",
        exact: true,
      })
      .waitFor({ state: "visible" });
    await page.goBack({ waitUntil: "networkidle" });
    await page.waitForFunction(() =>
      document.querySelector(".course-code")?.textContent.includes("CSE 2200"),
    );
    assert.deepEqual(
      await page.locator(".course-code").allTextContents(),
      firstCodes,
    );
    await visit("ENG2040");
    assert.equal(await page.locator(".course-card").count(), 0);
    assert.equal((await outcomes())[0].status, "no_matches");
    assert(await page.locator('[data-search-suggestion="ENGR 2040"]').count());
    await page.locator(".results-area").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `${output}/suggestions-${width}-${locale}.png`,
    });
    await page.locator('[data-search-suggestion="2040"]').click();
    await page.waitForFunction(() =>
      document
        .querySelector(".course-code")
        ?.textContent.includes("MECHENG 2040"),
    );
    await visit("MATH 11011");
    assert.equal(await page.locator(".course-card").count(), 0);
    await page.locator('[data-search-suggestion="MATH 1151"]').click();
    await page.waitForFunction(() =>
      document.querySelector(".course-code")?.textContent.includes("MATH 1151"),
    );
    await visit("PHILOS 2465", "&subject=MATH&campus=all");
    assert.equal(await page.locator(".course-card").count(), 0);
    assert.equal((await outcomes())[0].status, "filter_conflict");
    await page
      .getByRole("button", {
        name: locale === "zh" ? "移除学科筛选" : "Remove subject filter",
      })
      .click();
    await page.waitForFunction(() =>
      document
        .querySelector(".course-code")
        ?.textContent.includes("PHILOS 2465"),
    );
    assert.equal(new URL(page.url()).searchParams.get("campus"), "all");
    await page.goto(`${base}/?q=offline&term=1272`, {
      waitUntil: "networkidle",
    });
    await page.locator(".error-state").waitFor();
    assert.equal((await outcomes())[0].status, "error");
    assert.deepEqual(errors, []);
    console.log(
      `PASS search ${width}px ${locale}: real transport, shared keywords, subject names, prefixes, suggestions, filters, pagination and browser Back`,
    );
    await context.close();
  }
} catch (error) {
  if (active && !active.isClosed()) {
    console.log("Failure URL", active.url());
    await active.screenshot({ path: `${output}/failure.png` });
  }
  throw error;
} finally {
  await browser.close();
}
