"use client";
import { DraftForm } from "@/components/forms/draft-guard";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { OtpInput } from "@/components/account/otp-input";
import flow from "@/components/personal/exchange.module.css";
import { Copy, Trash2, Check, ArrowRightLeft } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { EmptyResult } from "@/components/brand/empty-result";
import { TransferSender } from "./transfer-sender";
import { CollectionImport } from "@/components/sharing/collection-import";
import { usePreferences } from "@/hooks/use-preferences";
import { snapshotSchema, type SavedSnapshot } from "@/lib/saved/exchange";
import { text } from "@/lib/i18n";
import { copyLink, sharingDate, linkCapability } from "@/lib/saved/share-links";
import {
  transferRequest,
  transferLink,
  TRANSFER_EVENT,
  type TransferSummary,
} from "@/lib/saved/transfer-client";
import styles from "@/components/ui/workspace.module.css";
type Pair = { pairId: string; challenge: string };
function subscribeSession(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}
function sessionValue(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function readPair(raw: string | null): Pair | null {
  try {
    const x = JSON.parse(raw ?? "null");
    return x && typeof x.pairId === "string" && typeof x.challenge === "string"
      ? x
      : null;
  } catch {
    return null;
  }
}

type Claim = { snapshot: SavedSnapshot; claim: string };
export function TransferPage({ id }: { id?: string }) {
  const { locale } = usePreferences(),
    router = useRouter();
  const [code, setCode] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [rows, setRows] = useState<TransferSummary[]>([]),
    [loadError, setLoadError] = useState(false),
    [confirm, setConfirm] = useState<string | null>(null),
    [approved, setApproved] = useState(false),
    [claim, setClaim] = useState<Claim | null>(null),
    [ackOverride, setPendingAck] = useState<string | null>(null),
    [completed, setCompleted] = useState(false),
    [available, setAvailable] = useState(true);
  const pairRaw = useSyncExternalStore(
    subscribeSession,
    () => sessionValue("course-atlas:transfer-pair:" + id),
    () => null,
  );
  const ackRaw = useSyncExternalStore(
    subscribeSession,
    () => sessionValue("course-atlas:transfer-ack:" + id),
    () => null,
  );
  const pair = readPair(pairRaw),
    pairId = pair?.pairId,
    pendingAck = ackOverride ?? ackRaw ?? "";
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setNotice(
        text(
          locale,
          message === "claimed"
            ? "Another device is receiving this transfer. Try after its lease expires."
            : message === "approval_required"
              ? "Waiting for sender approval."
              : "Transfer unavailable, expired or completed. Your existing favorites are kept.",
          message === "claimed"
            ? "其他设备正在接收，请在租约到期后重试。"
            : message === "approval_required"
              ? "正在等待发送端确认。"
              : "转存不可用、已过期或已完成，已有收藏仍保留。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        if (!id) {
          const data = await transferRequest<{ transfers: TransferSummary[] }>(
            "",
          );
          if (active) {
            setRows(data.transfers);
            setLoadError(false);
          }
        } else if (!claim && !completed && !pendingAck) {
          const data = await transferRequest<{
            approved: boolean;
            available: boolean;
          }>("/" + id, {
            action: "status",
            capability: linkCapability("transfer", id) ?? undefined,
            pairId,
          });
          if (active) {
            setApproved(data.approved);
            setAvailable(data.available);
            setNotice("");
          }
        }
      } catch {
        if (active && !id) setLoadError(true);
        if (active && id)
          setNotice(
            text(
              locale,
              "Transfer unavailable, expired or completed.",
              "转存不可用、已过期或已完成。",
            ),
          );
      }
    };
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 4000);
    window.addEventListener(TRANSFER_EVENT, load);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener(TRANSFER_EVENT, load);
    };
  }, [id, pairId, claim, completed, pendingAck, locale]);
  async function acknowledge(token: string) {
    if (!id) return;
    setPendingAck(token);
    try {
      sessionStorage.setItem("course-atlas:transfer-ack:" + id, token);
    } catch {}
    setBusy(true);
    try {
      await transferRequest("/" + id, { action: "ack", claim: token });
      setCompleted(true);
      setPendingAck("");
      setClaim(null);
      sessionStorage.removeItem("course-atlas:transfer-ack:" + id);
      setNotice(
        text(
          locale,
          "Saved on this device. Transfer completed.",
          "已保存在本机，转存已完成。",
        ),
      );
    } catch {
      setNotice(
        text(
          locale,
          "Saved on this device. Completion could not be confirmed; retry below.",
          "已保存在本机，暂未确认完成，请点击重试。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeader />
      <main className={styles.shell}>
        <div className={styles.heading}>
          <div>
            <h1>{text(locale, "Temporary transfer", "临时转存")}</h1>
            <p>
              {text(
                locale,
                "Send selected favorites between devices",
                "在设备间转存所选收藏",
              )}
            </p>
          </div>
          {!id ? <TransferSender locale={locale} /> : null}
        </div>
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        {!id ? (
          <div className={flow.transferGrid}>
            <section className={flow.codePanel}>
              <div className={flow.codeIcon}>
                <ArrowRightLeft size={24} />
              </div>
              <h2>{text(locale, "Pick up your favorites", "接续你的收藏")}</h2>
              <p>
                {text(
                  locale,
                  "Enter the code shown on the sending device. No file or account needed.",
                  "输入发送设备上的配对码，无需文件或账号。",
                )}
              </p>
              <DraftForm
                className={styles.fields}
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(async () => {
                    const result = await transferRequest<Pair & { id: string }>(
                      "/request",
                      { code },
                    );
                    sessionStorage.setItem(
                      "course-atlas:transfer-pair:" + result.id,
                      JSON.stringify({
                        pairId: result.pairId,
                        challenge: result.challenge,
                      }),
                    );
                    router.push(("/transfer/" + result.id) as Route);
                  });
                }}
              >
                <OtpInput
                  value={code}
                  onChange={setCode}
                  label={text(locale, "Pairing code", "配对码")}
                  disabled={busy}
                />
                <Button disabled={busy || code.length !== 6}>
                  {text(locale, "Request transfer", "请求接收")}
                </Button>
              </DraftForm>
            </section>
            <section className={styles.panel}>
              <h2>
                {text(
                  locale,
                  "Sent from this browser or account",
                  "此浏览器或账号发出的转存",
                )}
              </h2>
              {loadError ? (
                <p className={styles.notice} role="status">
                  {text(
                    locale,
                    "Sent transfers could not be refreshed. Retry when online.",
                    "暂无法刷新已发出的转存，请联网后重试。",
                  )}
                </p>
              ) : null}
              {!rows.length && !loadError ? (
                <EmptyResult layout="stack" size={56}>
                  {text(locale, "No active transfers", "暂无有效转存")}
                </EmptyResult>
              ) : (
                rows.map((row) => (
                  <div key={row.id} className={flow.transferRow}>
                    <div className={styles.panelHeading}>
                      <strong>{row.title}</strong>
                      <small>{row.items + text(locale, " items", " 项")}</small>
                    </div>
                    <small className={styles.muted}>
                      {sharingDate(row.expiresAt, locale)}
                    </small>
                    <div className={styles.actions}>
                      <Button
                        variant="outline"
                        onClick={() =>
                          void run(async () => {
                            await copyLink(
                              transferLink(
                                location.origin,
                                row.id,
                                row.capability,
                              ),
                            );
                            setNotice(
                              text(locale, "Link copied", "链接已复制"),
                            );
                          })
                        }
                      >
                        <Copy size={14} />
                        {text(locale, "Copy link", "复制链接")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirm(row.id)}
                      >
                        <Trash2 size={14} />
                        {text(locale, "Revoke", "撤销")}
                      </Button>
                    </div>
                    {confirm === row.id ? (
                      <div className={styles.notice}>
                        <p>
                          {text(
                            locale,
                            "Revoke this transfer? Its link and code will stop working.",
                            "撤销此转存？链接和配对码将失效。",
                          )}
                        </p>
                        <div className={styles.actions}>
                          <Button
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await transferRequest("/" + row.id, {
                                  action: "revoke",
                                });
                                setRows((x) =>
                                  x.filter((r) => r.id !== row.id),
                                );
                                setConfirm(null);
                              })
                            }
                          >
                            {text(locale, "Revoke transfer", "确认撤销")}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setConfirm(null)}
                          >
                            {text(locale, "Cancel", "取消")}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                    {row.code ? (
                      <p>
                        <b className={styles.transferCode}>{row.code}</b>
                        <small>
                          {text(
                            locale,
                            "Pairing code · 10 minutes",
                            "配对码 · 10 分钟有效",
                          )}
                        </small>
                      </p>
                    ) : null}
                    {row.pairs.map((p) => (
                      <div key={p.id} className={styles.notice}>
                        <b className={styles.transferCode}>{p.challenge}</b>
                        <p>
                          {text(
                            locale,
                            "Match this number on the receiving device.",
                            "请与接收设备显示的确认数字核对。",
                          )}
                        </p>
                        <Button
                          variant="outline"
                          disabled={busy || p.approved}
                          onClick={() =>
                            void run(async () => {
                              await transferRequest("/" + row.id, {
                                action: "approve",
                                pairId: p.id,
                              });
                              setRows((list) =>
                                list.map((r) =>
                                  r.id === row.id
                                    ? {
                                        ...r,
                                        pairs: r.pairs.map((x) =>
                                          x.id === p.id
                                            ? { ...x, approved: true }
                                            : x,
                                        ),
                                      }
                                    : r,
                                ),
                              );
                            })
                          }
                        >
                          <Check size={14} />
                          {p.approved
                            ? text(locale, "Approved", "已确认")
                            : text(
                                locale,
                                "Approve this device",
                                "允许此设备接收",
                              )}
                        </Button>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </section>
          </div>
        ) : completed ? (
          <section className={styles.panel}>
            <a href="/saved">
              {text(locale, "Open saved favorites", "查看收藏")}
            </a>
          </section>
        ) : pendingAck ? (
          <Button
            disabled={busy}
            variant="outline"
            onClick={() => void acknowledge(pendingAck)}
          >
            {text(locale, "Confirm completion again", "重新确认完成")}
          </Button>
        ) : claim ? (
          <CollectionImport
            mode="sync"
            snapshot={claim.snapshot}
            locale={locale}
            disabled={busy}
            onImported={() => void acknowledge(claim.claim)}
          />
        ) : (
          <section className={styles.panel}>
            {pair ? (
              <>
                <strong className={styles.transferCode}>
                  {pair.challenge}
                </strong>
                <p>
                  {approved
                    ? text(
                        locale,
                        "Sender approved this device.",
                        "发送端已允许此设备接收。",
                      )
                    : text(
                        locale,
                        "Confirm this number on the sending device.",
                        "请在发送设备上核对并确认这组数字。",
                      )}
                </p>
              </>
            ) : null}
            <Button
              disabled={busy || !available || (!!pair && !approved)}
              onClick={() =>
                void run(async () => {
                  const result = await transferRequest<Claim>("/" + id, {
                    action: "claim",
                    capability: linkCapability("transfer", id) ?? undefined,
                    pairId,
                  });
                  setClaim({
                    ...result,
                    snapshot: snapshotSchema.parse(result.snapshot),
                  });
                })
              }
            >
              {text(locale, "Receive favorites", "接收收藏")}
            </Button>
          </section>
        )}
      </main>
      <AppFooter />
    </>
  );
}
