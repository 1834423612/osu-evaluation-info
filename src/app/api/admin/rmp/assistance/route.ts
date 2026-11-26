import { authorizeAdminRequest, assertAdminOrigin } from "@/lib/auth/admin";
import { z } from "zod";
import { getDatabasePool } from "@/lib/db";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { checkBudget } from "@/lib/user-data/rate-limit";
import { assistanceHumanInput } from "@/lib/rmp/assistance-types";
import { buildAssistanceEvidence } from "@/lib/rmp/assistance-service";
import {
  AssistanceError,
  createAssistanceJob,
  listAssistanceJobs,
  readAssistanceJob,
  revokeAssistanceJob,
  rejectAssistanceProposal,
  submitAssistanceProposal,
} from "@/lib/rmp/assistance-store";
export const runtime = "nodejs";
function mapped(error: unknown): never {
  if (error instanceof AssistanceError)
    throw new UserDataError(
      error.code,
      ["conflict", "scope", "stale"].includes(error.code)
        ? 409
        : ["token", "revoked", "expired", "forbidden"].includes(error.code)
          ? 403
          : error.code === "missing"
            ? 404
            : 400,
    );
  throw error;
}
export async function GET(request: Request) {
  return userRoute(async () => {
    const access = await authorizeAdminRequest(request);
    if (!access.development)
      await checkBudget(access.actor, "rmp-assistance", 30, 60);
    const pool = getDatabasePool(),
      query = (sql: string, values?: unknown[]) => pool.query(sql, values),
      id = new URL(request.url).searchParams.get("jobId");
    try {
      const proposalId = new URL(request.url).searchParams.get("proposalId");
      const params = new URL(request.url).searchParams;
      const filters = z
        .object({
          page: z.coerce.number().int().min(1).max(10000).default(1),
          status: z
            .enum(["all", "pending", "reviewed", "awaiting"])
            .default("all"),
          job: z.union([z.literal(""), z.uuid()]).default(""),
        })
        .parse(Object.fromEntries(params));
      const queue = id
        ? null
        : await listAssistanceJobs(query, process.env, filters);
      return userJson(
        id
          ? await readAssistanceJob(
              query,
              id,
              process.env,
              proposalId ?? undefined,
            )
          : {
              jobs: queue!.items,
              total: queue!.total,
              page: queue!.page,
              pageSize: queue!.pageSize,
              development: access.development,
            },
      );
    } catch (error) {
      mapped(error);
    }
  });
}
export async function POST(request: Request) {
  return userRoute(async () => {
    const access = await authorizeAdminRequest(request);
    assertAdminOrigin(request, access);
    if (!access.development)
      await checkBudget(access.actor, "rmp-assistance-write", 10, 30);
    const input = await readJson(request, assistanceHumanInput, 2_000_000);
    const pool = getDatabasePool(),
      query = (sql: string, values?: unknown[]) => pool.query(sql, values);
    try {
      if (input.action === "create") {
        const groups = await buildAssistanceEvidence(input.groups);
        return userJson(
          await createAssistanceJob(
            query,
            { groups, remote: input.remote, minutes: input.minutes },
            { actor: access.actor, userId: access.userId ?? null },
          ),
        );
      }
      if (input.action === "import")
        return userJson(
          await submitAssistanceProposal(
            query,
            input.proposal.jobId,
            input.proposal,
            "human-import",
          ),
        );
      if (input.action === "revoke") {
        await revokeAssistanceJob(query, input.jobId, access.actor);
        return userJson({ revoked: true });
      }
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await rejectAssistanceProposal(
          (sql, values) => client.query(sql, values),
          input.proposalId,
          access.actor,
          process.env,
          input.groups,
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return userJson({ rejected: true });
    } catch (error) {
      mapped(error);
    }
  });
}
