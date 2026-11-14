import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

test(
  "published change history distinguishes baselines, additions, edits, returns and term disappearance without volatile noise",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1", timeout: 60000 },
  async () => {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 15000,
    });
    await c.connect();
    const schema = "catalog_changes_test_" + randomUUID().replaceAll("-", "");
    const query = (sql, args) =>
      c.query(sql.replaceAll("osu_catalog", schema), args);
    try {
      for (const f of [
        "db/schemas/catalog.sql",
        "db/migrations/catalog/002-versioned-snapshots.sql",
        "db/migrations/catalog/003-permanent-archive.sql",
        "db/migrations/catalog/004-term-archives.sql",
        "db/migrations/catalog/005-course-changes.sql",
      ])
        await query(
          await readFile(new URL("../../" + f, import.meta.url), "utf8"),
        );
      const teacher = (n) => ({
        email: `teacher.${n}@osu.edu`,
        displayName: `Teacher ${n}`,
        role: "PI",
      });
      const section = (n, people = [teacher(1), teacher(2)]) => ({
        classNumber: n,
        section: "0010",
        status: "A",
        instructionMode: "In Person",
        meetings: [
          {
            monday: true,
            startTime: "10:00",
            endTime: "11:00",
            instructors: people,
          },
        ],
      });
      const course = (id, title, sections, campus = "COL", term = "1268") => ({
        id,
        title,
        sections,
        campus,
        term,
      });
      async function publish(day, terms, courses, complete = true) {
        const id = randomUUID();
        await query(
          `INSERT INTO osu_catalog.sync_runs(id,status,terms,completed_at) VALUES($1,$2,$3,$4)`,
          [
            id,
            complete ? "complete" : "failed",
            JSON.stringify(terms),
            `2026-11-${day}T12:00:00Z`,
          ],
        );
        await query(
          "INSERT INTO osu_catalog.snapshot_versions(run_id,published_at) VALUES($1,$2)",
          [id, complete ? `2026-11-${day}T12:00:00Z` : null],
        );
        for (const x of courses) {
          await query(
            `INSERT INTO osu_catalog.course_snapshots VALUES($1,$2,'1',$3,'MATH',$2,$4,'Text',$5,now(),$6)`,
            [
              x.term,
              x.id,
              x.campus,
              x.title,
              JSON.stringify({
                minUnits: 3,
                maxUnits: 3,
                effectiveDate: day,
                courseAttributes: day === "10" ? ["B", "A"] : ["A", "B"],
              }),
              id,
            ],
          );
          for (const s of x.sections)
            await query(
              `INSERT INTO osu_catalog.section_snapshots VALUES($1,$2,$3,'1',$4,'MATH',$3,$5,now(),$6)`,
              [
                x.term,
                s.classNumber,
                x.id,
                x.campus,
                JSON.stringify({
                  ...s,
                  enrollment: day,
                  minimumEnrollment: day,
                  meetings: s.meetings.map((m) => ({
                    ...m,
                    facilityCapacity: Number(day),
                  })),
                }),
                id,
              ],
            );
        }
        return id;
      }
      const baseline = await publish(
        "10",
        ["1268"],
        [
          course("1151", "Alpha", [section("1")]),
          course("1152", "Removed", [section("2")]),
          course("1151", "Campus unchanged", [section("3")], "MNS"),
        ],
      );
      assert.equal(
        (
          await query("SELECT osu_catalog.capture_course_changes($1) n", [
            baseline,
          ])
        ).rows[0].n,
        0,
      );
      const edited = [
        course("1151", "Beta", [section("1", [teacher(3)]), section("4")]),
        course("1153", "Added", [section("5")]),
        course("1151", "Campus unchanged", [section("3")], "MNS"),
      ];
      const next = await publish(
        "11",
        ["1268", "1272"],
        [
          ...edited,
          course("1151", "New term baseline", [section("10")], "COL", "1272"),
        ],
      );
      assert.equal(
        (await query("SELECT osu_catalog.capture_course_changes($1) n", [next]))
          .rows[0].n,
        3,
      );
      const events = (
        await query(
          "SELECT course_id,campus_code,term_code,kind,fields FROM osu_catalog.course_changes ORDER BY course_id",
        )
      ).rows;
      assert.deepEqual(
        events.map((e) => [e.course_id, e.kind]),
        [
          ["1151", "changed"],
          ["1152", "removed"],
          ["1153", "added"],
        ],
      );
      assert(
        events.every((e) => e.campus_code === "COL" && e.term_code === "1268"),
      );
      assert.deepEqual(events[0].fields, ["sections", "teachers", "title"]);
      assert.equal(
        (await query("SELECT osu_catalog.capture_course_changes($1) n", [next]))
          .rows[0].n,
        0,
      );
      const repeated = await publish(
        "12",
        ["1268"],
        [
          ...edited.map((x) => ({
            ...x,
            sections: x.sections.map((s) => ({
              ...s,
              meetings: [...s.meetings].reverse().map((m) => ({
                ...m,
                instructors: [...m.instructors].reverse(),
              })),
            })),
          })),
          course("1152", "Removed", [section("2")]),
        ],
      );
      assert.equal(
        (
          await query("SELECT osu_catalog.capture_course_changes($1) n", [
            repeated,
          ])
        ).rows[0].n,
        1,
      );
      assert.equal(
        (
          await query(
            "SELECT kind FROM osu_catalog.course_changes WHERE run_id=$1",
            [repeated],
          )
        ).rows[0].kind,
        "restored",
      );
      const rollover = await publish(
        "13",
        ["1272"],
        [course("1151", "New term baseline", [section("10")], "COL", "1272")],
      );
      assert.equal(
        (
          await query("SELECT osu_catalog.capture_course_changes($1) n", [
            rollover,
          ])
        ).rows[0].n,
        0,
      );
      const failed = await publish("14", ["1268"], [], false);
      await assert.rejects(
        query("SELECT osu_catalog.capture_course_changes($1)", [failed]),
        /complete published/,
      );
      assert.equal(
        (await query("SELECT count(*)::int n FROM osu_catalog.course_changes"))
          .rows[0].n,
        4,
      );
      await assert.rejects(
        query("DELETE FROM osu_catalog.course_changes"),
        /append-only/,
      );
      await assert.rejects(
        query("TRUNCATE osu_catalog.course_changes"),
        /append-only/,
      );
    } finally {
      await c.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await c.end();
    }
  },
);
