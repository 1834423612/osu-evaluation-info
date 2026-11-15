"use client";
import { useState, useEffect } from "react";
import { ArrowRightLeft, Copy, Check } from "lucide-react";
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
  copyLink,
  browserRequestId,
  sharingDate,
} from "@/lib/saved/share-links";
import {
  transferRequest,
  transferLink,
  TRANSFER_EVENT,
  type TransferSummary,
} from "@/lib/saved/transfer-client";
import { text, type Locale } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
type Created = {
  id: string;
  capability: string;
  code: string | null;
  expiresAt: string;
};
export function TransferSender({
  locale,
  selected,
  scopeKeys,
}: {
  locale: Locale;
  selected?: Set<string>;
  scopeKeys?: Set<string>;
}) {
  const [open, setOpen] = useState(false),
    [snapshot, setSnapshot] = useState<SavedSnapshot | null>(null),
    [requestId, setRequestId] = useState(""),
    [expiry, setExpiry] = useState("3600"),
    [created, setCreated] = useState<Created | null>(null),
    [busy, setBusy] = useState(false),
    [attempted, setAttempted] = useState(false),
    [notice, setNotice] = useState(""),
    [pairs, setPairs] = useState<TransferSummary["pairs"]>([]);
  useEffect(() => {
    if (!open || !created) return;
    let active = true;
    const load = async () => {
      try {
        const data = await transferRequest<{ transfers: TransferSummary[] }>(
          "",
        );
        if (active) {
          const current = data.transfers.find((x) => x.id === created.id);
          setPairs(current?.pairs ?? []);
          if (!current)
            setNotice(
              text(
                locale,
                "Transfer completed, expired or revoked.",
                "转存已完成、过期或撤销。",
              ),
            );
        }
      } catch {}
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [created, open, locale]);
  function begin() {
    try {
      const s = createLocalSnapshot(
        text(locale, "Favorites transfer", "收藏转存"),
      );
      if (scopeKeys) s.items = s.items.filter((x) => scopeKeys.has(itemKey(x)));
      if (selected?.size)
        s.items = s.items.filter((x) => selected.has(itemKey(x)));
      if (!s.items.length) throw Error();
      setSnapshot(s);
      setRequestId(browserRequestId());
      setCreated(null);
      setAttempted(false);
      setPairs([]);
      setNotice("");
      setOpen(true);
    } catch {
      setNotice(
        text(
          locale,
          "Select at least one saved item.",
          "请先选择至少一项收藏。",
        ),
      );
    }
  }
  async function create() {
    setBusy(true);
    setAttempted(true);
    setNotice("");
    try {
      setCreated(
        await transferRequest<Created>("", {
          requestId,
          snapshot,
          expiresIn: Number(expiry),
        }),
      );
      window.dispatchEvent(new Event(TRANSFER_EVENT));
    } catch {
      setNotice(
        text(
          locale,
          "Transfer unavailable. Retry with the same selection or export a file.",
          "转存暂不可用，可用同一份选择重试或导出文件。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button variant="outline" onClick={begin}>
        <ArrowRightLeft size={14} />
        {text(locale, "Transfer", "临时转存")}
      </Button>
      {notice && !open ? <small role="status">{notice}</small> : null}
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        title={text(locale, "Transfer to another device", "转存到其他设备")}
        description={text(
          locale,
          "No account needed. The transfer closes after the receiver saves it.",
          "无需账号，接收方保存后即关闭。 ",
        )}
        closeLabel={text(locale, "Close", "关闭")}
      >
        {!created ? (
          <>
            <p>
              {snapshot?.items.length}{" "}
              {text(locale, "selected items", "项已选收藏")}
            </p>
            <label className={styles.fields}>
              {text(locale, "Expires after", "有效期")}
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
                    ["900", "15 minutes", "15 分钟"],
                    ["3600", "1 hour", "1 小时"],
                    ["86400", "24 hours", "24 小时"],
                    ["604800", "7 days", "7 天"],
                  ].map(([value, en, zh]) => (
                    <SelectItem key={value} value={value}>
                      {text(locale, en, zh)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <Button disabled={busy} onClick={() => void create()}>
              {text(
                locale,
                attempted ? "Retry" : "Create transfer",
                attempted ? "重试" : "创建转存",
              )}
            </Button>
          </>
        ) : (
          <>
            <label className={styles.fields}>
              {text(locale, "Private link", "私密链接")}
              <input
                className={styles.input}
                readOnly
                value={transferLink(
                  location.origin,
                  created.id,
                  created.capability,
                )}
              />
            </label>
            <Button
              variant="outline"
              onClick={() =>
                void copyLink(
                  transferLink(location.origin, created.id, created.capability),
                )
                  .then(() =>
                    setNotice(text(locale, "Link copied", "链接已复制")),
                  )
                  .catch(() =>
                    setNotice(
                      text(
                        locale,
                        "Select the link and copy it.",
                        "请选择链接后复制。",
                      ),
                    ),
                  )
              }
            >
              <Copy size={14} />
              {text(locale, "Copy link", "复制链接")}
            </Button>
            {created.code ? (
              <p>
                <strong className={styles.transferCode}>{created.code}</strong>
                <small>
                  {text(
                    locale,
                    "Pairing code · 10 minutes · sender approval required",
                    "配对码 · 10 分钟有效 · 需要发送端确认",
                  )}
                </small>
              </p>
            ) : null}
            <small className={styles.muted}>
              {text(locale, "Transfer expires · ", "转存有效期至 · ") +
                sharingDate(created.expiresAt, locale)}
            </small>
            {pairs.map((pair) => (
              <div className={styles.panel} key={pair.id}>
                <strong className={styles.transferCode}>
                  {pair.challenge}
                </strong>
                <p>
                  {text(
                    locale,
                    "Match this number on the receiving device.",
                    "请与接收设备显示的确认数字核对。",
                  )}
                </p>
                <Button
                  variant="outline"
                  disabled={busy || pair.approved}
                  onClick={() => {
                    setBusy(true);
                    void transferRequest("/" + created.id, {
                      action: "approve",
                      pairId: pair.id,
                    })
                      .then(() =>
                        setPairs((p) =>
                          p.map((x) =>
                            x.id === pair.id ? { ...x, approved: true } : x,
                          ),
                        ),
                      )
                      .catch(() =>
                        setNotice(
                          text(
                            locale,
                            "Approval failed. Retry.",
                            "确认失败，请重试。",
                          ),
                        ),
                      )
                      .finally(() => setBusy(false));
                  }}
                >
                  <Check size={14} />
                  {pair.approved
                    ? text(locale, "Approved", "已确认")
                    : text(locale, "Approve this device", "允许此设备接收")}
                </Button>
              </div>
            ))}
          </>
        )}
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
      </WorkspaceDialog>
    </>
  );
}
