"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CloudUpload,
  CloudDownload,
  Share2,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { planSchema, serializePlan, type Plan } from "@/lib/planning/model";
import { mergeSnapshots } from "@/lib/planning/snapshots";
import { text, type Locale } from "@/lib/i18n";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import styles from "./cloud-backup.module.css";
type Backup = {
  accountId: string;
  version: number;
  plan: Plan | null;
  updatedAt: string | null;
};
export function CloudBackup({
  plan,
  locale,
  update,
}: {
  plan: Plan;
  locale: Locale;
  update: (fn: (plan: Plan) => Plan) => void;
}) {
  const t = useCallback(
    (en: string, zh: string) => text(locale, en, zh),
    [locale],
  );
  const [backup, setBackup] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/planning/backup", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok)
          throw Error(response.status === 401 ? "login" : "unavailable");
        const value = await response.json();
        if (!controller.signal.aborted)
          setBackup({
            ...value,
            plan: value.plan ? planSchema.parse(value.plan) : null,
          });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setMessage(
            error.message === "login"
              ? t(
                  "Sign in with a verified account to use cloud backup.",
                  "登录已验证的账户即可使用云备份。",
                )
              : t(
                  "Cloud backup is unavailable. Your local plan is saved separately.",
                  "云备份暂不可用，本地规划仍独立保存。",
                ),
          );
      });
    return () => controller.abort();
  }, [attempt, t]);
  async function save(remove = false) {
    if (!backup || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning/backup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: backup.accountId,
          version: backup.version,
          plan: remove ? null : JSON.parse(serializePlan(plan)),
        }),
      });
      if (!response.ok)
        throw Error(response.status === 409 ? "conflict" : "unavailable");
      const value = await response.json();
      setBackup({
        ...value,
        plan: value.plan ? planSchema.parse(value.plan) : null,
      });
      setMessage(
        remove
          ? t("Cloud backup deleted.", "云备份已删除。")
          : t("Cloud backup saved.", "云备份已保存。"),
      );
      setConfirmDelete(false);
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "conflict"
          ? t(
              "The account or cloud version changed. Refresh and merge the cloud plan before saving again.",
              "账户或云端版本已变化，请刷新并合并云端规划后再保存。",
            )
          : t("Cloud save failed. Please retry.", "云端保存失败，请重试。"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function contribute() {
    if (!backup || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/planning/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId: backup.accountId,
          plan: JSON.parse(serializePlan(plan)),
        }),
      });
      if (!response.ok)
        throw Error(response.status === 403 ? "institution" : "unavailable");
      const result = await response.json();
      setMessage(
        t(
          `${result.stored} new program templates archived.`,
          `已存档 ${result.stored} 份新的专业要求模板。`,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error && error.message === "institution"
          ? t(
              "Verify your institutional email in Account to contribute templates.",
              "请在账户中验证学校邮箱后提交通用模板。",
            )
          : t(
              "Template submission failed. Please retry.",
              "模板提交失败，请重试。",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.root}>
      <h2>{t("Cloud backup", "云端备份")}</h2>
      <p>
        {t(
          "Save your structured academic plan privately to your account. Restore merges it with the plan on this device.",
          "将结构化学业规划私密保存到账户，恢复时与此设备上的规划合并。",
        )}
      </p>
      {backup?.updatedAt && (
        <small>
          {t("Last saved", "上次保存")}{" "}
          {new Date(backup.updatedAt).toLocaleString(
            locale === "zh" ? "zh-CN" : "en-US",
          )}
        </small>
      )}
      <div className={styles.actions}>
        <button disabled={!backup || busy} onClick={() => void save()}>
          <CloudUpload size={15} />
          {t("Save to account", "保存到账户")}
        </button>
        <button
          disabled={!backup?.plan || busy}
          onClick={() => {
            if (backup?.plan) {
              try {
                update((current) => mergeSnapshots(current, backup.plan!));
                setMessage(
                  t(
                    "Cloud plan merged into this device.",
                    "已将云端规划合并到此设备。",
                  ),
                );
              } catch {
                setMessage(
                  t(
                    "Merge exceeds plan capacity. Export your local backup first.",
                    "合并超出规划容量，请先导出本地备份。",
                  ),
                );
              }
            }
          }}
        >
          <CloudDownload size={15} />
          {t("Merge cloud plan", "合并云端规划")}
        </button>
        <button
          disabled={busy}
          onClick={() => {
            setBackup(null);
            setMessage("");
            setAttempt((n) => n + 1);
          }}
        >
          <RefreshCw size={14} />
          {t("Refresh", "刷新")}
        </button>
        <button
          disabled={!backup?.plan || busy}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 size={14} />
          {t("Delete cloud backup", "删除云备份")}
        </button>
      </div>
      <details>
        <summary>
          {t("Contribute program requirements", "贡献通用专业要求")}
        </summary>
        <p>
          {t(
            "Submit a reusable requirement tree with program versions, course options and conditions. Personal course attempts, progress, semesters and account identifiers are removed. Submitted trees are archived as community references.",
            "提交可复用的专业要求树，保留专业版本、可选课程和条件。整理时去除个人修读记录、进度、学期安排和账户标识，以社区参考模板存档。",
          )}
        </p>
        <button
          disabled={!backup || busy || !plan.requirements.length}
          onClick={() => void contribute()}
        >
          <Share2 size={14} />
          {t("Submit anonymized requirements", "提交脱敏专业要求")}
        </button>
      </details>
      {message && <p role="status">{message}</p>}
      {!backup && <a href="/account">{t("Open account", "前往账户")}</a>}
      <WorkspaceDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("Delete cloud backup?", "删除云备份？")}
        description={t(
          "Your plan on this device stays available.",
          "此设备上的规划仍可继续使用。",
        )}
        closeLabel={t("Cancel", "取消")}
        guard={false}
      >
        <button disabled={busy} onClick={() => void save(true)}>
          {t("Delete backup", "删除备份")}
        </button>
      </WorkspaceDialog>
    </section>
  );
}
