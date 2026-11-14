import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  transferAction,
  transferActionSchema,
} from "@/lib/user-data/transfers";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return userRoute(async () => {
    sameOrigin(request);
    const { id } = await params,
      input = await readJson(request, transferActionSchema, 2048),
      actor = await actorFor(request, true);
    return actorResponse(
      userJson(await transferAction(actor, id, input)),
      actor,
    );
  });
}
