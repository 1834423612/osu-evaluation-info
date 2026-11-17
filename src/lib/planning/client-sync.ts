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
  version: number;
  templateDigest?: string;
  templateStatus?: "saved" | "account-required" | "retry";
  templateAttempt?: number;
  syncedAt?: string;
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
export async function syncPlanning(account: string) {
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
    const next = {
      ...local,
      plan: reconcilePlans(
        local.base,
        local.plan,
        remote.plan ? planSchema.parse(remote.plan) : null,
      ),
      base: remote.plan ? planSchema.parse(remote.plan) : null,
      version: remote.version,
    };
    commit(account, next);
    return next;
  });
  notify();
  if (JSON.stringify(prepared.plan) !== JSON.stringify(prepared.base)) {
    const sent = prepared.plan;
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
      const next = {
        ...current,
        plan: reconcilePlans(
          sent,
          current.plan,
          saved.plan ? planSchema.parse(saved.plan) : null,
        ),
        base: saved.plan ? planSchema.parse(saved.plan) : null,
        version: saved.version,
        syncedAt: new Date().toISOString(),
      };
      commit(account, next);
      return next;
    });
    notify();
  }
  if (!prepared.plan?.requirements.length) return;
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
