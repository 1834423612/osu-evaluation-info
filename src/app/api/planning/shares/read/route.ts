import { readPlanningShare, planningShareRead } from "@/lib/planning/sharing";
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
    return userJson(
      await readPlanningShare(await readJson(request, planningShareRead)),
    );
  });
}
