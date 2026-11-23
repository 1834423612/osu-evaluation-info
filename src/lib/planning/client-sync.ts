import {
  emptyPlan,
  loadPlan,
  planSchema,
  PLAN_STORAGE_KEY,
  type Plan,
} from "./model.ts";
import { reconcilePlans } from "./reconcile.ts";
import { genericRequirementTemplates } from "./generic-template.ts";
import { withSavedMutation } from "../saved/mutations.ts";
import { assertAuthenticatedAccount } from "../saved/scope.ts";
import { readSyncState } from "../sync/database.ts";
import { syncFeatures, type SyncFeatures } from "../sync/features.ts";
import { projectSyncPlan, planConflicts } from "./sync-selection.ts";
export const PLANNING_EVENT = "course-atlas:planning-change";
export const PLANNING_SCOPE_EVENT = "course-atlas:planning-scope";
let scope: string | null = null;
export const PLANNING_SYNC_REQUEST = "course-atlas:planning-sync-request";
export const planningScope = () => scope;
export function setPlanningScope(account: string | null) {
  if (scope === account) return;
  scope = account;
  window.dispatchEvent(new Event(PLANNING_SCOPE_EVENT));
}
export function subscribePlanningScope(callback: () => void) {
  window.addEventListener(PLANNING_SCOPE_EVENT, callback);
  return () => window.removeEventListener(PLANNING_SCOPE_EVENT, callback);
}
export type PlanningState = {
  plan: Plan | null;
  base: Plan | null;
  /** Latest full server payload; base advances only for enabled domains. */
  cloud?: Plan | null;
  version: number;
  templateDigest?: string;
  templateStatus?: "saved" | "account-required" | "retry";
  templateAttempt?: number;
  syncedAt?: string;
  problem?: "unavailable" | "conflict";
  conflict?: { remote: Plan | null; version: number; paths: string[] };
};
function key(account: string) {
  return PLAN_STORAGE_KEY + ":account:" + account;
}
export function planningState(account: string | null): PlanningState {
  if (!account) return { plan: loadPlan(localStorage), base: null, version: 0 };
  const raw = localStorage.getItem(key(account));
  if (!raw) return { plan: loadPlan(localStorage), base: null, version: 0 };
  const value = JSON.parse(raw);
  return {
    ...value,
    plan: value.plan ? planSchema.parse(value.plan) : null,
    base: value.base ? planSchema.parse(value.base) : null,
    version: Number(value.version) || 0,
  };
}
function commit(account: string | null, state: PlanningState) {
  if (account) localStorage.setItem(key(account), JSON.stringify(state));
  else if (state.plan)
    localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(state.plan));
  else localStorage.removeItem(PLAN_STORAGE_KEY);
}
function notify() {
  window.dispatchEvent(new Event(PLANNING_EVENT));
}
export function requestPlanningSync() {
  window.dispatchEvent(new Event(PLANNING_SYNC_REQUEST));
}
export async function savePlanningLocal(
  account: string | null,
  base: Plan | null,
  plan: Plan | null,
) {
  const result = await withSavedMutation(() => {
    if (account) assertAuthenticatedAccount(account);
    const current = planningState(account);
    const next = { ...current, plan: reconcilePlans(base, plan, current.plan) };
    commit(account, next);
    return next.plan;
  });
  notify();
  requestPlanningSync();
  return result;
}
function genericPlan(plan: Plan) {
  const result = emptyPlan();
  result.documents.push({
    id: "template",
    source: "expanded-audit",
    auditMode: "unknown",
    pdfOrigin: "export",
    catalogTerm: null,
  });
  for (const [index, template] of genericRequirementTemplates(plan).entries()) {
    const documentId = "template",
      programId = `program-${index}`;
    result.programs.push({
      id: programId,
      documentId,
      code: template.programCode,
      title: template.title,
      appliedVersion: template.appliedVersion,
      catalogTerm: template.catalogTerm,
      declaration: "unknown",
      remainingCredits: null,
    });
    result.requirements.push(
      ...template.requirements.map((r) => ({
        ...r,
        id: `${programId}-${r.id}`,
        parentId: r.parentId ? `${programId}-${r.parentId}` : null,
        documentId,
        programId,
        page: null,
      })),
    );
  }
  return planSchema.parse(result);
}
const inFlight = new Map<string, Promise<void>>();
export function syncPlanning(account: string): Promise<void> {
  const current = inFlight.get(account);
  if (current) return current;
  const operation = runPlanningSync(account).finally(() => {
    if (inFlight.get(account) === operation) inFlight.delete(account);
  });
  inFlight.set(account, operation);
  return operation;
}
async function runPlanningSync(account: string) {
  assertAuthenticatedAccount(account);
  const preferences = await readSyncState(account),
    features = syncFeatures(preferences);
  if (!preferences.enabled || (!features.planning && !features.calendars))
    return;
  try {
    await synchronizePlanning(account, features);
  } catch (error) {
    await withSavedMutation(() => {
      assertAuthenticatedAccount(account);
      const local = planningState(account);
      commit(account, {
        ...local,
        problem: local.conflict ? "conflict" : "unavailable",
      });
    });
    notify();
    throw error;
  }
}
async function synchronizePlanning(account: string, features: SyncFeatures) {
  assertAuthenticatedAccount(account);
  const response = await fetch("/api/planning/backup", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error("Planning sync unavailable");
  const remote = await response.json();
  if (remote.accountId !== account) throw Error("account_changed");
  assertAuthenticatedAccount(account);
  let prepared: PlanningState;
  prepared = await withSavedMutation(() => {
    assertAuthenticatedAccount(account);
    const local = planningState(account);
    const remotePlan = remote.plan ? planSchema.parse(remote.plan) : null;
    const transfer = projectSyncPlan(local.plan, local.base, features);
    const received = projectSyncPlan(remotePlan, local.base, features);
    const paths = local.base
      ? planConflicts(local.base, transfer, received)
      : [];
    if (paths.length) {
      const next: PlanningState = {
        ...local,
        problem: "conflict",
        conflict: {
          remote: remotePlan,
          version: remote.version,
          paths: [...new Set(paths)],
        },
      };
      commit(account, next);
      return next;
    }
    const merged = reconcilePlans(local.base, transfer, received);
    const next = {
      ...local,
      plan: projectSyncPlan(merged, local.plan, features),
      base: received,
      cloud: remotePlan,
      version: remote.version,
      problem: undefined,
      conflict: undefined,
      syncedAt: new Date().toISOString(),
    };
    commit(account, next);
    return next;
  });
  notify();
  if (prepared.conflict) return;
  const sent = projectSyncPlan(prepared.plan, prepared.cloud ?? null, features);
  if (JSON.stringify(sent) !== JSON.stringify(prepared.cloud ?? null)) {
    const latestPreferences = await readSyncState(account);
    if (
      !latestPreferences.enabled ||
      JSON.stringify(syncFeatures(latestPreferences)) !==
        JSON.stringify(features)
    )
      return;
    const put = await fetch("/api/planning/backup", {
      method: "PUT",
      signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId: account,
        version: prepared.version,
        plan: sent,
      }),
    });
    if (!put.ok)
      throw Error(
        put.status === 409 ? "planning_conflict" : "Planning sync unavailable",
      );
    const saved = await put.json();
    if (saved.accountId !== account) throw Error("account_changed");
    prepared = await withSavedMutation(() => {
      assertAuthenticatedAccount(account);
      const current = planningState(account);
      const savedPlan = saved.plan ? planSchema.parse(saved.plan) : null;
      const next = {
        ...current,
        plan: projectSyncPlan(
          reconcilePlans(
            sent,
            projectSyncPlan(current.plan, sent, features),
            savedPlan,
          ),
          current.plan,
          features,
        ),
        base: projectSyncPlan(savedPlan, current.base, features),
        cloud: savedPlan,
        version: saved.version,
        syncedAt: new Date().toISOString(),
      };
      commit(account, next);
      return next;
    });
    notify();
  }
  if (!features.planning || !prepared.plan?.requirements.length) return;
  const templatePlan = genericPlan(prepared.plan);
  if (!templatePlan.requirements.length) return;
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(templatePlan)),
  );
  const digest = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (
    digest === prepared.templateDigest ||
    Date.now() - (prepared.templateAttempt ?? 0) < 300000
  )
    return;
  assertAuthenticatedAccount(account);
  const submitted = await fetch("/api/planning/templates", {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: account, plan: templatePlan }),
  });
  await withSavedMutation(() => {
    assertAuthenticatedAccount(account);
    const current = planningState(account);
    commit(account, {
      ...current,
      templateAttempt: Date.now(),
      templateDigest: submitted.ok ? digest : current.templateDigest,
      templateStatus: submitted.ok
        ? "saved"
        : submitted.status === 403
          ? "account-required"
          : "retry",
    });
  });
  notify();
}
export async function resolvePlanningConflict(
  account: string,
  choice: "local" | "cloud",
) {
  const preferences = await readSyncState(account);
  await withSavedMutation(() => {
    assertAuthenticatedAccount(account);
    const local = planningState(account),
      conflict = local.conflict;
    if (!conflict) return;
    commit(account, {
      ...local,
      plan:
        choice === "cloud"
          ? projectSyncPlan(
              conflict.remote,
              local.plan,
              syncFeatures(preferences),
            )
          : local.plan,
      base: projectSyncPlan(
        conflict.remote,
        local.base,
        syncFeatures(preferences),
      ),
      cloud: conflict.remote,
      version: conflict.version,
      conflict: undefined,
      problem: undefined,
    });
  });
  notify();
  requestPlanningSync();
}
