import { z } from "zod";
import { planSchema } from "../planning/model.ts";
import { syncItemSchema, syncItemKey } from "../sync/items.ts";
import { sameItem } from "../sync/protocol.ts";
export const accountSnapshotSchema = z.object({
  accountId: z.string().min(1).max(100),
  label: z.string().max(80).optional(),
  planningVersion: z.number().int().nonnegative(),
  cursor: z.number().int().nonnegative(),
  planning: planSchema.nullable(),
  favorites: z.array(syncItemSchema).max(1000),
});
export type AccountSnapshot = z.infer<typeof accountSnapshotSchema>;
export type AccountContent = Pick<AccountSnapshot, "planning" | "favorites">;
export const content = (snapshot: AccountSnapshot): AccountContent => ({
  planning: snapshot.planning,
  favorites: snapshot.favorites,
});
function identity(value: unknown, field: string): string | null {
  if (typeof value === "string" || typeof value === "number")
    return JSON.stringify(value);
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (field === "favorites") return syncItemKey(syncItemSchema.parse(value));
  if (field === "semesters")
    return JSON.stringify([row.documentId, row.term, row.creditOrigin]);
  if (field === "allocations")
    return JSON.stringify([row.courseId, row.requirementId]);
  return typeof row.id === "string"
    ? row.id
    : typeof row.courseId === "string"
      ? row.courseId
      : null;
}
/** A three-way merge never promotes a competing scalar edit without review. */
export function mergeAccountContent(
  base: AccountContent,
  local: AccountContent,
  remote: AccountContent,
) {
  const conflicts: string[] = [];
  function merge(
    before: unknown,
    left: unknown,
    right: unknown,
    path: string,
    field: string,
  ): unknown {
    if (sameItem(left, before)) return right;
    if (sameItem(right, before) || sameItem(left, right)) return left;
    if (Array.isArray(left) && Array.isArray(right)) {
      const rows = [
        ...(Array.isArray(before) ? before : []),
        ...left,
        ...right,
      ];
      if (rows.every((value) => identity(value, field) !== null)) {
        const index = (values: unknown[]) =>
          new Map(values.map((value) => [identity(value, field)!, value]));
        const b = index(Array.isArray(before) ? before : []),
          l = index(left),
          r = index(right);
        return [...new Set([...l.keys(), ...r.keys()])].flatMap((id) => {
          const value = merge(
            b.get(id),
            l.get(id),
            r.get(id),
            `${path}[${id}]`,
            field,
          );
          return value === undefined ? [] : [value];
        });
      }
    } else if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object"
    ) {
      const b = (before ?? {}) as Record<string, unknown>,
        l = left as Record<string, unknown>,
        r = right as Record<string, unknown>;
      return Object.fromEntries(
        [...new Set([...Object.keys(l), ...Object.keys(r)])].flatMap((key) => {
          const value = merge(b[key], l[key], r[key], path + "." + key, key);
          return value === undefined ? [] : [[key, value]];
        }),
      );
    }
    conflicts.push(path);
    return left;
  }
  const proposed = merge(base, local, remote, "account", "") as AccountContent;
  const parsed = accountSnapshotSchema
    .pick({ planning: true, favorites: true })
    .safeParse(proposed);
  if (!parsed.success) {
    conflicts.push("account.references");
    return { value: local, conflicts: [...new Set(conflicts)].slice(0, 100) };
  }
  return {
    value: parsed.data,
    conflicts: [...new Set(conflicts)].slice(0, 100),
  };
}
