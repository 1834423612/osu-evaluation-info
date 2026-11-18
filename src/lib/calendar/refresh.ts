import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { readPlanningBackup, writePlanningBackup } from "../planning/cloud.ts";
import { checkBudget } from "../user-data/rate-limit.ts";
import { calendarSchema, type UserCalendar } from "./model.ts";
import { readRemoteCalendar } from "./remote.ts";
import { parseCalendar } from "./ical.ts";
const stale = (calendar: UserCalendar) =>
  calendar.kind === "feed" &&
  calendar.feedUrl &&
  (!calendar.refreshedAt ||
    !Number.isFinite(Date.parse(calendar.refreshedAt)) ||
    Date.now() - Date.parse(calendar.refreshedAt) > 3600000);
/** A database lease bounds public-feed refreshes; source credentials never leave this server. */
export async function refreshStoredFeeds(
  owner: string,
  selected: string[],
  all: UserCalendar[],
  read = readRemoteCalendar,
) {
  const involved = new Set<string>();
  function visit(id: string) {
    if (involved.has(id)) return;
    involved.add(id);
    all.find((calendar) => calendar.id === id)?.sourceIds.forEach(visit);
  }
  selected.forEach(visit);
  const feeds = all
    .filter((calendar) => involved.has(calendar.id) && stale(calendar))
    .slice(0, 2);
  await Promise.allSettled(
    feeds.map(async (calendar) => {
      const claimed = await getDatabasePool().query(
        `UPDATE ${table("calendar")} SET refresh_after=now()+interval '15 minutes' WHERE owner_id=$1 AND id=$2 AND refresh_after<now() RETURNING data`,
        [owner, calendar.id],
      );
      if (!claimed.rows.length) return;
      const source = calendarSchema.parse(claimed.rows[0].data);
      if (!stale(source) || !source.feedUrl) return;
      await checkBudget("calendar-feed-refresh", owner, 3600, 20);
      const events = await parseCalendar(await read(source.feedUrl));
      for (let attempt = 0; attempt < 2; attempt++) {
        const backup = await readPlanningBackup(owner),
          live = backup.plan?.schedule.calendars?.find(
            (item) => item.id === calendar.id,
          );
        if (!backup.plan || !live || live.feedUrl !== source.feedUrl) return;
        const updated = calendarSchema.parse({
          ...live,
          events,
          refreshedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        try {
          await writePlanningBackup(owner, backup.version, {
            ...backup.plan,
            schedule: {
              ...backup.plan.schedule,
              calendars: backup.plan.schedule.calendars?.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            },
          });
          return;
        } catch (error) {
          if (
            !(error instanceof Error) ||
            !("code" in error) ||
            error.code !== "planning_conflict" ||
            attempt
          )
            throw error;
        }
      }
    }),
  );
  if (!feeds.length) return all;
  const rows = await getDatabasePool().query(
    `SELECT data FROM ${table("calendar")} WHERE owner_id=$1`,
    [owner],
  );
  return rows.rows.map((row) => calendarSchema.parse(row.data));
}
