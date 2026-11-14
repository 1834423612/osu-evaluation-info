import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  requestTransfer,
  transferRequestSchema,
} from "@/lib/user-data/transfers";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const input = await readJson(request, transferRequestSchema, 1024),
      actor = await actorFor(request, true);
    return actorResponse(userJson(await requestTransfer(actor, input)), actor);
  });
}
