import { actorFor } from "@/lib/user-data/principal";
import { readShare, shareReadSchema } from "@/lib/user-data/sharing";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const input = await readJson(request, shareReadSchema, 2048),
      actor = await actorFor(request),
      row = await readShare(input.id, input.capability, actor.owners);
    return userJson({
      id: row.id,
      snapshot: row.snapshot,
      visibility: row.visibility,
      expiresAt: row.expires_at,
    });
  });
}
