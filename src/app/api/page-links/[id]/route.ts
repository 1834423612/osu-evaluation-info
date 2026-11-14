import { readPageLink, revokePageLink } from "@/lib/user-data/page-links";
import { actorFor } from "@/lib/user-data/principal";
import { sameOrigin, userJson, userRoute } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return userRoute(async () => userJson(await readPageLink((await params).id)));
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return userRoute(async () => {
    sameOrigin(request);
    await revokePageLink(await actorFor(request), (await params).id);
    return userJson({ revoked: true });
  });
}
