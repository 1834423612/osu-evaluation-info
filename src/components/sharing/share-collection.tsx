"use client";
import { SavedItemPicker } from "@/components/saved/saved-item-picker";
import { useState } from "react";
import { Share2, Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLocalSnapshot } from "@/lib/saved/local";
import { itemKey, type SavedSnapshot } from "@/lib/saved/exchange";
import {
  rememberShare,
  shareLink,
  copyLink,
  ensureActorSession,
  browserRequestId,
  sharingDate,
} from "@/lib/saved/share-links";
import { text, type Locale } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
type Created = {
  id: string;
  capability: string | null;
  management: string;
  code: string | null;
  expiresAt: string;
};
export function ShareCollection({
  locale,
  selected,
  scopeKeys,
  title,
}: {
  locale: Locale;
  selected?: Set<string>;
  scopeKeys?: Set<string>;
  title?: string;
}) {
  const [picked, setPicked] = useState(new Set<string>());
  const [requestId, setRequestId] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [open, setOpen] = useState(false),
    [snapshot, setSnapshot] = useState<SavedSnapshot | null>(null),
    [visibility, setVisibility] = useState<"link" | "public">("link"),
    [expiry, setExpiry] = useState("604800"),
    [created, setCreated] = useState<Created | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function begin() {
    try {
      const next = createLocalSnapshot(
        title?.trim() || text(locale, "Shared collection", "分享的收藏"),
      );
      if (scopeKeys)
        next.items = next.items.filter((x) => scopeKeys.has(itemKey(x)));
      setPicked(
        new Set(
          next.items.filter((x) => selected?.has(itemKey(x))).map(itemKey),
        ),
      );
      if (!next.items.length) throw Error();
      setSnapshot(next);
      setRequestId(browserRequestId());
      setAttempted(false);
      setVisibility("link");
      setCreated(null);
      setNotice("");
      setOpen(true);
    } catch {
      setNotice(
        text(
          locale,
          "Select at least one readable saved item.",
          "请先选择可读取的收藏项目。",
        ),
      );
    }
  }
  async function create() {
    setBusy(true);
    setAttempted(true);
    setNotice("");
    try {
      await ensureActorSession();
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: snapshot
            ? {
                ...snapshot,
                items: snapshot.items.filter((x) => picked.has(itemKey(x))),
              }
            : null,
          requestId,
          visibility,
          expiresIn: Number(expiry),
        }),
      });
      if (!response.ok) throw Error();
      const data: Created = await response.json();
      setCreated(data);
      rememberShare({
        id: data.id,
        url: shareLink(location.origin, data.id, data.capability),
        management: data.management,
        title: snapshot!.title,
        expiresAt: data.expiresAt,
      });
    } catch {
      setNotice(
        text(
          locale,
          "Sharing is unavailable or the limit was reached. Local export remains available.",
          "分享服务暂不可用或已达上限，仍可导出本地文件。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const url = created
    ? shareLink(
        typeof location === "undefined" ? "" : location.origin,
        created.id,
        created.capability,
      )
    : "";
  return (
    <>
      <Button variant="outline" onClick={begin}>
        <Share2 size={14} />
        {text(locale, "Share", "分享")}
        {selected?.size ? " (" + selected.size + ")" : ""}
      </Button>
      {notice && !open ? (
        <span className={styles.muted} role="status">
          {notice}
        </span>
      ) : null}
      <WorkspaceDialog
        guard={!created}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setNotice("");
        }}
        title={text(locale, "Share saved items", "分享收藏")}
        description={text(
          locale,
          "Recipients can save all or selected items.",
          "接收者可转存全部或部分项目。",
        )}
        closeLabel={text(locale, "Close", "关闭")}
      >
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {!created ? (
          <>
            <label className={styles.fields}>
              {text(locale, "Collection name", "清单名称")}
              <input
                className={styles.input}
                disabled={attempted}
                maxLength={80}
                value={snapshot?.title ?? ""}
                onChange={(e) =>
                  setSnapshot((s) => (s ? { ...s, title: e.target.value } : s))
                }
              />
            </label>
            <SavedItemPicker
              items={snapshot?.items ?? []}
              picked={picked}
              onChange={setPicked}
              locale={locale}
              disabled={attempted}
            />
            <div className={styles.tools}>
              <Button
                variant={visibility === "link" ? "secondary" : "outline"}
                disabled={attempted}
                aria-pressed={visibility === "link"}
                onClick={() => setVisibility("link")}
              >
                {text(locale, "Link only", "仅链接")}
              </Button>
              <Button
                variant={visibility === "public" ? "secondary" : "outline"}
                disabled={attempted}
                aria-pressed={visibility === "public"}
                onClick={() => setVisibility("public")}
              >
                {text(locale, "Share code", "分享码")}
              </Button>
            </div>
            {visibility === "public" ? (
              <p className={styles.notice}>
                {text(
                  locale,
                  "Anyone can look up this code. It expires in 24 hours; the link follows the expiry below.",
                  "任何人均可查询此公开码，24 小时后失效；链接按下方有效期保留。",
                )}
              </p>
            ) : null}
            <div className={styles.fields}>
              <span>{text(locale, "Link expires after", "链接有效期")}</span>
              <Select
                value={expiry}
                onValueChange={setExpiry}
                disabled={attempted}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={styles.floatingChoice}>
                  {[
                    ["3600", "1 hour", "1 小时"],
                    ["86400", "24 hours", "24 小时"],
                    ["604800", "7 days", "7 天"],
                    ["2592000", "30 days", "30 天"],
                  ].map(([value, en, zh]) => (
                    <SelectItem key={value} value={value}>
                      {text(locale, en, zh)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={busy || !snapshot?.title.trim() || !picked.size}
              onClick={() => void create()}
            >
              {text(locale, "Create share", "创建分享")}
            </Button>
          </>
        ) : (
          <>
            <label className={styles.fields}>
              {text(locale, "Share link", "分享链接")}
              <input
                className={styles.input}
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
              />
            </label>
            {created.code ? (
              <div className={styles.notice}>
                <strong className={styles.code}>{created.code}</strong>
                <small>
                  {text(
                    locale,
                    "Public code · up to 24 hours",
                    "公开分享码 · 最长 24 小时",
                  )}
                </small>
              </div>
            ) : null}
            <p className={styles.muted}>
              {text(locale, "Expires", "到期")} ·{" "}
              {sharingDate(created.expiresAt, locale)}
            </p>
            <div className={styles.tools}>
              <Button
                onClick={() =>
                  void copyLink(url).then((ok) =>
                    setNotice(
                      ok
                        ? text(locale, "Link copied", "链接已复制")
                        : text(
                            locale,
                            "Select and copy the link above.",
                            "请选择上方链接并复制。",
                          ),
                    ),
                  )
                }
              >
                <Copy size={14} />
                {text(locale, "Copy link", "复制链接")}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink size={14} />
                {text(locale, "Open", "打开")}
              </Button>
            </div>
          </>
        )}
      </WorkspaceDialog>
    </>
  );
}
