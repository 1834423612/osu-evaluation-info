import { z } from "zod";
import { UserDataError } from "./http.ts";
const cursorSchema = z
  .object({ time: z.iso.datetime(), id: z.uuid() })
  .strict();
export function readAdminCursor(value: string | null) {
  if (!value) return null;
  try {
    if (value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw Error();
    return cursorSchema.parse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
  } catch {
    throw new UserDataError("invalid_cursor");
  }
}
export function adminCursor(row: { cursor_time: string; id: string }) {
  return Buffer.from(
    JSON.stringify({ time: row.cursor_time, id: row.id }),
  ).toString("base64url");
}
