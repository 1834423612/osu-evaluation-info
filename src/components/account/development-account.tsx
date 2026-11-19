"use client";
import { useActionNotice } from "@/hooks/use-action-notice";
import { useEffect, useState } from "react";
import {
  Link2,
  Copy,
  RefreshCw,
  UploadCloud,
  FlaskConical,
} from "lucide-react";
import { DraftForm } from "@/components/forms/draft-guard";
import { Button } from "@/components/ui/button";
import { syncCycle, readSyncState } from "@/lib/sync/client";
import { syncPlanning } from "@/lib/planning/client-sync";
import {
  resetDevelopmentStatus,
  pullDevelopmentAccount,
} from "@/lib/development/client";
import { text, type Locale } from "@/lib/i18n";
import layout from "./development-account.module.css";
import styles from "@/components/ui/workspace.module.css";
type Status = {
  development: boolean;
  productionOrigin?: string | null;
  linked: boolean;
  label?: string;
  pulledAt?: string;
  conflicts?: string[];
  grants?: { id: string; expires_at: string }[];
};
type Preview = {
  preview: string;
  conflicts: string[];
  favorites: number;
  calendars: number;
  documents: number;
};
export function DevelopmentAccount({
  account,
  locale,
}: {
  account: string;
  locale: Locale;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [status, setStatus] = useState<Status | null>(null),
    [pairing, setPairing] = useState(""),
    [issued, setIssued] = useState(""),
    [message, setMessage] = useActionNotice(),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<Preview | null>(null);
  async function load() {
    const response = await fetch("/api/account/development", {
      cache: "no-store",
    });
    if (response.ok) setStatus(await response.json());
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/account/development", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((value) => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [account]);
  async function action(input: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      if (input.action === "preview" || input.action === "push") {
        await syncCycle(account);
        await syncPlanning(account);
        const state = await readSyncState(account);
        if (state.conflicts.length || state.needsReview || state.outbox.length)
          throw Error("merge_conflict");
      }
      const response = await fetch("/api/account/development", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
        data = await response.json();
      if (!response.ok) throw Error(data.error);
      if (input.action === "issue") setIssued(data.pairing);
      if (input.action === "preview") setPreview(data);
      if (input.action === "bind") setPairing("");
      if (["push", "disconnect", "bind"].includes(String(input.action)))
        setPreview(null);
      resetDevelopmentStatus(account);
      await pullDevelopmentAccount(account);
      await load();
      setMessage(
        input.action === "push"
          ? t("Production account updated", "生产账号已更新")
          : input.action === "bind"
            ? t(
                "Accounts linked. Production data now pulls automatically.",
                "账号已关联，生产数据会自动拉取。",
              )
            : t("Done", "已完成"),
      );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setMessage(
        code === "merge_conflict"
          ? t(
              "Resolve the listed conflicts before merging.",
              "请先处理列出的冲突，再合并。",
            )
          : code === "preview_outdated"
            ? t(
                "Data changed after preview. Generate a new preview.",
                "预览后数据已变化，请重新预览。",
              )
            : code === "production_origin"
              ? t(
                  "Configure DEVELOPMENT_PRODUCTION_ORIGIN on the development server.",
                  "请在开发服务器配置 DEVELOPMENT_PRODUCTION_ORIGIN。",
                )
              : t(
                  "Could not connect. Check the production deployment and pairing expiry.",
                  "连接失败，请检查生产部署和配对凭据有效期。",
                ),
      );
      if (input.action === "push") setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  if (!status) return null;
  return (
    <section
      id="development-account"
      className={`${styles.panel} ${layout.panel} rr-block`}
      data-telemetry-private
      data-analytics-area="development_account"
    >
      <h2>
        <FlaskConical size={18} />
        {t("Development account link", "开发账号关联")}
      </h2>
      {status.development ? (
        <>
          <span className={styles.badge}>
            {t("Development account", "开发账号")}
          </span>
          <p className={styles.muted}>
            {status.linked
              ? t("Linked to ", "已关联生产账号：") + status.label
              : t(
                  "Create a pairing credential from your production account, then paste it here.",
                  "先在生产账号生成配对凭据，再粘贴到这里。",
                )}
          </p>
          {!status.linked ? (
            <DraftForm
              onSubmit={(event) => {
                event.preventDefault();
                void action({ action: "bind", pairing });
              }}
            >
              <label className={styles.fields}>
                {t("Production pairing credential", "生产账号配对凭据")}
                <input
                  type="password"
                  autoComplete="off"
                  required
                  className={styles.input}
                  value={pairing}
                  onChange={(event) => setPairing(event.target.value)}
                />
              </label>
              <Button disabled={busy || !pairing || !status.productionOrigin}>
                <Link2 size={14} />
                {t("Link accounts", "关联账号")}
              </Button>
              {!status.productionOrigin && (
                <p>
                  {t(
                    "Set DEVELOPMENT_PRODUCTION_ORIGIN to your production HTTPS origin.",
                    "请将 DEVELOPMENT_PRODUCTION_ORIGIN 设置为生产站 HTTPS 域名。",
                  )}
                </p>
              )}
            </DraftForm>
          ) : (
            <>
              <div className={styles.tools}>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action({ action: "pull" })}
                >
                  <RefreshCw size={14} />
                  {t("Pull production data", "拉取生产数据")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void action({ action: "preview" })}
                >
                  <UploadCloud size={14} />
                  {t("Preview merge to production", "预览合并到生产")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void action({ action: "disconnect" })}
                >
                  {t("Unlink", "解除关联")}
                </Button>
              </div>
              <p className={styles.muted}>
                {t(
                  "Automatic pull only. Production writes require a current, conflict-free preview.",
                  "仅自动拉取。回写生产库需要当前有效且无冲突的手动预览。",
                )}
              </p>
            </>
          )}
          {preview && (
            <div className={layout.preview}>
              <strong>{t("Merge preview", "合并预览")}</strong>
              <p>
                {preview.favorites} {t("saved records", "个收藏及分组")} ·{" "}
                {preview.documents} {t("planning reports", "份规划报告")} ·{" "}
                {preview.calendars} {t("calendars", "个日历")}
              </p>
              {preview.conflicts.length ? (
                <>
                  <p>
                    {t(
                      "Competing edits; align the two versions before retrying:",
                      "存在两边同时修改的内容，请统一后重新预览：",
                    )}
                  </p>
                  <ul>
                    {preview.conflicts.map((path) => (
                      <li key={path}>
                        {path.includes("favorites")
                          ? t("Favorites · item details", "收藏 · 项目内容")
                          : path.includes("groups")
                            ? t(
                                "Simulated schedule · section selection",
                                "模拟排课 · 班次选择",
                              )
                            : path.includes("calendars")
                              ? t("Calendar · event changes", "日历 · 日程改动")
                              : t(
                                  "Planning · competing edits",
                                  "规划 · 两端同时修改",
                                )}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void action({ action: "push", preview: preview.preview })
                  }
                >
                  {t(
                    "Merge these changes to production",
                    "将这些修改合并到生产",
                  )}
                </Button>
              )}
            </div>
          )}
        </>
      ) : (
        <>
          <p className={styles.muted}>
            {t(
              "Pair a development account for private planning and saved-data testing. Credentials expire after 30 days.",
              "为开发账号配对，私密同步规划与收藏用于测试。配对凭据 30 天后失效。",
            )}
          </p>
          <Button
            disabled={busy}
            onClick={() => void action({ action: "issue" })}
          >
            {t("Create pairing credential", "生成配对凭据")}
          </Button>
          {issued && (
            <label className={styles.fields}>
              {t("Copy once to your development account", "复制到开发账号")}
              <input
                readOnly
                value={issued}
                className={styles.input}
                autoComplete="off"
                onFocus={(event) => event.target.select()}
              />
              <Button
                variant="outline"
                onClick={() =>
                  void navigator.clipboard
                    .writeText(issued)
                    .then(() => setMessage(t("Copied", "已复制")))
                    .catch(() =>
                      setMessage(
                        t("Select and copy the credential", "请选择并复制凭据"),
                      ),
                    )
                }
              >
                <Copy size={13} />
                {t("Copy", "复制")}
              </Button>
            </label>
          )}
          {status.grants?.map((grant) => (
            <div className={styles.row} key={grant.id}>
              <span>
                {t("Pairing expires ", "配对到期 ")}
                {new Date(grant.expires_at).toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                )}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void action({ action: "revoke", id: grant.id })}
              >
                {t("Revoke", "撤销")}
              </Button>
            </div>
          ))}
        </>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
