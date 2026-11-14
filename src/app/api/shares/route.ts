import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  createShare,
  listShares,
  shareCreateSchema,
} from "@/lib/user-data/sharing";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    const actor = await actorFor(request);
    return userJson({ shares: await listShares(actor.owners) });
  });
}
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const input = await readJson(request, shareCreateSchema, 1048576),
      actor = await actorFor(request, true),
      created = await createShare(actor, input);
    return actorResponse(userJson(created, 201), actor);
  });
}
