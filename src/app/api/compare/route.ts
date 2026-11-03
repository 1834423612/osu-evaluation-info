import { apiError, apiJson } from "@/lib/api/http";
import { getRepository } from "@/lib/api/repository";
import {
  ApiValidationError,
  parseComparisonTargets,
  parseComparisonTargetsFromSearch,
} from "@/lib/api/validation";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    return apiJson(
      await getRepository().compare(
        parseComparisonTargetsFromSearch(url.searchParams),
      ),
    );
  } catch (error) {
    return apiError(error);
  }
}

/** POST is still read-only; it avoids URL length limits for four long course keys. */
export async function POST(request: Request) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiValidationError("The request body must be valid JSON.");
    }
    const targets =
      typeof body === "object" && body !== null && "targets" in body
        ? (body as { targets: unknown }).targets
        : body;
    return apiJson(
      await getRepository().compare(parseComparisonTargets(targets)),
    );
  } catch (error) {
    return apiError(error);
  }
}
