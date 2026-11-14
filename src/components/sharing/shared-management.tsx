"use client";
import { useEffect, useState } from "react";
import { Link2, Copy, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { text, type Locale } from "@/lib/i18n";
import {
  copyLink,
  readShareLinks,
  rememberShare,
  shareLink,
  sharingDate,
} from "@/lib/saved/share-links";
import styles from "@/components/ui/workspace.module.css";
type Row = {
  id: string;
  title: string;
  visibility: "public" | "link";
  expires_at: string;
  revoked_at: string | null;
  code: string | null;
  code_expires_at: string | null;
  previews: number;
  opens: number;
  imports: number;
};
export function SharedManagement({ locale }: { locale: Locale }) {
  const [now, setNow] = useState(() => Date.now());
  const [manualUrl, setManualUrl] = useState("");
  const [open, setOpen] = useState(false),
    [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(false),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<{
      row: Row;
      action: "revoke" | "rotate";
    } | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [open]);
  async function load() {
    setNow(Date.now());
    setLoading(true);
    try {
      const r = await fetch("/api/shares", { cache: "no-store" });
      if (!r.ok) throw Error();
      setRows((await r.json()).shares);
    } catch {
      setNotice(
        text(locale, "Sharing service unavailable.", "分享服务暂不可用。"),
      );
    } finally {
      setLoading(false);
    }
  }
  async function change() {
    if (!pending) return;
    setBusy(true);
    try {
      const local = readShareLinks().find((x) => x.id === pending.row.id),
        r = await fetch("/api/shares/" + pending.row.id, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: pending.action,
            management: local?.management,
          }),
        });
      if (!r.ok) throw Error();
      const data = await r.json();
      if (pending.action === "rotate") {
        const url = shareLink(location.origin, pending.row.id, data.capability);
        rememberShare({
          id: pending.row.id,
          url,
          management: local?.management ?? "",
          title: pending.row.title,
          expiresAt: pending.row.expires_at,
        });
        const copied = await copyLink(url);
        setManualUrl(copied ? "" : url);
        setNotice(
          copied
            ? text(
                locale,
                "New link copied. The old link no longer works.",
                "新链接已复制，旧链接已失效。",
              )
            : text(
                locale,
                "New link created. Use Copy link to copy it.",
                "新链接已创建，请点击复制链接。",
              ),
        );
      } else setNotice(text(locale, "Share revoked", "分享已撤销"));
      setPending(null);
      await load();
    } catch {
      setNotice(
        text(locale, "Could not change this share.", "未能修改此分享。"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy(row: Row) {
    try {
      const local = readShareLinks().find((x) => x.id === row.id);
      let url = shareLink(location.origin, row.id);
      if (row.visibility === "link") {
        const response = await fetch("/api/shares/" + row.id, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "copy",
            management: local?.management,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          if (data.error === "replace_link" && local?.url) url = local.url;
          else throw Error();
        } else url = shareLink(location.origin, row.id, data.capability);
        rememberShare({
          id: row.id,
          url,
          management: local?.management ?? "",
          title: row.title,
          expiresAt: row.expires_at,
        });
      }
      const ok = await copyLink(url);
      setManualUrl(ok ? "" : url);
      setNotice(
        text(
          locale,
          ok ? "Link copied" : "Select and copy the link",
          ok ? "链接已复制" : "请选择并复制链接",
        ),
      );
    } catch {
      setNotice(
        text(
          locale,
          "Could not copy this share. Refresh or replace its link.",
          "未能复制此分享，请刷新或更换链接。",
        ),
      );
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setOpen(true);
          setPending(null);
          setManualUrl("");
          void load();
        }}
      >
        <Link2 size={14} />
        {text(locale, "Shared links", "已分享链接")}
      </Button>
      <WorkspaceDialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setPending(null);
        }}
        title={
          pending
            ? text(
                locale,
                pending.action === "rotate"
                  ? "Replace this link?"
                  : "Revoke this share?",
                pending.action === "rotate" ? "更换此链接？" : "撤销此分享？",
              )
            : text(locale, "Shared collections", "已分享的清单")
        }
        description={
          pending
            ? text(
                locale,
                "Existing links will stop working.",
                "现有链接将立即失效。",
              )
            : text(locale, "Links, expiry and usage", "链接、有效期与使用情况")
        }
        closeLabel={text(locale, "Close", "关闭")}
      >
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {pending ? (
          <>
            <p>{pending.row.title}</p>
            <div className={styles.tools}>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPending(null)}
              >
                {text(locale, "Cancel", "取消")}
              </Button>
              <Button disabled={busy} onClick={() => void change()}>
                {text(locale, "Confirm", "确认")}
              </Button>
            </div>
          </>
        ) : (
          <>
            {manualUrl ? (
              <label className={styles.fields}>
                {text(
                  locale,
                  "Select and copy this link",
                  "请选择并复制此链接",
                )}
                <input
                  className={styles.input}
                  value={manualUrl}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </label>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={13} />
              {text(locale, "Refresh", "刷新")}
            </Button>
            {loading ? (
              <p className={styles.muted}>
                {text(locale, "Loading…", "正在读取…")}
              </p>
            ) : !rows.length ? (
              <p className={styles.muted}>
                {text(locale, "No shared links yet.", "还没有分享链接。")}
              </p>
            ) : (
              <ul className={styles.list}>
                {rows.map((row) => {
                  const active =
                    !row.revoked_at && Date.parse(row.expires_at) > now;
                  return (
                    <li className={styles.shareRow} key={row.id}>
                      <div>
                        <strong>{row.title}</strong>
                        <span className={styles.badge}>
                          {row.revoked_at
                            ? text(locale, "Revoked", "已撤销")
                            : !active
                              ? text(locale, "Expired", "已过期")
                              : text(
                                  locale,
                                  row.visibility === "public"
                                    ? "Public code"
                                    : "Link only",
                                  row.visibility === "public"
                                    ? "公开码"
                                    : "仅链接",
                                )}
                        </span>
                        <small>
                          {text(locale, "Expires", "到期")} ·{" "}
                          {sharingDate(row.expires_at, locale)}
                        </small>
                      </div>
                      <div className={styles.tools}>
                        <span className={styles.muted}>
                          {row.previews} {text(locale, "previews", "预览")} ·{" "}
                          {row.opens} {text(locale, "opens", "打开")} ·{" "}
                          {row.imports} {text(locale, "imports", "转存")}
                        </span>
                        {row.code &&
                        row.code_expires_at &&
                        Date.parse(row.code_expires_at) > now ? (
                          <span className={styles.badge}>{row.code}</span>
                        ) : null}
                      </div>
                      <div className={styles.tools}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!active}
                          onClick={() => void copy(row)}
                        >
                          <Copy size={13} />
                          {text(locale, "Copy link", "复制链接")}
                        </Button>
                        {row.visibility === "link" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!active}
                            onClick={() =>
                              setPending({ row, action: "rotate" })
                            }
                          >
                            {text(locale, "Replace link", "更换链接")}
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!active}
                          onClick={() => setPending({ row, action: "revoke" })}
                        >
                          <Trash2 size={13} />
                          {text(locale, "Revoke", "撤销")}
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </WorkspaceDialog>
    </>
  );
}
