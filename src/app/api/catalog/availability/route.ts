import { officialPlanResponse } from "@/lib/catalog/official-endpoints";
export const runtime = "nodejs";

// Discovery only: live counts travel directly from OSU to each user's browser.
export function GET() {
  return officialPlanResponse("availability");
}
