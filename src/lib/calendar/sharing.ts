import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getDatabasePool } from "../db.ts";
import { userDataTable as table } from "../user-data/namespace.ts";
import { privateDigest, checkBudget } from "../user-data/rate-limit.ts";
import { UserDataError } from "../user-data/http.ts";
import { readPlanningBackup } from "../planning/cloud.ts";
import { combinedEvents, calendarSchema } from "./model.ts";
import { planningTable } from "../planning/namespace.ts";
import { academicForCalendar, academicDaySchema } from "./academic.ts";
import { refreshStoredFeeds } from "./refresh.ts";
export const calendarLinkInput = z.object({
  calendarIds: z.array(z.string().min(1).max(100)).min(1).max(30),
  categories: z
    .array(z.enum(["class", "assignment", "exam", "holiday", "event"]))
    .min(1)
    .max(5),
  nickname: z.string().trim().max(80).default(""),
  expiresIn: z
    .union([
      z.literal(0),
      z.literal(86400),
      z.literal(604800),
      z.literal(2592000),
    ])
    .default(604800),
});
type LinkRow = {
  id: string;
  owner_id: string;
  seed: string;
  calendar_ids: string[];
  categories: string[];
  author: { nickname?: string };
  expires_at: string | null;
};
const token = (row: LinkRow) =>
  Buffer.from(
    privateDigest(`${row.id}:${row.owner_id}:${row.seed}`, "calendar-link"),
    "hex",
  ).toString("base64url");
export async function calendarLinks(owner: string) {
  const result = await getDatabasePool().query(
    `SELECT * FROM ${table("calendar_link")} WHERE owner_id=$1 AND revoked_at IS NULL ORDER BY created_at DESC`,
    [owner],
  );
  return result.rows.map((row: LinkRow) => ({
    id: row.id,
    calendarIds: row.calendar_ids,
    categories: row.categories,
    author: row.author,
    expiresAt: row.expires_at,
    token: token(row),
  }));
}
export async function publishCalendar(
  owner: string,
  input: z.infer<typeof calendarLinkInput>,
) {
  await checkBudget("calendar-publish", owner, 3600, 30);
  const ids = [...new Set(input.calendarIds)].sort(),
    backup = await readPlanningBackup(owner);
  if (
    ids.some((id) => !backup.plan?.schedule.calendars?.some((c) => c.id === id))
  )
    throw new UserDataError("calendar_not_synced", 409);
  const key = privateDigest(JSON.stringify(ids), "calendar-selection");
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "calendar-publish:" + owner,
    ]);
    const capacity = await db.query(
      `SELECT count(*) AS n FROM ${table("calendar_link")} WHERE owner_id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now()) AND selection_key<>$2`,
      [owner, key],
    );
    if (Number(capacity.rows[0].n) >= 50)
      throw new UserDataError("calendar_link_capacity", 409);
    const result = await db.query(
      `INSERT INTO ${table("calendar_link")}(id,owner_id,selection_key,calendar_ids,categories,author,seed,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(owner_id,selection_key) DO UPDATE SET categories=excluded.categories,author=excluded.author,expires_at=excluded.expires_at,seed=CASE WHEN ${table("calendar_link")}.revoked_at IS NULL THEN ${table("calendar_link")}.seed ELSE excluded.seed END,revoked_at=NULL RETURNING *`,
      [
        randomUUID(),
        owner,
        key,
        JSON.stringify(ids),
        JSON.stringify(input.categories),
        JSON.stringify(input.nickname ? { nickname: input.nickname } : {}),
        randomUUID(),
        input.expiresIn ? new Date(Date.now() + input.expiresIn * 1000) : null,
      ],
    );
    const row = result.rows[0] as LinkRow;
    await db.query("COMMIT");
    return { id: row.id, token: token(row), expiresAt: row.expires_at };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
export async function publicCalendar(id: string, provided: string) {
  if (!z.uuid().safeParse(id).success || !/^[A-Za-z0-9_-]{43}$/.test(provided))
    throw new UserDataError("unavailable", 404);
  const row = (
    await getDatabasePool().query(
      `SELECT * FROM ${table("calendar_link")} WHERE id=$1 AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>now())`,
      [id],
    )
  ).rows[0] as LinkRow | undefined;
  if (!row || !timingSafeEqual(Buffer.from(token(row)), Buffer.from(provided)))
    throw new UserDataError("unavailable", 404);
  const rows = await getDatabasePool().query(
    `SELECT data FROM ${table("calendar")} WHERE owner_id=$1`,
    [row.owner_id],
  );
  const all = await refreshStoredFeeds(
    row.owner_id,
    row.calendar_ids,
    rows.rows.map((record) => calendarSchema.parse(record.data)),
  );
  const selected = all.filter((calendar) =>
    row.calendar_ids.includes(calendar.id),
  );
  const academic = selected.some((calendar) => calendar.includeAcademic)
    ? await getDatabasePool().query(
        `SELECT data FROM ${planningTable("academic_calendar")}`,
      )
    : { rows: [] };
  const days = academic.rows.map((record) =>
    academicDaySchema.parse(record.data),
  );
  return {
    id,
    author: row.author,
    expiresAt: row.expires_at,
    calendars: selected.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      icon: c.icon,
      color: c.color,
      includeAcademic: false,
      events: [
        ...combinedEvents(all, c),
        ...academicForCalendar(c, combinedEvents(all, c), days),
      ].filter((e) => row.categories.includes(e.category)),
    })),
  };
}
