import { authorizeAdminRequest, assertAdminOrigin } from "@/lib/auth/admin";
import { getDatabasePool } from "@/lib/db";
import { applyRmpDecisionBatch, RmpBatchError } from "@/lib/rmp/admin-batch";
import { courseDecisionBatchInput } from "@/lib/rmp/admin-input";
import {
  AssistanceError,
  validateAssistanceApproval,
  markAssistanceApproved,
} from "@/lib/rmp/assistance-store";
import { checkBudget } from "@/lib/user-data/rate-limit";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return userRoute(async () => {
    const access = await authorizeAdminRequest(request);
    assertAdminOrigin(request, access);
    const input = await readJson(request, courseDecisionBatchInput, 2_000_000);
    if (!access.development)
      await checkBudget("rmp-batch", access.actor, 60, 12);
    const db = await getDatabasePool().connect();
    try {
      return userJson(
        await applyRmpDecisionBatch(
          { query: (sql, values) => db.query(sql, values) },
          input,
          access.actor,
          input.proposalId
            ? {
                beforeApply: (query, items) =>
                  validateAssistanceApproval(
                    query,
                    input.proposalId!,
                    access.actor,
                    items,
                    input.proposalSnapshot!,
                  ),
                afterApply: (query, applied) =>
                  markAssistanceApproved(
                    query,
                    input.proposalId!,
                    access.actor,
                    applied,
                  ),
              }
            : {},
        ),
      );
    } catch (error) {
      if (error instanceof RmpBatchError)
        return userJson(
          { error: error.code, issues: error.issues },
          error.code === "batch_conflict" ? 409 : 400,
        );
      if (error instanceof AssistanceError)
        throw new UserDataError(
          error.code,
          ["conflict", "stale", "scope"].includes(error.code)
            ? 409
            : ["revoked", "token", "expired", "forbidden"].includes(error.code)
              ? 403
              : error.code === "missing"
                ? 404
                : 400,
        );
      throw error;
    } finally {
      db.release();
    }
  });
}
