import pg from "pg";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { extractSyllabusSections } from "../../src/lib/syllabus/content.ts";
import {
  extractSyllabusSchedule,
  scheduleBlockText,
} from "../../src/lib/syllabus/insights.ts";
// Read-only, bounded batches across every retained version. Never changes source data.
const output = process.argv[2] ?? ".cache/syllabus-schedule-audit.json";
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  statement_timeout: 30000,
});
const report = {
  documents: 0,
  schedules: 0,
  structured: 0,
  sourceFallback: 0,
  items: 0,
  sessions: 0,
  longHeadings: [],
  fallbackExamples: [],
  formats: { table: 0, dated: 0, weekly: 0 },
};
await client.connect();
try {
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  for (let offset = 0; ; offset += 100) {
    const { rows } = await client.query(
      "SELECT data FROM osu_syllabus.document_versions ORDER BY code,snapshot_id,content_hash LIMIT 100 OFFSET $1",
      [offset],
    );
    if (!rows.length) break;
    for (const { data } of rows) {
      report.documents++;
      for (const section of extractSyllabusSections(data).filter(
        (s) => s.category === "schedule",
      )) {
        report.schedules++;
        const schedule = extractSyllabusSchedule(section);
        if (!schedule.items.length) {
          report.sourceFallback++;
          if (report.fallbackExamples.length < 50)
            report.fallbackExamples.push({
              code: data.entry.code,
              title: data.entry.title,
              excerpt: section.text.slice(0, 350),
            });
          continue;
        }
        report.structured++;
        report.items += schedule.items.length;
        report.sessions += schedule.items.reduce(
          (n, item) => n + item.sessions.length,
          0,
        );
        if (/<table/i.test(section.html)) report.formats.table++;
        if (schedule.items.some((i) => i.weekStart !== null))
          report.formats.weekly++;
        if (
          schedule.items.some((i) => i.sessions.length || i.weekStart === null)
        )
          report.formats.dated++;
        for (const item of schedule.items) {
          if (
            item.topic.length > 400 ||
            /(?:Week \d).*(?:Week \d)/i.test(item.topic)
          ) {
            report.longHeadings.push({
              code: data.entry.code,
              title: data.entry.title,
              label: item.label,
              length: item.topic.length,
              excerpt: item.topic.slice(0, 400),
            });
          }
          // Every session block should retain source text; empty date headings stay explicit.
          if (
            item.sessions.some((s) =>
              s.blocks.some((b) => !scheduleBlockText(b)),
            )
          )
            throw new Error("Empty session block");
        }
      }
    }
  }
  await client.query("ROLLBACK");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify({
      ...report,
      longHeadings: report.longHeadings.length,
      fallbackExamples: report.fallbackExamples.length,
      output,
    }),
  );
} finally {
  await client.end();
}
