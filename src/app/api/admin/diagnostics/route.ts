import { z } from "zod";
import { debugAuthorized } from "@/lib/debug/server";
import { listDiagnosticReports } from "@/lib/diagnostics/reports";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    if (!debugAuthorized(request)) throw new UserDataError("forbidden", 403);
    const before = z
      .string()
      .max(256)
      .nullable()
      .parse(new URL(request.url).searchParams.get("before"));
    await checkBudget("admin-diagnostics", "read", 60, 30);
    return userJson(await listDiagnosticReports(before));
  });
}
