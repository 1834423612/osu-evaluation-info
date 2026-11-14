import { z } from "zod";
import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  readShare,
  shareIdSchema,
  recordShareEvent,
} from "@/lib/user-data/sharing";
import { itemKey } from "@/lib/saved/exchange";
import {
  readJson,
  sameOrigin,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return userRoute(async () => {
    sameOrigin(request);
    const id = shareIdSchema.parse((await params).id);
    const input = await readJson(
      request,
      z.object({
        action: z.enum(["open", "import"]),
        capability: z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .optional(),
        keys: z.array(z.string().max(400)).max(700).optional(),
      }),
      1048576,
    );
    const before = await actorFor(request),
      share = await readShare(id, input.capability, before.owners);
    const known = new Set(share.snapshot.items.map(itemKey)),
      keys = [...new Set(input.keys ?? [])];
    if (
      keys.some((key) => !known.has(key)) ||
      (input.action === "import" && !keys.length)
    )
      throw new UserDataError("invalid");
    const actor = await actorFor(request, true);
    const dedupe =
      actor.id +
      (input.action === "open" ? ":" + Math.floor(Date.now() / 86400000) : "");
    await recordShareEvent(id, input.action, actor.id, dedupe, keys.length);
    return actorResponse(userJson({ ok: true }), actor);
  });
}
