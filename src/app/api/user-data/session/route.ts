import { z } from "zod";
import { actorFor, actorResponse } from "@/lib/user-data/principal";
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
    await readJson(request, z.object({}), 1024);
    const actor = await actorFor(request, true);
    return actorResponse(userJson({ ready: true }), actor);
  });
}
