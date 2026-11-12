import test from "node:test";
import assert from "node:assert/strict";
import { formatSyllabusTime } from "../../src/lib/syllabus/time.ts";

test("official timestamps follow the browser zone with an explicit timezone label", () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    assert.match(
      formatSyllabusTime("2026-11-09T10:11:27.240485-05:00", "en"),
      /10:11.*EST/,
    );
    assert.match(
      formatSyllabusTime("2026-07-09T14:11:27Z", "en"),
      /10:11.*EDT/,
    );
    process.env.TZ = "Asia/Shanghai";
    assert.match(
      formatSyllabusTime("2026-11-09T15:11:27Z", "en"),
      /23:11.*GMT\+8/,
    );
    assert.match(formatSyllabusTime("2026-11-09T15:11:27Z", "zh"), /23:11/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
  assert.equal(formatSyllabusTime(null, "zh"), null);
  assert.equal(formatSyllabusTime("unavailable", "zh"), null);
});
