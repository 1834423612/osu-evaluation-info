import { z } from "zod";
import { authSchema, authTablePrefix } from "./config.ts";
import { getAuthPool } from "./database.ts";

export type RoleQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: Record<string, unknown>[] }>;
const defaultQuery: RoleQuery = (sql, values) =>
  getAuthPool().query(sql, values);
export function adminRoleSchema(env: NodeJS.ProcessEnv = process.env) {
  const schema = authSchema(env);
  if (env.NODE_ENV !== "production" && schema === "osu_identity")
    throw Error("Development admin roles cannot access production identity");
  return schema;
}
export function adminRolesSQL(
  sql: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  return sql
    .replaceAll(
      'osu_identity."user"',
      `osu_identity."${authTablePrefix(env)}user"`,
    )
    .replace(
      /\b(account_role_audit|account_role|admin_role_guard|protect_admin_role_truncate|protect_admin_role|audit_admin_role|protect_admin_audit|change_admin_role)\b/g,
      (name) => authTablePrefix(env) + name,
    )
    .replace(/\bosu_identity\b/g, `"${adminRoleSchema(env)}"`);
}
const table = (name: string, env: NodeJS.ProcessEnv) =>
  `"${adminRoleSchema(env)}"."${authTablePrefix(env)}${name}"`;
export const adminRoleInput = z.object({
  userId: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[^\u0000-\u001f]+$/),
  action: z.enum(["grant", "revoke"]),
  reason: z.string().trim().min(8).max(500),
});
/** No role cache: database revocations apply on the next request. */
export async function hasAdminRole(
  userId: string,
  query: RoleQuery = defaultQuery,
  env: NodeJS.ProcessEnv = process.env,
) {
  const result = await query(
    `SELECT 1 FROM ${table("account_role", env)} r JOIN ${table("user",env)} u ON u.id=r.user_id WHERE r.user_id=$1 AND r.role='admin' AND u."emailVerified"=true`,
    [userId],
  );
  return result.rows.length > 0;
}
export async function changeAdminRole(
  query: RoleQuery,
  raw: z.infer<typeof adminRoleInput>,
  access: { actor: string; userId: string | null },
  env: NodeJS.ProcessEnv = process.env,
) {
  const input = adminRoleInput.parse(raw);
  if (access.actor.length < 3 || access.actor.length > 200)
    throw Error("Invalid administrator actor");
  const result = await query(
    `SELECT ${table("change_admin_role", env)}($1,$2,$3,$4,$5) AS changed`,
    [input.userId, input.action, access.actor, input.reason, access.userId],
  );
  return { changed: result.rows[0]?.changed === true };
}
export async function listAdminUsers(
  query: RoleQuery = defaultQuery,
  { search = "", page = 1 }: { search?: string; page?: number } = {},
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    search.length > 100 ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 10000
  )
    throw Error("Invalid user search");
  const users = table("user", env),
    roles = table("account_role", env);
  const parameters = [search, (page - 1) * 25];
  const condition = `($1='' OR strpos(lower(u.email),lower($1))>0 OR strpos(lower(u.name),lower($1))>0 OR u.id=$1)`;
  const result = await query(
    `SELECT u.id,u.name,u.email,u."emailVerified" AS verified,u."createdAt" AS created_at,EXISTS(SELECT 1 FROM ${roles} r WHERE r.user_id=u.id AND r.role='admin') AS admin FROM ${users} u WHERE ${condition} ORDER BY u."createdAt" DESC,u.id LIMIT 25 OFFSET $2`,
    parameters,
  );
  const count = await query(
    `SELECT count(*)::int AS total FROM ${users} u WHERE ${condition}`,
    [search],
  );
  return {
    items: result.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ""),
      email: String(row.email ?? ""),
      verified: row.verified === true,
      createdAt:
        row.created_at instanceof Date
          ? row.created_at.toISOString()
          : String(row.created_at),
      admin: row.admin === true,
    })),
    page,
    total: Number(count.rows[0]?.total ?? 0),
    pageSize: 25,
  };
}
export async function listAdminRoleAudit(
  query: RoleQuery = defaultQuery,
  page = 1,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!Number.isInteger(page) || page < 1 || page > 10000)
    throw Error("Invalid audit page");
  const result = await query(
    `SELECT id::text,target_user_id,action,actor,reason,created_at FROM ${table("account_role_audit", env)} ORDER BY id DESC LIMIT 25 OFFSET $1`,
    [(page - 1) * 25],
  );
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.target_user_id),
    action: String(row.action),
    actor: String(row.actor),
    reason: String(row.reason),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at),
  }));
}
