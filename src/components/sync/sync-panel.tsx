"use client";
import { useEffect, useState } from "react";
import { Cloud, RefreshCw, Pause, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { text, type Locale } from "@/lib/i18n";
import {
  syncItemTitle as itemTitle,
  syncItemContext as itemContext,
} from "@/lib/sync/items";
import type { SyncState } from "@/lib/sync/model";
import {
  readSyncState,
  previewMerge,
  enableSync,
  pauseSync,
  chooseConflict,
  syncCycle,
  SYNC_EVENT,
  type MergePreview,
} from "@/lib/sync/client";
import styles from "@/components/ui/workspace.module.css";
export function SyncPanel({
  accountId,
  locale,
}: {
  accountId: string;
  locale: Locale;
}) {
  const [state, setState] = useState<SyncState | null>(null),
    [preview, setPreview] = useState<MergePreview | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    const refresh = () => {
      void readSyncState(accountId)
        .then((s) => {
          if (live) setState(s);
        })
        .catch(() => {
          if (live)
            setNotice(
              text(
                locale,
                "Browser storage is unavailable. Export a backup before continuing.",
                "浏览器存储不可用，请先导出备份。",
              ),
            );
        });
    };
    refresh();
    window.addEventListener(SYNC_EVENT, refresh);
    return () => {
      live = false;
      window.removeEventListener(SYNC_EVENT, refresh);
    };
  }, [accountId, locale]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
      setState(await readSyncState(accountId));
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setNotice(
        text(
          locale,
          code === "quota"
            ? "Collection limit reached. Export a backup or select fewer items."
            : code === "unauthorized" || code === "account_changed"
              ? "Sign in again before syncing."
              : "Sync paused. Your local items and pending changes are kept. Try again online.",
          code === "quota"
            ? "已达到收藏上限，请导出备份或减少所选项目。"
            : code === "unauthorized" || code === "account_changed"
              ? "请重新登录后同步。"
              : "同步暂未完成，本机收藏和待同步改动仍保留，可联网后重试。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const initialized = state?.initialized;
  return (
    <section className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2>
          <Cloud size={18} />
          {text(locale, "Favorites sync", "收藏同步")}
        </h2>
        <span className={styles.badge}>
          {state?.enabled
            ? text(locale, "On", "已开启")
            : text(locale, "Off", "已关闭")}
        </span>
      </div>
      <p className={styles.muted}>
        {initialized
          ? text(
              locale,
              "Account favorites stay separate from guest favorites.",
              "账号收藏与游客收藏分别保存。",
            )
          : text(
              locale,
              "Merge this browser’s favorites with your account.",
              "合并本机与账号中的收藏。",
            )}
      </p>
      {state?.lastSyncAt ? (
        <small>
          {text(locale, "Last synced · ", "上次同步 · ") +
            new Date(state.lastSyncAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en-US",
            )}
        </small>
      ) : null}
      <div className={styles.actions}>
        {!state?.enabled || state.needsReview ? (
          <Button
            variant="outline"
            disabled={busy || !state}
            onClick={() =>
              void run(async () => {
                if (initialized && !state?.needsReview) {
                  const p = await previewMerge(accountId);
                  await enableSync(accountId, p);
                  await syncCycle(accountId);
                } else setPreview(await previewMerge(accountId));
              })
            }
          >
            <Cloud size={15} />
            {state?.needsReview
              ? text(locale, "Review merge", "检查合并")
              : initialized
                ? text(locale, "Resume sync", "恢复同步")
                : text(locale, "Set up sync", "设置同步")}
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => syncCycle(accountId))}
            >
              <RefreshCw size={15} />
              {text(locale, "Sync now", "立即同步")}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => pauseSync(accountId))}
            >
              <Pause size={15} />
              {text(locale, "Pause", "暂停")}
            </Button>
          </>
        )}
        {!initialized ? (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() =>
              void run(async () => setPreview(await previewMerge(accountId)))
            }
          >
            {text(locale, "Merge once", "仅合并一次")}
          </Button>
        ) : null}
        {state?.outbox.length ? (
          <span className={styles.badge}>
            {state.outbox.length + text(locale, " pending", " 项待同步")}
          </span>
        ) : null}
      </div>
      {state?.problem && !notice ? (
        <p role="status" className={styles.notice}>
          {text(
            locale,
            state.problem === "offline"
              ? "Offline · changes are kept on this device."
              : state.problem === "quota"
                ? "Collection limit reached. Export a backup before removing items."
                : state.problem === "unauthorized"
                  ? "Sign in again to resume sync."
                  : "Waiting to retry · pending changes are kept.",
            state.problem === "offline"
              ? "当前离线，改动已保存在本机。"
              : state.problem === "quota"
                ? "已达到收藏上限，请先导出备份再清理。"
                : state.problem === "unauthorized"
                  ? "请重新登录以恢复同步。"
                  : "等待重试，待同步改动仍保留。",
          )}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      ) : null}
      {state?.needsReview ? (
        <p className={styles.notice}>
          <AlertCircle size={14} />
          {text(
            locale,
            "This device’s sync history expired. Review its items before merging again.",
            "此设备的同步历史已过期，请检查后重新合并。",
          )}
        </p>
      ) : null}
      {state?.conflicts.length ? (
        <div>
          <h3>{text(locale, "Choose a version", "选择保留的版本")}</h3>
          <ul className={styles.list}>
            {state.conflicts.map((c) => (
              <li key={c.key} className={styles.row + " " + styles.conflict}>
                <AlertCircle size={16} />
                <span>
                  <strong>
                    {c.local
                      ? itemTitle(c.local)
                      : c.remote.item
                        ? itemTitle(c.remote.item)
                        : c.key}
                  </strong>
                  <small>
                    {text(locale, "This device: ", "本机：") +
                      (c.local
                        ? text(locale, "saved", "已收藏")
                        : text(locale, "removed", "已移除")) +
                      " · " +
                      text(locale, "Cloud: ", "云端：") +
                      (c.remote.item
                        ? text(locale, "saved", "已收藏")
                        : text(locale, "removed", "已移除"))}
                  </small>
                </span>
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => chooseConflict(accountId, c.key, "local"))
                    }
                  >
                    {text(locale, "Keep device", "保留本机")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void run(() => chooseConflict(accountId, c.key, "cloud"))
                    }
                  >
                    {text(locale, "Use cloud", "使用云端")}
                  </Button>
                </div>
                <details className={styles.comparison}>
                  <summary>
                    {text(locale, "Compare versions", "比较版本")}
                  </summary>
                  <div>
                    <strong>{text(locale, "This device", "本机")}</strong>
                    <p>
                      {c.local
                        ? itemTitle(c.local)
                        : text(locale, "Removed", "已移除")}
                    </p>
                    {c.local ? <small>{itemContext(c.local)}</small> : null}
                  </div>
                  <div>
                    <strong>{text(locale, "Cloud", "云端")}</strong>
                    <p>
                      {c.remote.item
                        ? itemTitle(c.remote.item)
                        : text(locale, "Removed", "已移除")}
                    </p>
                    {c.remote.item ? (
                      <small>{itemContext(c.remote.item)}</small>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <WorkspaceDialog
        closeLabel={text(locale, "Close", "关闭")}
        open={!!preview}
        onOpenChange={(v) => {
          if (!v && !busy) setPreview(null);
        }}
        title={text(locale, "Merge favorites", "合并收藏")}
        description={text(
          locale,
          "Existing items are kept. Conflicting edits require your choice.",
          "保留已有收藏，冲突内容由你选择。",
        )}
      >
        {preview ? (
          <>
            <div className={styles.grid}>
              <div className={styles.panel}>
                <strong>{preview.outgoing}</strong>
                <p>{text(locale, "Device-only items", "仅本机有的项目")}</p>
              </div>
              <div className={styles.panel}>
                <strong>{preview.incoming}</strong>
                <p>{text(locale, "Cloud-only items", "仅云端有的项目")}</p>
              </div>
            </div>
            <p>
              {preview.conflicts +
                text(locale, " items need a choice", " 项需要选择版本")}
            </p>
            <div className={styles.actions}>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await enableSync(accountId, preview);
                    setPreview(null);
                    await syncCycle(accountId);
                  })
                }
              >
                <Check size={15} />
                {text(locale, "Merge & enable sync", "合并并开启同步")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await enableSync(accountId, preview, true);
                    setPreview(null);
                    await syncCycle(accountId);
                  })
                }
              >
                {text(locale, "Merge once", "仅合并一次")}
              </Button>
            </div>
          </>
        ) : null}
      </WorkspaceDialog>
    </section>
  );
}
