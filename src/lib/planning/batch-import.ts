import { emptyPlan, planSchema, type Plan } from "./model.ts";
import { mergeSnapshots } from "./snapshots.ts";
type Input = Pick<File, "name" | "size" | "text">;
type Options = {
  existing: Plan;
  replace: boolean;
  signal: AbortSignal;
  extract: (file: Input) => Promise<Plan>;
  progress?: (completed: number, total: number) => void;
};
/** Stage locally, then commit once. Cancellation never leaves a half-imported workspace. */
export async function importPlanningFiles(
  files: readonly Input[],
  options: Options,
) {
  if (
    !files.length ||
    files.length > 12 ||
    files.reduce((n, f) => n + f.size, 0) > 60 * 1024 * 1024
  )
    throw Error("batch-size");
  let plan = options.replace ? emptyPlan() : planSchema.parse(options.existing);
  let imported = 0,
    failed = 0,
    empty = 0;
  for (let index = 0; index < files.length; index++) {
    if (options.signal.aborted) throw Error("cancelled");
    const file = files[index];
    try {
      let incoming: Plan;
      if (/\.json$/i.test(file.name)) {
        if (file.size > 4 * 1024 * 1024) throw Error("json-size");
        incoming = planSchema.parse(JSON.parse(await file.text()));
      } else incoming = planSchema.parse(await options.extract(file));
      if (
        !incoming.semesters.some((s) => s.courses.length) &&
        !incoming.requirements.length
      )
        empty++;
      else {
        incoming.reviewed = false;
        plan =
          plan.documents.length || plan.semesters.length
            ? mergeSnapshots(plan, incoming)
            : incoming;
        imported++;
      }
    } catch {
      failed++;
    }
    if (options.signal.aborted) throw Error("cancelled");
    options.progress?.(index + 1, files.length);
  }
  return {
    plan: imported ? { ...plan, reviewed: false } : options.existing,
    imported,
    failed,
    empty,
  };
}
