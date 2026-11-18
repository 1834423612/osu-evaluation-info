"use client";
import { useEffect, useRef, useState } from "react";
import { emptyPlan, type Plan } from "@/lib/planning/model";
import {
  PLANNING_EVENT,
  planningState,
  savePlanningLocal,
} from "@/lib/planning/client-sync";
import { reconcilePlans } from "@/lib/planning/reconcile";

/** Keep a local editing base so incoming sync never overwrites a newer draft. */
export function usePlanningWorkspace(account: string | null) {
  const [plan, renderPlan] = useState<Plan>(emptyPlan);
  const [loadedAccount, setLoadedAccount] = useState<string | null | undefined>(
    undefined,
  );
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState("");
  const [storageError, setStorageError] = useState(false);
  const editor = useRef({
    plan: emptyPlan() as Plan | null,
    base: null as Plan | null,
    loaded: false,
    active: false,
    writing: false,
  });
  const flush = useRef<() => Promise<boolean>>(async () => false);
  useEffect(() => {
    const draft = {
      plan: emptyPlan() as Plan | null,
      base: null as Plan | null,
      loaded: false,
      active: true,
      writing: false,
    };
    editor.current = draft;
    let pending: Promise<boolean> | null = null;
    const publish = () => {
      if (!draft.active) return;
      renderPlan(draft.plan ?? emptyPlan());
      setSaved(JSON.stringify(draft.base ?? emptyPlan()));
    };
    const write = async () => {
      if (!draft.loaded) return false;
      draft.writing = true;
      try {
        while (JSON.stringify(draft.plan) !== JSON.stringify(draft.base)) {
          const sent = draft.plan;
          const value = await savePlanningLocal(account, draft.base, sent);
          draft.plan = reconcilePlans(sent, draft.plan, value);
          draft.base = value;
          publish();
        }
        if (draft.active) setStorageError(false);
        return true;
      } catch {
        if (draft.active) setStorageError(true);
        return false;
      } finally {
        draft.writing = false;
      }
    };
    flush.current = () => {
      if (pending) return pending;
      pending = write().finally(() => {
        pending = null;
      });
      return pending;
    };
    const receive = () => {
      try {
        const value = planningState(account).plan;
        draft.plan = draft.loaded
          ? reconcilePlans(draft.base, draft.plan, value)
          : value;
        draft.base = value;
        draft.loaded = true;
        publish();
        if (draft.active) {
          setReady(true);
          setLoadedAccount(account);
          setStorageError(false);
        }
      } catch {
        if (draft.active) {
          setReady(true);
          setLoadedAccount(account);
          setStorageError(true);
        }
      }
    };
    // Saving already rebases the current draft against the committed result.
    const external = () => {
      if (!draft.writing) receive();
    };
    queueMicrotask(receive);
    window.addEventListener(PLANNING_EVENT, external);
    window.addEventListener("storage", external);
    const retry = () => void flush.current();
    window.addEventListener("online", retry);
    return () => {
      draft.active = false;
      window.removeEventListener(PLANNING_EVENT, external);
      window.removeEventListener("storage", external);
      window.removeEventListener("online", retry);
      void flush.current();
    };
  }, [account]);
  function setPlan(value: Plan | ((previous: Plan) => Plan)) {
    const draft = editor.current;
    if (!draft.loaded) return;
    draft.plan =
      typeof value === "function" ? value(draft.plan ?? emptyPlan()) : value;
    renderPlan(draft.plan);
    void flush.current();
  }
  return {
    plan: loadedAccount === account ? plan : emptyPlan(),
    setPlan,
    ready: loadedAccount === account && ready,
    saved,
    storageError,
    persist: () => flush.current(),
  };
}
