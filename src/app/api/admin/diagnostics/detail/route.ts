import { z } from "zod";
import { debugAuthorized } from "@/lib/debug/server";
import { getDiagnosticReport } from "@/lib/diagnostics/reports";
import { userJson, userRoute, UserDataError } from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    if (!debugAuthorized(request)) throw new UserDataError("forbidden", 403);
    const id = z.uuid().parse(new URL(request.url).searchParams.get("id"));
    await checkBudget("admin-diagnostics-detail", "read", 60, 60);
    return userJson(await getDiagnosticReport(id));
  });
}
