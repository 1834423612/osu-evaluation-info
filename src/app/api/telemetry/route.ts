import { recordProductEvents } from "@/lib/user-data/telemetry";
import { telemetryBatchSchema } from "@/lib/telemetry/protocol";
import {
  sameOrigin,
  readJson,
  userJson,
  userRoute,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    sameOrigin(request);
    if (
      request.headers.get("dnt") === "1" ||
      request.headers.get("sec-gpc") === "1"
    )
      return userJson({ accepted: 0, receipts: [] });
    return userJson(
      await recordProductEvents(
        request.headers,
        await readJson(request, telemetryBatchSchema, 32768),
      ),
    );
  });
}
