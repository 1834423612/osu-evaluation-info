import { NextResponse } from "next/server";

import { ApiValidationError } from "@/lib/api/validation";

export function apiJson<T>(body: T, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return NextResponse.json(body, { ...init, headers });
}

export function apiError(error: unknown) {
  if (error instanceof ApiValidationError) {
    return apiJson(
      { error: "invalid_request", message: error.message },
      { status: 400 },
    );
  }

  // Keep connection details and SQL text out of public responses.
  console.error("OSU evaluation API error", error);
  return apiJson(
    {
      error: "service_unavailable",
      message: "The evaluation data is temporarily unavailable.",
    },
    { status: 503 },
  );
}

export function apiNotFound(message = "The requested record was not found.") {
  return apiJson({ error: "not_found", message }, { status: 404 });
}
