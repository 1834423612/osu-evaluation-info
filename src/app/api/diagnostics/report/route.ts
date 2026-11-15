import { diagnosticReportSchema } from "@/lib/diagnostics/protocol";
import { saveDiagnosticReport } from "@/lib/diagnostics/reports";
import { actorFor, actorResponse } from "@/lib/user-data/principal";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    const input = await readJson(request, diagnosticReportSchema, 524288),
      actor = await actorFor(request, true);
    await checkBudget("diagnostic-report", actor.id!, 3600, 10);
    await checkBudget("diagnostic-report-global", "all", 3600, 2000);
    return actorResponse(
      userJson(await saveDiagnosticReport(input, actor.id!, request.headers)),
      actor,
    );
  });
}
