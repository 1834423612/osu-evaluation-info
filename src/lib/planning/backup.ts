import { planSchema } from "./model.ts";

/** A backup restores stable IDs and every saved setting across database environments. */
export async function readPlanBackup(
  file: Pick<File, "size" | "text">,
  signal: AbortSignal,
) {
  signal.throwIfAborted();
  if (file.size > 4 * 1024 * 1024) throw Error("backup-size");
  const raw = await file.text();
  signal.throwIfAborted();
  return planSchema.parse(JSON.parse(raw));
}
