import {
  authConfigured,
  mailConfigured,
  authTablePrefix,
  authSchema,
} from "@/lib/auth/config";
import { getAuthPool } from "@/lib/auth/database";
import { userDataTable } from "@/lib/user-data/namespace";
import { userJson } from "@/lib/user-data/http";
import { accountStatus } from "@/lib/auth/status";
export const runtime = "nodejs";
export async function GET() {
  let tables: boolean[] = [];
  if (authConfigured())
    try {
      const result = await getAuthPool().query<{ present: boolean }>(
        "SELECT to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) WITH ORDINALITY AS names(name, position) ORDER BY position",
        [
          [
            authSchema() + "." + authTablePrefix() + "user",
            userDataTable("policy_acceptance"),
            userDataTable("institutional_email"),
            userDataTable("public_profile"),
          ],
        ],
      );
      tables = result.rows.map((row) => row.present);
    } catch {}
  return userJson(accountStatus(tables, mailConfigured()));
}
