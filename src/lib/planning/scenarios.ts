import { emptyPlan, planSchema, type Plan } from "./model.ts";

export function scenarioPlan(workspace: Plan, id: string | null): Plan {
  if (!id) return workspace;
  const scenario = workspace.scenarios?.find((item) => item.id === id);
  if (!scenario) throw new Error("plan_removed");
  return {
    ...scenario.plan,
    schedule: {
      ...scenario.plan.schedule,
      calendars: workspace.schedule.calendars,
    },
  };
}
export function createScenario(
  workspace: Plan,
  title: string,
  id: string,
  initial: Plan = emptyPlan(),
): Plan {
  const plan = structuredClone(initial);
  delete plan.scenarios;
  // Personal calendars stay in the account workspace, not an alternative plan.
  const schedule = { ...plan.schedule };
  delete schedule.calendars;
  return planSchema.parse({
    ...workspace,
    scenarios: [
      ...(workspace.scenarios ?? []),
      { id, title, plan: { ...plan, schedule } },
    ],
  });
}
export function editScenario(
  workspace: Plan,
  id: string | null,
  edit: (plan: Plan) => Plan,
): Plan {
  if (!id) {
    const next = edit(workspace);
    return planSchema.parse({ ...next, scenarios: workspace.scenarios });
  }
  if (!workspace.scenarios?.some((item) => item.id === id))
    throw new Error("plan_removed");
  const edited = edit(scenarioPlan(workspace, id));
  const schedule = { ...edited.schedule };
  delete schedule.calendars;
  return planSchema.parse({
    ...workspace,
    schedule: {
      ...workspace.schedule,
      calendars: edited.schedule.calendars ?? workspace.schedule.calendars,
    },
    scenarios: workspace.scenarios.map((item) =>
      item.id === id ? { ...item, plan: { ...edited, schedule } } : item,
    ),
  });
}
