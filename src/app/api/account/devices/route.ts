import { networkLocation } from "@/lib/user-data/location";
import { accountSession } from "@/lib/auth/server";
import { getAuthPool } from "@/lib/auth/database";
import { authTablePrefix } from "@/lib/auth/config";
import { userDataTable } from "@/lib/user-data/namespace";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    const session = await accountSession(request.headers);
    if (!session) throw new UserDataError("unauthorized", 401);
    const rows = await getAuthPool().query(
      'SELECT s.id,s."ipAddress" AS ip,s."userAgent" AS agent,s."createdAt",s."updatedAt",v.network_location AS location,v.browser_context AS context FROM "' +
        authTablePrefix() +
        'session" s LEFT JOIN LATERAL(SELECT network_location,browser_context FROM ' +
        userDataTable("visitor_context") +
        ' WHERE account_id=$1 AND host(network_address)=s."ipAddress" AND user_agent=s."userAgent" ORDER BY created_at DESC LIMIT 1)v ON true WHERE s."userId"=$1 ORDER BY s."updatedAt" DESC',
      [session.user.id],
    );
    return userJson({
      devices: await Promise.all(
        rows.rows.map(async (row) => ({
          ...row,
          location: row.location ?? (await networkLocation(row.ip)),
        })),
      ),
    });
  });
}
