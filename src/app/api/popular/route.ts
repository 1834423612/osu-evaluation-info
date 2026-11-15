import { z } from "zod";
import { popularFavorites } from "@/lib/user-data/statistics";
import { userJson, userRoute } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () =>
    userJson(
      await popularFavorites(
        z
          .enum(["course", "section", "instructor"])
          .parse(new URL(request.url).searchParams.get("kind") ?? "course"),
      ),
    ),
  );
}
