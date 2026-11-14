import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ?? "playwright"
);
const base = process.env.RMP_TEST_BASE_URL ?? "http://localhost:3000";
const output = process.env.RMP_TEST_OUTPUT ?? "/tmp/osu-rmp-period-layout";
await mkdir(output, { recursive: true });
const names = {
  current: "Alexandria Charlotte Montgomery-Sutherland",
  pending: "Jordan Ellis",
  historical: "Taylor Morgan",
  past: "Elliot Past",
};
const usernames = {
  current: "montgomery-sutherland.123456",
  historical: "morgan-long-family-name.123456",
  past: "past.45",
};
const review = (id) => ({
  id: `${id}01`,
  date: "2026-11-01",
  quality: 4.5,
  helpfulness: 4,
  clarity: 5,
  difficulty: 2,
  wouldTakeAgain: true,
  comment:
    "Clear explanations and useful feedback. Weekly assignments helped me understand the course.",
  tags: ["Gives good feedback", "Accessible outside class"],
  grade: "A-",
  attendance: "mandatory",
  textbook: "5",
  online: false,
  forCredit: true,
  thumbsUp: 125,
  thumbsDown: 8,
  teacherReply: null,
});
const profile = (id, name, username, association) => ({
  professorId: id,
  name,
  nameDotNumber: username,
  association,
  profileUrl: `https://www.ratemyprofessors.com/professor/${id}`,
  reviewCount: 1,
  recentReviewCount: 1,
  recentQuality: 4.5,
  recentDifficulty: 2,
  recentQualityCount: 1,
  recentDifficultyCount: 1,
  historicalQuality: 4.5,
  historicalQualityCount: 1,
  historicalDifficulty: 2,
  historicalDifficultyCount: 1,
  latestReviewDate: "2026-11-01",
  reviews: [review(id)],
  topTags: [
    { tag: "Accessible outside the classroom and office hours", count: 12 },
    { tag: "Caring", count: 7 },
    { tag: "Lots of homework", count: 6 },
  ],
});
const instructors = [
  profile("1001", names.current, usernames.current, "verified"),
  {
    ...profile("1002", names.pending, null, "unconfirmed"),
    recentQuality: null,
    recentQualityCount: 0,
    recentReviewCount: 0,
    historicalQuality: 4.6,
  },
  profile("1003", names.historical, usernames.historical, "unconfirmed"),
  profile("1004", names.past, usernames.past, "verified"),
];
const course = {
  id: "1272-MATH-1131-MNS",
  courseId: "001234",
  subject: "MATH",
  subjectName: "Mathematics",
  catalogNumber: "1131",
  title: "Calculus for Business",
  description: "Business calculus.",
  creditsMin: 5,
  creditsMax: 5,
  campus: "Mansfield",
  campusCode: "MNS",
  term: "Spring 2027",
  termCode: "1272",
  academicCareer: "Undergraduate",
  attributes: [],
  sectionsPartial: false,
  sections: [
    {
      id: "12345",
      classNumber: "12345",
      section: "0010",
      component: "Lecture",
      instructionMode: "In Person",
      enrollmentStatus: "",
      enrollmentTotal: null,
      waitlistTotal: null,
      session: "Full Term",
      sessionCode: "1",
      meetings: [],
      instructors: [
        { name: names.current, email: `${usernames.current}@osu.edu` },
        { name: names.pending, email: null },
      ],
    },
  ],
};
const summary = {
  status: "available",
  instructors,
  requestedInstructorCount: 1,
  matchedInstructorCount: 2,
  recentSince: "2024-11-13",
  refreshedAt: "2026-11-13T12:00:00Z",
};
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  args: ["--no-sandbox"],
});
let active;
async function geometry(card) {
  const result = await card.evaluate((el) => {
    const rect = (node) => node.getBoundingClientRect();
    const overlaps = (nodes) => {
      const boxes = [...nodes].map(rect).filter((r) => r.width && r.height);
      return boxes.some((a, i) =>
        boxes
          .slice(i + 1)
          .some(
            (b) =>
              Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 &&
              Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1,
          ),
      );
    };
    const status = el.querySelector("[data-rmp-identity-status]");
    const heading = el.querySelector("[data-rmp-heading]");
    const toggle = el.querySelector("[data-rmp-summary-toggle]");
    const tags = el.querySelector("ul");
    return {
      statusOverlap: overlaps(status.children),
      headingOverlap: overlaps(heading.children),
      summaryOverlap: overlaps(toggle.children),
      overflow: el.scrollWidth > el.clientWidth + 1,
      tagIndent: tags ? Math.abs(rect(tags).left - rect(heading).left) : 0,
    };
  });
  assert.equal(result.statusOverlap, false);
  assert.equal(result.headingOverlap, false);
  assert.equal(result.summaryOverlap, false);
  assert.equal(result.overflow, false);
  assert(result.tagIndent < 1);
}
try {
  for (const locale of ["zh", "en"]) {
    for (const width of [320, 390, 480, 768, 1440]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        isMobile: width < 700,
        hasTouch: width < 700,
        reducedMotion: "reduce",
      });
      await context.addInitScript(
        ({ course, locale }) => {
          localStorage.setItem("course-atlas:locale:v1", locale);
          localStorage.setItem("course-atlas:translation-guide:v1", "done");
          localStorage.setItem(
            "course-atlas:saved:v1",
            JSON.stringify([course]),
          );
        },
        { course, locale },
      );
      const page = await context.newPage();
      active = page;
      page.setDefaultTimeout(30000);
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/api/**", (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/api/rmp/course")
          return route.fulfill({ json: summary });
        if (url.pathname === "/api/catalog/course")
          return route.fulfill({
            json: {
              course,
              sourceMode: "official",
              complete: true,
              fetchedAt: new Date().toISOString(),
              source: "fixture",
            },
          });
        if (url.pathname === "/api/people/lookup") {
          const term = route.request().postDataJSON().term;
          const key = Object.keys(usernames).find(
            (key) => usernames[key] === term,
          );
          return route.fulfill({
            json: {
              status: "available",
              source: "osu-search",
              cache: "source",
              verifiedAt: new Date().toISOString(),
              results: key
                ? [
                    {
                      name: names[key],
                      roles: ["professor"],
                      appointments: [
                        {
                          title: "Professor and Academic Program Coordinator",
                          organization: "Mathematics",
                        },
                      ],
                    },
                  ]
                : [],
            },
          });
        }
        if (
          url.pathname === "/api/rmp/summaries" ||
          url.pathname === "/api/evaluations"
        )
          return route.fulfill({ json: { summaries: {} } });
        if (url.pathname === "/api/syllabus")
          return route.fulfill({
            json: {
              data: [],
              source: "official-relay",
              fetchedAt: new Date().toISOString(),
            },
          });
        if (url.pathname === "/api/instructors/photo")
          return route.fulfill({ status: 404, body: "" });
        if (url.pathname === "/api/build-info") return route.continue();
        return route.fulfill({
          json: {
            status: "no-data",
            instructors: [],
            metrics: [],
            primary: null,
            results: [],
            source: {},
          },
        });
      });
      await page.goto(base + "/saved", { waitUntil: "networkidle" });
      await page.locator('[data-analytics-action="course_open"]').click();
      await page
        .getByRole("tab", {
          name: locale === "zh" ? "教学评价与趋势" : "Evaluations & trends",
          exact: true,
        })
        .click();
      await page
        .getByRole("tab", {
          name: locale === "zh" ? "RMP · 学生评论" : "RMP · student reviews",
          exact: true,
        })
        .click();
      const panel = page.locator('[data-analytics-area="rmp_reviews"]');
      const periods = panel.getByRole("tablist", {
        name: locale === "zh" ? "RMP 教师分区" : "RMP instructor groups",
      });
      const current = periods.getByRole("tab").nth(0),
        history = periods.getByRole("tab").nth(1);
      assert.equal(await current.getAttribute("aria-selected"), "true");
      assert((await current.innerText()).includes("2"));
      assert((await history.innerText()).includes("2"));
      const verified = panel.locator('[data-professor-id="1001"]'),
        pending = panel.locator('[data-professor-id="1002"]');
      await pending.waitFor();
      assert((await pending.innerText()).includes("4.60 / 5"));
      assert.equal(
        await panel.locator('[data-professor-id="1003"]').count(),
        0,
      );
      const role = verified.locator("[data-directory-role-trigger]");
      await role.click();
      await verified
        .locator('[data-directory-role-trigger][data-role="professor"]')
        .waitFor();
      await page.keyboard.press("Escape");
      const email = verified.locator(
        '[data-analytics-action="instructor_email_reveal"]',
      );
      await email.click();
      assert.equal(await email.getAttribute("aria-pressed"), "true");
      assert(
        (await email.innerText()).includes(usernames.current + "@osu.edu"),
      );
      await geometry(verified);
      await geometry(pending);
      await periods.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/current-${locale}-${width}.png`,
      });
      await pending
        .getByRole("button", {
          name:
            locale === "zh"
              ? `查看 ${names.pending} 的评论`
              : `View ${names.pending}'s reviews`,
          exact: true,
        })
        .click();
      const details = pending.locator("[data-rmp-review-details]");
      await details.scrollIntoViewIfNeeded();
      const button = await details.boundingBox();
      assert(button.height >= 32);
      const css = await details.evaluate((el) => ({
        border: getComputedStyle(el).borderTopStyle,
        font: parseFloat(getComputedStyle(el).fontSize),
      }));
      assert.equal(css.border, "solid");
      assert(css.font >= 11);
      await details.focus();
      await page.keyboard.press("Enter");
      assert(await pending.locator("details[open] dl").isVisible());
      const feedback = pending.getByRole("group", {
        name:
          locale === "zh"
            ? "RMP 原站反馈（只读）"
            : "Feedback recorded on RMP (read only)",
      });
      assert.equal(await feedback.locator("button,a,input").count(), 0);
      await page.screenshot({
        path: `${output}/details-${locale}-${width}.png`,
      });
      await history.click();
      const past = panel.locator('[data-professor-id="1003"]');
      await past.waitFor();
      assert(
        (await past.innerText()).includes(
          locale === "zh" ? "任课关联待确认" : "Teaching link unconfirmed",
        ),
      );
      await past
        .locator('[data-analytics-action="instructor_email_reveal"]')
        .click();
      await geometry(past);
      await geometry(panel.locator('[data-professor-id="1004"]'));
      await periods.scrollIntoViewIfNeeded();
      await page.screenshot({
        path: `${output}/history-${locale}-${width}.png`,
      });
      await current.click();
      assert.equal(await current.getAttribute("aria-selected"), "true");
      assert(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      assert.deepEqual(errors, []);
      await context.close();
    }
  }
  console.log(
    "RMP periods and controls: bilingual 320/390/480/768/1440px, unconfirmed scores, long names/emails, non-overlap, directory popovers, keyboard details and read-only feedback passed",
  );
} catch (e) {
  await active?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  throw e;
} finally {
  await browser.close();
}
