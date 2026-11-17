"use client";
import { useEffect, useState } from "react";
import { Cloud, RefreshCw, ShieldCheck } from "lucide-react";
import {
  PLANNING_EVENT,
  planningState,
  requestPlanningSync,
  type PlanningState,
} from "@/lib/planning/client-sync";
import { SYNC_EVENT, readSyncState } from "@/lib/sync/client";
import { text, type Locale } from "@/lib/i18n";
import styles from "./cloud-backup.module.css";

export function CloudBackup({
  account,
  locale,
}: {
  account: string | null;
  locale: Locale;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [state, setState] = useState<PlanningState | null>(null);
  const [enabled, setEnabled] = useState(true);
  useEffect(() => {
    let active = true;
    const read = () => {
      try {
        setState(planningState(account));
      } catch {
        setState(null);
      }
      if (account)
        void readSyncState(account)
          .then((value) => {
            if (active) setEnabled(!value.initialized || value.enabled);
          })
          .catch(() => {});
    };
    queueMicrotask(read);
    window.addEventListener(PLANNING_EVENT, read);
    window.addEventListener(SYNC_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      active = false;
      window.removeEventListener(PLANNING_EVENT, read);
      window.removeEventListener(SYNC_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, [account]);
  const pending = JSON.stringify(state?.plan) !== JSON.stringify(state?.base);
  return (
    <section className={styles.root}>
      <h2>
        <Cloud size={18} />
        {t("Account sync", "账号同步")}
      </h2>
      <p role="status">
        {!account
          ? t(
              "Sign in with a verified account to sync your plan and favorites automatically.",
              "登录已验证的账号后，自动同步规划与收藏。",
            )
          : !enabled
            ? t(
                "Sync is paused in account settings.",
                "同步已在账户设置中暂停。",
              )
            : pending
              ? t(
                  "Saved on this device. Waiting to sync changes…",
                  "已保存在此设备，正在等待同步变更…",
                )
              : t(
                  "Plan changes sync automatically across your devices.",
                  "规划变更已自动同步，可在其他设备继续使用。",
                )}
      </p>
      {state?.syncedAt && (
        <small>
          {t("Last synced", "上次同步")}{" "}
          {new Date(state.syncedAt).toLocaleString(
            locale === "zh" ? "zh-CN" : "en-US",
          )}
        </small>
      )}
      <div className={styles.actions}>
        {account && enabled && (
          <button onClick={requestPlanningSync}>
            <RefreshCw size={14} />
            {t("Retry sync", "重试同步")}
          </button>
        )}
        <a href="/account">{t("Account settings", "账户设置")}</a>
      </div>
      <div className={styles.templates}>
        <ShieldCheck size={17} />
        <p>
          {state?.templateStatus === "saved"
            ? t(
                "De-identified program requirements archived automatically.",
                "去个人化的专业要求已自动归档。",
              )
            : state?.templateStatus === "account-required"
              ? t(
                  "Verify your institutional email in Account to complete automatic template archiving.",
                  "在账户中验证学校邮箱后，即可完成通用专业要求自动归档。",
                )
              : t(
                  "Imported program requirements are queued for automatic archiving. Templates exclude personal course attempts, grades and semester plans.",
                  "导入的专业要求将自动整理归档。通用模板会移除个人修读记录、成绩和学期安排。",
                )}
        </p>
      </div>
    </section>
  );
}
