import { z } from "zod";
import { debugAuthorized } from "@/lib/debug/server";
import { analyticsContexts } from "@/lib/user-data/statistics";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    if (!debugAuthorized(request)) throw new UserDataError("forbidden", 403);
    const url = new URL(request.url),
      environment = z
        .enum(["production", "development", "staging", "all"])
        .parse(url.searchParams.get("environment") ?? "production"),
      before = z
        .string()
        .max(256)
        .nullable()
        .parse(url.searchParams.get("before"));
    await checkBudget("admin-contexts", "read", 60, 30);
    const data = await analyticsContexts(environment, before);
    return userJson({ items: data.rows, next: data.next });
  });
}
