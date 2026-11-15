import { z } from "zod";
import { authBaseURL } from "../auth/config.ts";
export class UserDataError extends Error {
  code: string;
  status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = authBaseURL() ?? new URL(request.url).origin;
  if (!origin || origin !== expected) throw new UserDataError("origin", 403);
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json"))
    throw new UserDataError("content_type", 415);
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  max = 262144,
): Promise<T> {
  if (Number(request.headers.get("content-length")) > max)
    throw new UserDataError("too_large", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new UserDataError("body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw new UserDataError("too_large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return schema.parse(JSON.parse(new TextDecoder().decode(data)));
  } catch {
    throw new UserDataError("invalid");
  }
}
export function userJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...(status === 429 ? { "Retry-After": "60" } : {}),
    },
  });
}
export async function userRoute(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    return userJson(
      {
        error:
          error instanceof UserDataError
            ? error.code
            : error instanceof z.ZodError
              ? "invalid"
              : "unavailable",
      },
      error instanceof UserDataError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503,
    );
  }
}
