import { z } from "zod";
import { debugAuthorized } from "@/lib/debug/server";
import { analyticsOverview } from "@/lib/user-data/statistics";
import { checkBudget } from "@/lib/user-data/rate-limit";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    if (!debugAuthorized(request)) throw new UserDataError("forbidden", 403);
    const url = new URL(request.url),
      days = z.coerce
        .number()
        .int()
        .min(1)
        .max(90)
        .parse(url.searchParams.get("days") ?? 7),
      environment = z
        .enum(["production", "development", "staging", "all"])
        .parse(url.searchParams.get("environment") ?? "production");
    await checkBudget("admin-analytics", "read", 60, 30);
    return userJson(await analyticsOverview(days, environment));
  });
}
