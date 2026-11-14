import { z } from "zod";
import { resolveShareCode } from "@/lib/user-data/sharing";
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
    const { code } = await readJson(
      request,
      z.object({ code: z.string().regex(/^[0-9]{6}$/) }),
      1024,
    );
    return userJson(await resolveShareCode(code));
  });
}
