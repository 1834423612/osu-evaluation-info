import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { snapshot } from "../user-data/fixtures.mjs";
import { emptyPlan } from "../../src/lib/planning/model.ts";
import { calendarSchema } from "../../src/lib/calendar/model.ts";
test("calendar feeds stay current without exposing private sources, revoke old tokens, and permanent favorite codes renew only on request", async () => {
  process.env.USER_DATA_SCHEMA = "osu_calendar_test";
  process.env.DATABASE_URL = "postgresql://synthetic.invalid/test";
  process.env.USER_DATA_SECRET = "synthetic-calendar-test-secret-000000000000";
  const db = new PGlite();
  const query = async (sql, values) => {
    const result = await db.query(sql, values);
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  global.osuEvaluationPool = {
    query,
    connect: async () => ({ query, release() {} }),
  };
  const { domainSQL } = await import("../../src/lib/user-data/namespace.ts");
  try {
    await db.exec(
      "CREATE SCHEMA osu_planning_dev;CREATE TABLE osu_planning_dev.academic_calendar(data jsonb)",
    );
    for (const file of [
      "20261114_user_data_base.sql",
      "20261114_sharing.sql",
      "20261114_share_requests.sql",
      "20261116_planning.sql",
      "20261117_calendars.sql",
      "20261117_calendar_refresh.sql",
      "20261117_sharing_permanent.sql",
    ])
      await db.exec(
        domainSQL(
          await readFile(
            new URL("../../db/migrations/" + file, import.meta.url),
            "utf8",
          ),
        ),
      );
    const { writePlanningBackup } =
      await import("../../src/lib/planning/cloud.ts");
    const { publishCalendar, publicCalendar } =
      await import("../../src/lib/calendar/sharing.ts");
    const plan = emptyPlan();
    plan.schedule.calendars = [
      calendarSchema.parse({
        id: "calendar-a",
        title: "Synthetic calendar",
        kind: "feed",
        feedUrl: "https://example.edu/private-feed",
        refreshedAt: new Date().toISOString(),
        events: [
          {
            id: "event",
            title: "Synthetic event",
            start: "2027-01-01",
            end: "2027-01-02",
            allDay: true,
            category: "assignment",
          },
        ],
        updatedAt: "2027-01-01",
      }),
    ];
    await writePlanningBackup("account-a", 0, plan);
    const input = {
      calendarIds: ["calendar-a"],
      categories: ["assignment"],
      nickname: "Public nickname",
      expiresIn: 0,
    };
    const link = await publishCalendar("account-a", input);
    assert.equal(link.expiresAt, null);
    const shared = await publicCalendar(link.id, link.token);
    assert.equal(shared.calendars[0].events.length, 1);
    assert.doesNotMatch(
      JSON.stringify(shared),
      /private-feed|account-a|fingerprint|feedUrl/,
    );
    const same = await publishCalendar("account-a", input);
    assert.equal(same.id, link.id);
    assert.equal(same.token, link.token);
    plan.schedule.calendars[0].events[0].title = "Changed event";
    await writePlanningBackup("account-a", 1, plan);
    assert.equal(
      (await publicCalendar(link.id, link.token)).calendars[0].events[0].title,
      "Changed event",
    );
    await query(
      "UPDATE osu_calendar_test.calendar_link SET revoked_at=now() WHERE id=$1",
      [link.id],
    );
    await assert.rejects(publicCalendar(link.id, link.token));
    const replaced = await publishCalendar("account-a", input);
    assert.notEqual(replaced.token, link.token);
    await assert.rejects(publicCalendar(link.id, link.token));
    const { refreshStoredFeeds } =
      await import("../../src/lib/calendar/refresh.ts");
    const refreshPlan = emptyPlan();
    refreshPlan.schedule.calendars = [
      calendarSchema.parse({
        ...plan.schedule.calendars[0],
        refreshedAt: "2020-01-01",
      }),
    ];
    await writePlanningBackup("refresh-owner", 0, refreshPlan);
    let reads = 0;
    const refreshed = await refreshStoredFeeds(
      "refresh-owner",
      ["calendar-a"],
      refreshPlan.schedule.calendars,
      async () => {
        reads++;
        return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:updated\r\nDTSTART;VALUE=DATE:20270111\r\nDTEND;VALUE=DATE:20270112\r\nSUMMARY:Updated subscription\r\nEND:VEVENT\r\nEND:VCALENDAR";
      },
    );
    assert.equal(refreshed[0].events[0].title, "Updated subscription");
    assert.equal(refreshed[0].title, "Synthetic calendar");
    await refreshStoredFeeds(
      "refresh-owner",
      ["calendar-a"],
      refreshPlan.schedule.calendars,
      async () => {
        reads++;
        throw Error("outage");
      },
    );
    assert.equal(reads, 1, "database lease prevents duplicate source reads");
    await query(
      "UPDATE osu_calendar_test.calendar SET refresh_after='-infinity',data=jsonb_set(data,'{refreshedAt}','\"2020-01-01\"') WHERE owner_id='refresh-owner'",
    );
    const kept = await refreshStoredFeeds(
      "refresh-owner",
      ["calendar-a"],
      refreshPlan.schedule.calendars,
      async () => {
        throw Error("outage");
      },
    );
    assert.equal(kept[0].events[0].title, "Updated subscription");
    await query(
      "INSERT INTO osu_calendar_test.principal(id) VALUES('u:account-a')",
    );
    const {
      createShare,
      readShare,
      resolveShareCode,
      manageShare,
      listShares,
    } = await import("../../src/lib/user-data/sharing.ts");
    const actor = { id: "u:account-a", owners: ["u:account-a"] };
    const favorite = await createShare(actor, {
      snapshot,
      visibility: "public",
      expiresIn: 0,
    });
    assert.equal(favorite.expiresAt, null);
    assert.equal((await readShare(favorite.id)).id, favorite.id);
    await query(
      "UPDATE osu_calendar_test.share_code SET expires_at=now()-interval '1 hour' WHERE share_id=$1",
      [favorite.id],
    );
    await assert.rejects(resolveShareCode(favorite.code));
    assert.equal((await listShares(actor.owners)).length, 1);
    const renewed = await manageShare(actor, favorite.id, "renew-code");
    assert.match(renewed.code, /^\d{6}$/);
    assert.equal((await resolveShareCode(renewed.code)).id, favorite.id);
    assert.equal((await listShares(actor.owners)).length, 1);
    assert.equal(
      (await manageShare(actor, favorite.id, "renew-code")).code,
      renewed.code,
    );
    await assert.rejects(
      manageShare(
        { id: "u:other", owners: ["u:other"] },
        favorite.id,
        "renew-code",
      ),
    );
  } finally {
    global.osuEvaluationPool = undefined;
    await db.close();
  }
});
