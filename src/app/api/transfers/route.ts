import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  createTransfer,
  listTransfers,
  transferCreateSchema,
} from "@/lib/user-data/transfers";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () =>
    userJson({ transfers: await listTransfers(await actorFor(request)) }),
  );
}
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const input = await readJson(request, transferCreateSchema, 1048576),
      actor = await actorFor(request, true);
    return actorResponse(
      userJson(await createTransfer(actor, input), 201),
      actor,
    );
  });
}
