import { z } from "zod";
import { gunzipSync } from "node:zlib";
import { authenticateDevelopmentGrant } from "@/lib/development/server";
import {
  readAccountSnapshot,
  writeAccountSnapshot,
} from "@/lib/development/accounts";
import { accountSnapshotSchema } from "@/lib/development/model";
import {
  readJson,
  userJson,
  userRoute,
  UserDataError,
} from "@/lib/user-data/http";
export const runtime = "nodejs";
export const maxDuration = 60;
const mergeSchema = z.object({
  expected: z.object({
    planningVersion: z.number().int().nonnegative(),
    cursor: z.number().int().nonnegative(),
  }),
  next: accountSnapshotSchema.pick({ planning: true, favorites: true }),
});
async function owner(request: Request) {
  if (process.env.NODE_ENV !== "production")
    throw new UserDataError("production_only", 403);
  return authenticateDevelopmentGrant(request);
}
export async function GET(request: Request) {
  return userRoute(async () => {
    const account = await owner(request);
    return userJson({
      ...(await readAccountSnapshot(account.accountId)),
      label: account.label,
    });
  });
}
export async function PUT(request: Request) {
  return userRoute(async () => {
    const account = await owner(request),
      packed = await readJson(
        request,
        z.object({
          encoding: z.literal("gzip"),
          data: z
            .string()
            .max(4 * 1024 * 1024)
            .regex(/^[A-Za-z0-9_-]+$/),
        }),
        4 * 1024 * 1024,
      );
    let input: z.infer<typeof mergeSchema>;
    try {
      input = mergeSchema.parse(
        JSON.parse(
          gunzipSync(Buffer.from(packed.data, "base64url"), {
            maxOutputLength: 16 * 1024 * 1024,
          }).toString("utf8"),
        ),
      );
    } catch {
      throw new UserDataError("invalid", 400);
    }
    return userJson({
      ...(await writeAccountSnapshot(
        account.accountId,
        input.expected,
        input.next,
      )),
      label: account.label,
    });
  });
}
