import { actorFor, actorResponse } from "@/lib/user-data/principal";
import { createPageLink, pageLinkSchema } from "@/lib/user-data/page-links";
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
    const data = await readJson(request, pageLinkSchema, 65536),
      actor = await actorFor(request, true);
    return actorResponse(
      userJson(await createPageLink(actor, data), 201),
      actor,
    );
  });
}
