"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Popover } from "radix-ui";
import {
  Cloud,
  CloudOff,
  CloudAlert,
  RefreshCw,
  CircleCheck,
  Settings2,
} from "lucide-react";
import { authClient } from "@/lib/auth/client";
import { SYNC_EVENT, readSyncState, syncCycle } from "@/lib/sync/client";
import type { SyncState } from "@/lib/sync/model";
import { syncFeatures, type SyncFeature } from "@/lib/sync/features";
import {
  PLANNING_EVENT,
  planningState,
  resolvePlanningConflict,
  syncPlanning,
  type PlanningState,
} from "@/lib/planning/client-sync";
import { projectSyncPlan } from "@/lib/planning/sync-selection";
import { hasPendingSavedChanges } from "@/lib/sync/storage-status";
import { readSyncItems } from "@/lib/sync/workspace";
import { Button } from "@/components/ui/button";
import { text, type Locale } from "@/lib/i18n";
import { notify } from "@/lib/notify";
import styles from "./feature-sync-status.module.css";
export function FeatureSyncStatus({
  feature,
  locale,
}: {
  feature: SyncFeature;
  locale: Locale;
}) {
  const { data: session } = authClient.useSession();
  const account = session?.user.emailVerified ? session.user.id : null;
  const [state, setState] = useState<SyncState | null>(null),
    [plan, setPlan] = useState<PlanningState | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(false);
  const t = (en: string, zh: string) => text(locale, en, zh);
  useEffect(() => {
    let live = true,
      revision = 0;
    const read = async () => {
      const stamp = ++revision;
      if (!account) {
        setState(null);
        setPlan(null);
        return;
      }
      try {
        const next = await readSyncState(account);
        const planning =
          feature === "favorites" ? null : planningState(account);
        if (!live || revision !== stamp) return;
        setState(next);
        setPlan(planning);
        setPending(
          feature === "favorites"
            ? hasPendingSavedChanges(next, readSyncItems())
            : JSON.stringify(
                projectSyncPlan(
                  planning?.plan ?? null,
                  planning?.base ?? null,
                  {
                    favorites: true,
                    planning: feature === "planning",
                    calendars: feature === "calendars",
                  },
                ),
              ) !== JSON.stringify(planning?.base ?? null),
        );
      } catch {
        if (live && revision === stamp) setPending(true);
      }
    };
    void read();
    for (const name of [
      SYNC_EVENT,
      PLANNING_EVENT,
      "course-atlas:preferences",
      "storage",
    ])
      window.addEventListener(name, read);
    return () => {
      live = false;
      for (const name of [
        SYNC_EVENT,
        PLANNING_EVENT,
        "course-atlas:preferences",
        "storage",
      ])
        window.removeEventListener(name, read);
    };
  }, [account, feature]);
  const conflict =
    feature === "favorites"
      ? !!state && (!!state.conflicts.length || state.needsReview)
      : !!plan?.conflict;
  const enabled = !!state?.enabled && syncFeatures(state)[feature];
  const problem = feature === "favorites" ? state?.problem : plan?.problem;
  const date = feature === "favorites" ? state?.lastSyncAt : plan?.syncedAt;
  const label = !account
    ? t("Local only", "仅本机")
    : !enabled
      ? t("Sync paused", "同步已暂停")
      : conflict
        ? t("Resolve sync conflict", "处理同步冲突")
        : problem
          ? t("Sync needs attention", "同步待处理")
          : pending
            ? t("Waiting to sync", "等待同步")
            : date
              ? t("Synced", "已同步")
              : t("Checking sync", "核对同步中");
  const Icon = !enabled
    ? CloudOff
    : conflict || problem
      ? CloudAlert
      : pending
        ? Cloud
        : CircleCheck;
  async function retry() {
    if (!account) return;
    setBusy(true);
    try {
      if (feature === "favorites") await syncCycle(account);
      else await syncPlanning(account);
    } catch {
      notify(
        t(
          "Sync could not finish. Local changes are kept.",
          "同步暂未完成，本机改动仍保留。",
        ),
        "error",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={styles.trigger}
          data-conflict={conflict || undefined}
          aria-label={label}
          data-analytics-action="sync_status_open"
        >
          <Icon size={14} />
          <span>{label}</span>
          {conflict && <i aria-hidden="true" />}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.panel}
          sideOffset={8}
          collisionPadding={12}
          align="end"
        >
          <strong>
            <Icon size={16} />
            {label}
          </strong>
          <p>
            {!account
              ? t("Sign in to sync across devices.", "登录后可跨设备同步。")
              : conflict
                ? t(
                    "Both devices changed this data. Choose a version before syncing resumes.",
                    "两端同时修改了内容，请选择版本后再继续同步。",
                  )
                : t(
                    "Changes are saved on this device.",
                    "改动已保存在此设备。",
                  )}
          </p>
          {date && (
            <small>
              {t("Last synced · ", "上次同步 · ")}
              {new Date(date).toLocaleString(
                locale === "zh" ? "zh-CN" : "en-US",
              )}
            </small>
          )}
          {feature !== "favorites" && plan?.conflict && account && (
            <div className={styles.conflicts}>
              <span>
                {plan.conflict.paths.length} {t("conflicting fields", "处冲突")}
              </span>
              {(["local", "cloud"] as const).map((choice) => (
                <Button
                  key={choice}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await resolvePlanningConflict(account, choice);
                    } catch {
                      notify(
                        t(
                          "Could not resolve this conflict. Try again.",
                          "未能处理冲突，请重试。",
                        ),
                        "error",
                      );
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {choice === "local"
                    ? t("Use this device’s version", "使用本机版本")
                    : t("Use cloud version", "使用云端版本")}
                </Button>
              ))}
            </div>
          )}
          <div className={styles.actions}>
            {enabled && !conflict && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void retry()}
              >
                <RefreshCw size={13} className={busy ? "spin" : undefined} />
                {t("Sync now", "立即同步")}
              </Button>
            )}
            <Button asChild variant="ghost" size="sm">
              <Link href="/account#sync">
                <Settings2 size={13} />
                {t("Sync settings", "同步设置")}
              </Link>
            </Button>
          </div>
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
