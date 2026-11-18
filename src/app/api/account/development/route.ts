import { z } from "zod";
import { accountSession } from "@/lib/auth/server";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { getDatabasePool } from "@/lib/db";
import { userDataTable as table } from "@/lib/user-data/namespace";
import {
  developmentStatus,
  issueDevelopmentGrant,
  bindDevelopment,
  pullDevelopment,
  previewProductionMerge,
  pushProductionMerge,
  pairingSchema,
} from "@/lib/development/server";
export const runtime = "nodejs";
export const maxDuration = 60;
const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue") }),
  z.object({ action: z.literal("revoke"), id: z.uuid() }),
  z.object({ action: z.literal("bind"), pairing: pairingSchema }),
  z.object({ action: z.literal("pull") }),
  z.object({ action: z.literal("preview") }),
  z.object({
    action: z.literal("push"),
    preview: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("disconnect") }),
]);
async function account(request: Request) {
  const session = await accountSession(request.headers);
  if (!session?.user.emailVerified)
    throw new UserDataError("unauthorized", 401);
  return session.user;
}
export async function GET(request: Request) {
  return userRoute(async () =>
    userJson(await developmentStatus((await account(request)).id)),
  );
}
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const user = await account(request),
      input = await readJson(request, inputSchema, 4096);
    if (input.action === "issue")
      return userJson(await issueDevelopmentGrant(user.id, user.name));
    if (input.action === "revoke") {
      await getDatabasePool().query(
        `UPDATE ${table("development_grant")} SET revoked_at=now() WHERE id=$1 AND account_id=$2`,
        [input.id, user.id],
      );
      return userJson({ revoked: true });
    }
    if (process.env.NODE_ENV === "production")
      throw new UserDataError("development_only", 403);
    if (input.action === "bind")
      return userJson(await bindDevelopment(user.id, input.pairing));
    if (input.action === "pull")
      return userJson(await pullDevelopment(user.id));
    if (input.action === "preview") {
      const result = await previewProductionMerge(user.id);
      return userJson({
        preview: result.preview,
        conflicts: result.conflicts,
        calendars: result.value.planning?.schedule.calendars?.length ?? 0,
        favorites: result.value.favorites.length,
        documents: result.value.planning?.documents.length ?? 0,
      });
    }
    if (input.action === "push")
      return userJson(await pushProductionMerge(user.id, input.preview));
    await getDatabasePool().query(
      `DELETE FROM ${table("development_link")} WHERE account_id=$1`,
      [user.id],
    );
    return userJson({ disconnected: true });
  });
}
