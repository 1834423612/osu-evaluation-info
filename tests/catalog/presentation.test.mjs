import assert from "node:assert/strict";
import test from "node:test";
import {
  courseAcademicCareers,
  courseAcademicCareerLabel,
  isOnlineMeeting,
} from "../../src/lib/catalog/presentation.ts";

test("combined student levels remain complete in both languages and old saved records", () => {
  const course = { academicCareer: "Undergraduate / Graduate" };
  assert.deepEqual(courseAcademicCareers(course), [
    "Undergraduate",
    "Graduate",
  ]);
  assert.equal(courseAcademicCareerLabel(course, "zh"), "本科生 / 研究生");
  assert.equal(
    courseAcademicCareerLabel(course, "en"),
    "Undergraduate / Graduate",
  );
  assert.equal(
    courseAcademicCareerLabel(
      {
        ...course,
        academicCareers: [
          "Undergraduate",
          "Graduate",
          "Undergraduate / Graduate",
        ],
      },
      "zh",
    ),
    "本科生 / 研究生",
  );
  assert.equal(
    courseAcademicCareerLabel({ academicCareer: "Graduate" }, "zh"),
    "研究生",
  );
  assert.equal(
    courseAcademicCareerLabel({ academicCareer: "Other level" }, "zh"),
    "Other level",
  );
});

test("online presentation requires explicit instruction-mode or location evidence", () => {
  assert.equal(isOnlineMeeting({ location: "Online" }), true);
  assert.equal(isOnlineMeeting(undefined, "Distance Learning"), true);
  assert.equal(isOnlineMeeting({ location: null }, "Online"), true);
  assert.equal(isOnlineMeeting({ location: "Smith Lab" }, "In Person"), false);
  assert.equal(isOnlineMeeting({ location: null }), false);
  assert.equal(isOnlineMeeting(undefined, "Distance Enhanced"), false);
});
