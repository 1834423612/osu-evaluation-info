import test from "node:test";
import assert from "node:assert/strict";
import { formatSyllabusTime } from "../../src/lib/syllabus/time.ts";

test("official timestamps keep the exact minute and OSU daylight-saving offset", () => {
  assert.match(
    formatSyllabusTime("2026-11-09T10:11:27.240485-05:00", "en"),
    /10:11.*EST/,
  );
  assert.match(formatSyllabusTime("2026-07-09T14:11:27Z", "en"), /10:11.*EDT/);
  assert.match(formatSyllabusTime("2026-11-09T15:11:27Z", "zh"), /10:11/);
  assert.equal(formatSyllabusTime(null, "zh"), null);
  assert.equal(formatSyllabusTime("unavailable", "zh"), null);
});
