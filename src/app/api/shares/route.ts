import { actorFor, actorResponse } from "@/lib/user-data/principal";
import { accountSession } from "@/lib/auth/server";
import { requireInstitutionalIdentity } from "@/lib/auth/institution";
import { publicAuthor } from "@/lib/auth/institutional-policy";
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
  UserDataError,
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
    const input = await readJson(request, shareCreateSchema, 1048576);
    const session = await accountSession(request.headers);
    if (
      input.expiresIn === 0 ||
      input.showAuthor ||
      input.snapshot.collections?.length
    ) {
      if (!session?.user.emailVerified)
        throw new UserDataError("unauthorized", 401);
      await requireInstitutionalIdentity(session.user);
    }
    const author =
      input.showAuthor && session
        ? publicAuthor(
            { ...session.user, name: session.user.name.slice(0, 80) },
            {
              display_name: "",
              show_name: false,
              show_nickname: true,
              show_email: false,
            },
          )
        : undefined;
    const actor = await actorFor(request, true),
      created = await createShare(actor, {
        ...input,
        snapshot: {
          ...input.snapshot,
          author: author?.nickname ? { nickname: author.nickname } : undefined,
        },
      });
    return actorResponse(userJson(created, 201), actor);
  });
}
