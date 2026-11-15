import {
  authConfigured,
  mailConfigured,
  authTablePrefix,
} from "@/lib/auth/config";
import { queryDatabase } from "@/lib/db";
import { userJson } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET() {
  let ready = false;
  if (authConfigured())
    try {
      const result = await queryDatabase<{ ready: boolean }>(
        "SELECT to_regclass($1) IS NOT NULL AS ready",
        [authTablePrefix() + "user"],
      );
      ready = result.rows[0].ready;
    } catch {}
  return userJson({
    enabled: ready,
    email: ready && mailConfigured(),
    passkey: ready,
  });
}
