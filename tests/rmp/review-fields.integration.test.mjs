import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";
import { COURSE_SQL, REVIEW_PAGE_SQL } from "../../src/lib/rmp/queries.ts";
import { LIBRARY_REVIEWS_SQL } from "../../src/lib/rmp/library-queries.ts";

test(
  "course previews, pagination and faculty pages preserve all stored review facts",
  {
    skip:
      process.env.RMP_INTEGRATION_TESTS !== "1" || !process.env.DATABASE_URL,
    timeout: 60000,
  },
  async () => {
    const c = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      statement_timeout: 20000,
    });
    await c.connect();
    try {
      await c.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const summary = await c.query(COURSE_SQL, [
        [],
        "MNS",
        "MATH1151",
        "2024-11-13",
        true,
        true,
      ]);
      const previews = summary.rows.flatMap((p) => p.reviews);
      assert(previews.length > 0);
      const profile = summary.rows.find((p) => p.review_count > 0);
      const page = (
        await c.query(REVIEW_PAGE_SQL, [
          [],
          "MNS",
          "MATH1151",
          6,
          profile.professor_id,
          0,
          true,
        ])
      ).rows[0].reviews;
      const library = (
        await c.query(LIBRARY_REVIEWS_SQL, [profile.professor_id, null, 12, 0])
      ).rows[0].reviews;
      const reviews = [...previews, ...page, ...library];
      const rows = await c.query(
        `SELECT legacy_id::text id,helpful_rating::float8,clarity_rating::float8,grade,attendance_mandatory,textbook_use,
      is_for_online_class,is_for_credit,thumbs_up_total,thumbs_down_total,would_take_again,teacher_note,comment
      FROM osu_rmp.review WHERE legacy_id=ANY($1::bigint[])`,
        [reviews.map((r) => r.id)],
      );
      const source = new Map(rows.rows.map((r) => [r.id, r]));
      const fields = {
        helpfulness: "helpful_rating",
        clarity: "clarity_rating",
        grade: "grade",
        attendance: "attendance_mandatory",
        textbook: "textbook_use",
        online: "is_for_online_class",
        forCredit: "is_for_credit",
        thumbsUp: "thumbs_up_total",
        thumbsDown: "thumbs_down_total",
        wouldTakeAgain: "would_take_again",
        comment: "comment",
      };
      for (const review of reviews) {
        const raw = source.get(review.id);
        for (const [field, column] of Object.entries(fields))
          assert.equal(review[field], raw[column], `${review.id}/${field}`);
        assert.deepEqual(
          review.teacherReply,
          raw.teacher_note?.comment
            ? {
                comment: raw.teacher_note.comment,
                date: raw.teacher_note.createdAt ?? null,
              }
            : null,
        );
      }
      assert(reviews.some((r) => r.thumbsUp === 0 || r.thumbsDown === 0));
      assert(
        reviews.some(
          (r) =>
            r.online === false ||
            r.forCredit === false ||
            r.wouldTakeAgain === false,
        ),
      );
      await c.query("ROLLBACK");
    } finally {
      await c.end();
    }
  },
);
