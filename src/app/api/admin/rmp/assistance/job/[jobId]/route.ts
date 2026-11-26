import { z } from "zod";
import { getDatabasePool } from "@/lib/db";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
import { assistanceProposalInput } from "@/lib/rmp/assistance-types";
import {
  AssistanceError,
  authorizeAssistanceToken,
  submitAssistanceProposal,
} from "@/lib/rmp/assistance-store";
export const runtime = "nodejs";
type Context = { params: Promise<{ jobId: string }> };
function token(request: Request) {
  const match = /^Bearer (waho-rmp-ai_[A-Za-z0-9_-]{43})$/.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw new UserDataError("token", 403);
  return match[1];
}
function mapped(error: unknown): never {
  if (error instanceof AssistanceError)
    throw new UserDataError(
      error.code,
      ["conflict", "scope", "stale"].includes(error.code) ? 409 : 403,
    );
  throw error;
}
export async function GET(request: Request, context: Context) {
  return userRoute(async () => {
    const { jobId } = await context.params;
    z.uuid().parse(jobId);
    const bearer = token(request),
      pool = getDatabasePool();
    try {
      return userJson(
        await authorizeAssistanceToken(
          (sql, values) => pool.query(sql, values),
          jobId,
          bearer,
        ),
      );
    } catch (error) {
      mapped(error);
    }
  });
}
export async function POST(request: Request, context: Context) {
  return userRoute(async () => {
    const { jobId } = await context.params;
    z.uuid().parse(jobId);
    const bearer = token(request);
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      throw new UserDataError("content_type", 415);
    const input = await readJson(request, assistanceProposalInput, 2_000_000);
    const client = await getDatabasePool().connect();
    try {
      await client.query("BEGIN");
      const query = (sql: string, values?: unknown[]) =>
        client.query(sql, values);
      await authorizeAssistanceToken(query, jobId, bearer, { lock: true });
      const result = await submitAssistanceProposal(
        query,
        jobId,
        input,
        "machine",
      );
      await client.query("COMMIT");
      return userJson(result);
    } catch (error) {
      await client.query("ROLLBACK");
      mapped(error);
    } finally {
      client.release();
    }
  });
}
