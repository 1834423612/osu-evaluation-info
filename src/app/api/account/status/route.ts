import {
  authConfigured,
  mailConfigured,
  authTablePrefix,
  authSchema,
} from "@/lib/auth/config";
import { userDataTable } from "@/lib/user-data/namespace";
import { queryDatabase } from "@/lib/db";
import { userJson } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET() {
  let ready = false;
  if (authConfigured())
    try {
      const result = await queryDatabase<{ ready: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AND to_regclass($2) IS NOT NULL AND to_regclass($3) IS NOT NULL AND to_regclass($4) IS NOT NULL AS ready",
        [
          authSchema() + "." + authTablePrefix() + "user",
          userDataTable("policy_acceptance"),
          userDataTable("institutional_email"),
          userDataTable("public_profile"),
        ],
      );
      ready = result.rows[0].ready;
    } catch {}
  return userJson({
    enabled: ready,
    email: ready && mailConfigured(),
    passkey: ready,
  });
}
