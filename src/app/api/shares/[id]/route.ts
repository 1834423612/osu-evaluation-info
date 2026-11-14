import { z } from "zod";
import { actorFor } from "@/lib/user-data/principal";
import { readShare, shareIdSchema, manageShare } from "@/lib/user-data/sharing";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return userRoute(async () => {
    const id = shareIdSchema.parse((await context.params).id),
      row = await readShare(id);
    return userJson({
      id: row.id,
      snapshot: row.snapshot,
      visibility: row.visibility,
      expiresAt: row.expires_at,
    });
  });
}
export async function POST(request: Request, context: Context) {
  return userRoute(async () => {
    sameOrigin(request);
    const id = shareIdSchema.parse((await context.params).id),
      input = await readJson(
        request,
        z.object({
          action: z.enum(["revoke", "rotate", "copy"]),
          management: z
            .string()
            .regex(/^[A-Za-z0-9_-]{43}$/)
            .optional(),
        }),
        2048,
      ),
      actor = await actorFor(request);
    return userJson(
      await manageShare(actor, id, input.action, input.management),
    );
  });
}
