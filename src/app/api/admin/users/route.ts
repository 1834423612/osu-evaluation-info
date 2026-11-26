import { z } from "zod";
import { authorizeAdminRequest, assertAdminOrigin } from "@/lib/auth/admin";
import {
  adminRoleSchema,
  adminRoleInput,
  listAdminUsers,
  listAdminRoleAudit,
  changeAdminRole,
} from "@/lib/auth/admin-roles";
import { getAuthPool } from "@/lib/auth/database";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
const filters = z.object({
  search: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  auditPage: z.coerce.number().int().min(1).max(10000).default(1),
});
async function authorize(request: Request) {
  const access = await authorizeAdminRequest(request);
  adminRoleSchema();
  if (!access.development)
    await checkBudget(access.actor, "admin-users", 60, 120);
  return access;
}
export async function GET(request: Request) {
  return userRoute(async () => {
    const access = await authorize(request);
    const input = filters.parse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    const pool = getAuthPool();
    const query = (sql: string, values?: unknown[]) => pool.query(sql, values);
    const [users, audit] = await Promise.all([
      listAdminUsers(query, input),
      listAdminRoleAudit(query, input.auditPage),
    ]);
    return userJson({ ...users, audit, development: access.development });
  });
}
export async function POST(request: Request) {
  return userRoute(async () => {
    const access = await authorize(request);
    assertAdminOrigin(request, access);
    if (!access.development && !access.userId)
      throw new UserDataError("forbidden", 403);
    const input = await readJson(request, adminRoleInput, 4096);
    const pool = getAuthPool();
    try {
      return userJson(
        await changeAdminRole((sql, values) => pool.query(sql, values), input, {
          actor: access.actor,
          userId: access.userId ?? null,
        }),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("LAST_ADMIN"))
        throw new UserDataError("last_admin", 409);
      if (message.includes("ADMIN_ROLE_UNVERIFIED"))
        throw new UserDataError("email_unverified", 409);
      if (message.includes("ADMIN_ROLE_FORBIDDEN"))
        throw new UserDataError("forbidden", 403);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "23503"
      )
        throw new UserDataError("not_found", 404);
      throw error;
    }
  });
}
