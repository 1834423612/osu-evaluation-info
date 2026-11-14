import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  courseSnapshotSchema,
  type ExchangeItem,
  publicSnapshot,
} from "../saved/exchange.ts";
import { pageShareHref } from "../saved/page-link.ts";
import { getDatabasePool, queryDatabase } from "../db.ts";
import { userDataTable as table } from "./namespace.ts";
import { checkBudget } from "./rate-limit.ts";
import { UserDataError } from "./http.ts";
import type { Actor } from "./principal.ts";
export const pageLinkSchema = z.object({
  href: z.string().max(3000),
  title: z.string().trim().min(1).max(200),
  course: courseSnapshotSchema.optional(),
});
export async function createPageLink(actor: Actor, raw: unknown) {
  if (!actor.id) throw new UserDataError("unauthorized", 401);
  const input = pageLinkSchema.parse(raw),
    href = pageShareHref(input.href);
  const params = new URL(href, "https://share.invalid").searchParams;
  if (
    input.course &&
    (params.get("course") !== input.course.id || !href.startsWith("/?"))
  )
    throw new UserDataError("invalid", 400);
  const course = input.course
    ? (
        publicSnapshot({
          version: 1,
          title: "Course",
          createdAt: new Date().toISOString(),
          items: [
            {
              kind: "course",
              payload: {
                ...input.course,
                description: input.course.description.slice(0, 4000),
                sections: [],
                sectionsPartial: true,
              },
            },
          ],
        }).items[0] as Extract<ExchangeItem, { kind: "course" }>
      ).payload
    : null;
  await checkBudget("page-link-create", actor.id, 86400, 200);
  const db = await getDatabasePool().connect();
  try {
    await db.query("BEGIN");
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      "page-link:" + actor.id,
    ]);
    const old = (
      await db.query<{ id: string }>(
        "SELECT id FROM " +
          table("page_link") +
          " WHERE owner_id=$1 AND href=$2",
        [actor.id, href],
      )
    ).rows[0];
    if (old) {
      await db.query("COMMIT");
      return { id: old.id };
    }
    const n = (
      await db.query<{ n: string }>(
        "SELECT count(*) AS n FROM " +
          table("page_link") +
          " WHERE owner_id=$1",
        [actor.id],
      )
    ).rows[0];
    if (Number(n.n) >= 2000) throw new UserDataError("quota", 409);
    const id = randomUUID();
    await db.query(
      "INSERT INTO " +
        table("page_link") +
        "(id,owner_id,href,title,course) VALUES($1,$2,$3,$4,$5::jsonb)",
      [id, actor.id, href, input.title, course ? JSON.stringify(course) : null],
    );
    await db.query("COMMIT");
    return { id };
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function readPageLink(id: string, action?: "preview" | "open") {
  z.uuid().parse(id);
  const row = (
    await queryDatabase<{
      id: string;
      href: string;
      title: string;
      course: Extract<ExchangeItem, { kind: "course" }>["payload"] | null;
    }>(
      "SELECT id,href,title,course FROM " + table("page_link") + " WHERE id=$1",
      [id],
    )
  ).rows[0];
  if (!row) throw new UserDataError("not_found", 404);
  row.href = pageShareHref(row.href);
  if (action)
    await queryDatabase(
      "UPDATE " +
        table("page_link") +
        " SET " +
        (action === "preview" ? "previews" : "opens") +
        "=" +
        (action === "preview" ? "previews" : "opens") +
        "+1 WHERE id=$1",
      [id],
    );
  return row;
}
export async function revokePageLink(actor: Actor, id: string) {
  z.uuid().parse(id);
  const result = await queryDatabase(
    "DELETE FROM " +
      table("page_link") +
      " WHERE id=$1 AND owner_id=ANY($2::text[]) RETURNING id",
    [id, actor.owners],
  );
  if (!result.rows.length) throw new UserDataError("not_found", 404);
}
