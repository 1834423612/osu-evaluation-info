"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { FileDown, Upload, Copy, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { usePreferences } from "@/hooks/use-preferences";
import type { RmpAdminRow } from "@/lib/rmp/admin-types";
import type {
  AssistanceProposal,
  AssistanceGroup,
} from "@/lib/rmp/assistance-types";
import styles from "./rmp-assistance-panel.module.css";
type JobSummary = {
  id: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  groupCount: number;
  pendingCount?: number;
  unproposedCount?: number;
  proposal: { id: string; status: string } | null;
};
type JobDetail = {
  id: string;
  outcomes?: {
    professorId: string;
    campus: string;
    token: string;
    action: string;
    courseKey: string | null;
    reason: string;
    version: string;
    recordedAt: string;
  }[];
  expiresAt: string;
  revokedAt: string | null;
  export: {
    schemaVersion: number;
    jobId: string;
    snapshotFingerprint: string;
    groups: AssistanceGroup[];
    proposalSchema: unknown;
  };
  proposal: {
    id: string;
    proposalSnapshot: string;
    data: AssistanceProposal;
    status: string;
    approvedKeys?: string[];
    rejectedKeys?: string[];
  } | null;
};
type Item = AssistanceProposal["items"][number];
export function RmpAssistancePanel({
  selected,
  onApplied,
  development,
}: {
  selected: RmpAdminRow[];
  onApplied: () => void;
  development: boolean;
}) {
  const { locale } = usePreferences();
  const t = useCallback(
    (en: string, zh: string) => (locale === "zh" ? zh : en),
    [locale],
  );
  const [jobs, setJobs] = useState<JobSummary[]>([]),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [remote, setRemote] = useState(false),
    [credential, setCredential] = useState<{
      token: string;
      url: string;
      expiresAt: string;
      jobId: string;
    } | null>(null),
    [detail, setDetail] = useState<JobDetail | null>(null),
    [items, setItems] = useState<Item[]>([]),
    [chosenKeys, setChosenKeys] = useState<string[]>([]),
    [confirmed, setConfirmed] = useState(false),
    [loading, setLoading] = useState(true),
    [queuePage, setQueuePage] = useState(1),
    [queueStatus, setQueueStatus] = useState("all"),
    [queueJob, setQueueJob] = useState(""),
    [queueDraft, setQueueDraft] = useState(""),
    [queueTotal, setQueueTotal] = useState(0),
    [queueRetry, setQueueRetry] = useState(0);
  const importer = useRef<HTMLInputElement>(null);
  const queueUrl =
    "/api/admin/rmp/assistance?" +
    new URLSearchParams({
      page: String(queuePage),
      status: queueStatus,
      job: queueJob,
    });
  async function request(path: string, body?: unknown) {
    const response = await fetch(path, {
      cache: "no-store",
      ...(body
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }
        : {}),
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error ?? "unavailable");
    return value;
  }
  const errorText = (error: unknown) =>
    error instanceof Error &&
    ["batch_conflict", "stale", "conflict", "scope"].includes(error.message)
      ? t(
          "Records or proposal changed. Export a new task and review again.",
          "记录或建议已变化，请重新导出任务并核对。",
        )
      : t(
          "The request failed. Check access and try again.",
          "请求失败，请检查权限后重试。",
        );
  async function refresh() {
    try {
      const data = await request(queueUrl);
      setJobs(data.jobs);
      setQueueTotal(data.total ?? data.jobs.length);
      setLoading(false);
    } catch (error) {
      setNotice(errorText(error));
      setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch(queueUrl, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const value = await r.json();
        if (!r.ok) throw Error();
        return value;
      })
      .then((value) => {
        if (!controller.signal.aborted) {
          setJobs(value.jobs);
          setQueueTotal(value.total ?? value.jobs.length);
          const last = Math.max(
            1,
            Math.ceil((value.total ?? value.jobs.length) / 20),
          );
          if (queuePage > last) setQueuePage(last);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setNotice(
            t("Assistance tasks are unavailable.", "查证任务暂不可用。"),
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [t, queueUrl, queuePage, queueRetry]);
  function download(value: unknown, id: string) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `rmp-assistance-${id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
  async function create() {
    setBusy(true);
    setNotice("");
    setCredential(null);
    try {
      const result = await request("/api/admin/rmp/assistance", {
        action: "create",
        groups: selected.map(({ professorId, campus, token }) => ({
          professorId,
          campus,
          token,
        })),
        remote,
        minutes: 60,
      });
      download(result.export, result.id);
      if (result.token)
        setCredential({
          token: result.token,
          url:
            window.location.origin +
            "/api/admin/rmp/assistance/job/" +
            result.id,
          expiresAt: result.expiresAt,
          jobId: result.id,
        });
      await refresh();
      setNotice(
        t(
          "Task exported. Suggestions need human approval.",
          "任务已导出；建议仍需人工批准。",
        ),
      );
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function open(jobId: string, proposalId?: string) {
    setBusy(true);
    setNotice("");
    try {
      const value = await request(
        "/api/admin/rmp/assistance?" +
          new URLSearchParams({ jobId, ...(proposalId ? { proposalId } : {}) }),
      );
      setDetail(value);
      setItems(
        value.proposal?.data.items.map((item: Item) => ({ ...item })) ?? [],
      );
      setConfirmed(false);
      setChosenKeys([]);
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function importFile(file: File) {
    setBusy(true);
    setNotice("");
    try {
      if (file.size > 2_000_000) throw Error("large");
      await request("/api/admin/rmp/assistance", {
        action: "import",
        proposal: JSON.parse(await file.text()),
      });
      await refresh();
      setNotice(t("Imported as a pending proposal.", "已作为待核对建议导入。"));
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
      if (importer.current) importer.current.value = "";
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      await request("/api/admin/rmp/assistance", {
        action: "revoke",
        jobId: id,
      });
      if (credential?.jobId === id) setCredential(null);
      await refresh();
      setNotice(t("Remote token revoked.", "远程令牌已撤销。"));
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  async function decide(approve: boolean) {
    if (!detail?.proposal) return;
    setBusy(true);
    setNotice("");
    try {
      if (approve) {
        await request("/api/admin/rmp/batch", {
          items: chosenItems.map(({ confidence, ...item }) => {
            void confidence;
            return item;
          }),
          confirmed: true,
          proposalId: detail.proposal.id,
          proposalSnapshot: detail.proposal.proposalSnapshot,
        });
        onApplied();
      } else
        await request("/api/admin/rmp/assistance", {
          action: "reject",
          proposalId: detail.proposal.id,
          groups: chosenItems.map(({ professorId, campus, token }) => ({
            professorId,
            campus,
            token,
          })),
        });
      const next = await request(
        "/api/admin/rmp/assistance?" +
          new URLSearchParams({
            jobId: detail.id,
            proposalId: detail.proposal.id,
          }),
      );
      setDetail(next);
      setItems(next.proposal?.data.items ?? []);
      setChosenKeys([]);
      setConfirmed(false);
      await refresh();
      setNotice(
        approve
          ? t("Reviewed changes applied.", "已应用经核对的修改。")
          : t("Proposal rejected.", "建议已拒绝。"),
      );
    } catch (error) {
      setNotice(errorText(error));
    } finally {
      setBusy(false);
    }
  }
  function edit(index: number, patch: Partial<Item>) {
    setItems((current) =>
      current.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
    setConfirmed(false);
  }
  const keyOf = (item: {
    professorId: string;
    campus: string;
    token: string;
  }) => `${item.professorId}:${item.campus}:${item.token}`;
  const processed = new Set([
    ...(detail?.proposal?.approvedKeys ?? []),
    ...(detail?.proposal?.rejectedKeys ?? []),
  ]);
  const chosenItems = items.filter(
    (item) => chosenKeys.includes(keyOf(item)) && !processed.has(keyOf(item)),
  );
  const valid =
    chosenItems.length > 0 &&
    chosenItems.every(
      (item) =>
        item.reason.trim().length >= 3 &&
        (item.action !== "bind" ||
          /^[A-Z]{2,20}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(
            item.courseKey ?? "",
          )),
    );
  return (
    <section
      className={styles.panel}
      data-development={development || undefined}
      aria-label={t("AI evidence assistance", "AI 查证辅助")}
    >
      <div className={styles.heading}>
        <div>
          <h2>{t("AI evidence assistance", "AI 查证辅助")}</h2>
          <p>
            {t(
              "Export public evidence for an AI or review it offline. Every suggestion stays pending until you approve it.",
              "导出公开资料供 AI 或离线查证；每条建议均需人工批准后生效。",
            )}
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={refresh}
          disabled={busy}
          aria-label={t("Refresh assistance", "刷新查证任务")}
        >
          <RefreshCw size={14} />
        </Button>
      </div>
      {development && (
        <p className={styles.mode}>
          {t(
            "Development tasks and decisions only.",
            "仅操作开发任务与开发决定。",
          )}
        </p>
      )}
      <div className={styles.actions}>
        <Button
          onClick={create}
          disabled={busy || !selected.length || selected.length > 100}
        >
          <FileDown size={14} />
          {t(
            `Export selected (${selected.length})`,
            `导出已选 (${selected.length})`,
          )}
        </Button>
        <label className={styles.check}>
          <input
            type="checkbox"
            checked={remote}
            onChange={(event) => setRemote(event.target.checked)}
            disabled={busy}
          />
          {t("Enable remote AI · 1-hour token", "启用远程 AI · 1 小时令牌")}
        </label>
        <Button
          variant="outline"
          onClick={() => importer.current?.click()}
          disabled={busy}
        >
          <Upload size={14} />
          {t("Import suggestion JSON", "导入建议 JSON")}
        </Button>
        <input
          ref={importer}
          type="file"
          accept="application/json,.json"
          className={styles.file}
          aria-label={t("Suggestion JSON file", "建议 JSON 文件")}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importFile(file);
          }}
        />
      </div>
      {credential && (
        <div className={`${styles.credential} rr-block`} data-telemetry-private>
          <strong>
            {t(
              "Copy the token now; it will not be shown again.",
              "请现在复制令牌，之后不会再次显示。",
            )}
          </strong>
          <p>
            {t(
              "Access is limited to this task and submitting unverified suggestions.",
              "访问仅限本任务与提交未核实建议。",
            )}
          </p>
          <label>
            {t("Job endpoint", "任务接口")}
            <input readOnly value={credential.url} />
          </label>
          <label>
            {t("Limited token", "受限令牌")}
            <input
              type="password"
              readOnly
              autoComplete="off"
              value={credential.token}
            />
          </label>
          <div className={styles.actions}>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(credential.token)
              }
            >
              <Copy size={13} />
              {t("Copy token", "复制令牌")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(credential.url)}
            >
              {t("Copy endpoint", "复制接口")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCredential(null)}
            >
              {t("Hide token", "隐藏令牌")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => revoke(credential.jobId)}
              disabled={busy}
            >
              {t("Revoke token", "撤销令牌")}
            </Button>
          </div>
          <small>
            {t("Expires", "到期")}:{" "}
            {new Date(credential.expiresAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en-US",
            )}
          </small>
        </div>
      )}
      <form
        className={styles.queueFilters}
        onSubmit={(event) => {
          event.preventDefault();
          if (
            queueDraft.trim() &&
            !/^[a-f0-9-]{36}$/i.test(queueDraft.trim())
          ) {
            setNotice(t("Enter a full task ID.", "请输入完整任务 ID。"));
            return;
          }
          setQueueJob(queueDraft.trim());
          setQueuePage(1);
          setQueueRetry((n) => n + 1);
          setLoading(true);
        }}
      >
        <label>
          {t("Task state", "任务状态")}
          <ChoiceSelect
            value={queueStatus}
            onValueChange={(value) => {
              setQueueStatus(value);
              setQueuePage(1);
              setLoading(true);
            }}
          >
            <option value="all">{t("All tasks", "全部任务")}</option>
            <option value="pending">{t("Pending review", "待核对")}</option>
            <option value="awaiting">
              {t("Awaiting suggestions", "等待建议")}
            </option>
            <option value="reviewed">
              {t("Reviewed history", "已核对历史")}
            </option>
          </ChoiceSelect>
        </label>
        <label>
          {t("Task ID", "任务 ID")}
          <input
            value={queueDraft}
            onChange={(event) => setQueueDraft(event.target.value)}
            maxLength={36}
            placeholder={t("Exact task ID (optional)", "完整任务 ID（可选）")}
          />
        </label>
        <Button size="sm" variant="outline" type="submit">
          {t("Filter tasks", "筛选任务")}
        </Button>
      </form>
      {notice && (
        <p className={styles.notice} role="status">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">{t("Loading tasks…", "正在加载任务…")}</p>
      ) : !jobs.length ? (
        <p className={styles.empty}>
          {t(
            "Select up to 100 groups, then export a task.",
            "选择最多 100 组记录，再导出任务。",
          )}
        </p>
      ) : (
        <ul className={styles.jobs}>
          {jobs.map((job) => (
            <li key={job.id + ":" + (job.proposal?.id ?? "new")}>
              <div>
                <strong>
                  {job.groupCount} {t("groups", "组")}
                </strong>
                <span>
                  {new Date(job.createdAt).toLocaleString(
                    locale === "zh" ? "zh-CN" : "en-US",
                  )}{" "}
                  ·{" "}
                  {job.proposal?.status === "pending"
                    ? t("Pending human review", "等待人工核对")
                    : job.proposal?.status === "approved"
                      ? t("Approved", "已批准")
                      : job.proposal?.status === "rejected"
                        ? t("Rejected", "已拒绝")
                        : job.proposal?.status === "reviewed"
                          ? t("Reviewed", "已核对")
                          : t("Awaiting suggestions", "等待建议")}
                  {!!job.unproposedCount &&
                    ` · ${job.unproposedCount} ${t("still need suggestions", "组仍待提交建议")}`}
                </span>
              </div>
              <div className={styles.actions}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => open(job.id, job.proposal?.id)}
                >
                  {job.proposal?.status === "pending"
                    ? t("Review proposal", "核对建议")
                    : t("View task", "查看任务")}
                </Button>
                {!job.revokedAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => revoke(job.id)}
                  >
                    {t("Revoke remote access", "撤销远程访问")}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {queueTotal > 20 && (
        <div className={styles.pagination}>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || queuePage === 1}
            onClick={() => {
              setQueuePage((n) => n - 1);
              setLoading(true);
            }}
          >
            {t("Previous task page", "上一页任务")}
          </Button>
          <span>
            {queuePage} / {Math.max(1, Math.ceil(queueTotal / 20))}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={loading || queuePage * 20 >= queueTotal}
            onClick={() => {
              setQueuePage((n) => n + 1);
              setLoading(true);
            }}
          >
            {t("Next task page", "下一页任务")}
          </Button>
        </div>
      )}
      <WorkspaceDialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open && !busy) setDetail(null);
        }}
        wide
        title={t("Review AI evidence", "核对 AI 查证建议")}
        description={t(
          "AI claims, URLs and confidence are unverified. Check the original evidence before confirming.",
          "AI 的理由、链接和置信度均未经核实，请查阅原始证据后再确认。",
        )}
        closeLabel={t("Close", "关闭")}
      >
        {detail && (
          <>
            <div className={styles.actions}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => download(detail.export, detail.id)}
              >
                <FileDown size={13} />
                {t("Export evidence", "导出资料")}
              </Button>
            </div>
            {detail.proposal ? (
              <>
                <p className={styles.source}>
                  {detail.proposal.data.sourceLabel} ·{" "}
                  {t("Unverified suggestions", "未经核实的建议")}
                </p>
                <div className={styles.actions}>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy || detail.proposal.status !== "pending"}
                    onClick={() => {
                      setChosenKeys(
                        items
                          .filter((item) => !processed.has(keyOf(item)))
                          .map(keyOf),
                      );
                      setConfirmed(false);
                    }}
                  >
                    {t("Select pending records", "选择待核对记录")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setChosenKeys([]);
                      setConfirmed(false);
                    }}
                  >
                    {t("Clear selection", "清除选择")}
                  </Button>
                  <span>
                    {chosenItems.length} {t("selected", "项已选")}
                  </span>
                </div>
                <div className={styles.review}>
                  {items.map((item, index) => {
                    const original = detail.proposal!.data.items[index],
                      outcome = detail.outcomes?.find(
                        (value) => keyOf(value) === keyOf(item),
                      ),
                      group = detail.export.groups.find(
                        (group) =>
                          group.professorId === item.professorId &&
                          group.campus === item.campus &&
                          group.token === item.token,
                      );
                    return (
                      <article
                        key={
                          item.professorId +
                          ":" +
                          item.campus +
                          ":" +
                          item.token
                        }
                      >
                        <label className={styles.recordSelection}>
                          <input
                            type="checkbox"
                            aria-label={t(
                              `Select ${item.professorId} ${item.campus} ${item.token}`,
                              `选择 ${item.professorId} ${item.campus} ${item.token}`,
                            )}
                            checked={chosenKeys.includes(keyOf(item))}
                            disabled={
                              busy ||
                              processed.has(keyOf(item)) ||
                              detail.proposal?.status !== "pending"
                            }
                            onChange={(event) => {
                              setChosenKeys((current) =>
                                event.target.checked
                                  ? [...current, keyOf(item)]
                                  : current.filter(
                                      (key) => key !== keyOf(item),
                                    ),
                              );
                              setConfirmed(false);
                            }}
                          />
                          <h3>
                            {group?.name ?? item.professorId} · {item.campus} ·{" "}
                            {item.token || t("Blank label", "空标签")}
                          </h3>
                        </label>
                        {processed.has(keyOf(item)) && (
                          <div className={styles.outcome}>
                            <strong>
                              {detail.proposal?.approvedKeys?.includes(
                                keyOf(item),
                              )
                                ? t(
                                    "Approved after human review",
                                    "经人工核对后已批准",
                                  )
                                : t(
                                    "Suggestion discarded · RMP unchanged",
                                    "建议已弃用 · RMP 未改变",
                                  )}
                            </strong>
                            {outcome && (
                              <>
                                <p>
                                  {outcome.action} ·{" "}
                                  {outcome.courseKey ??
                                    t(
                                      "No course association",
                                      "无课程关联",
                                    )}{" "}
                                  · v{outcome.version}
                                </p>
                                <p>{outcome.reason}</p>
                              </>
                            )}
                            <a
                              href={
                                "/admin/rmp?" +
                                new URLSearchParams({
                                  professor: item.professorId,
                                  campus: item.campus,
                                  course: item.token,
                                })
                              }
                            >
                              {t(
                                "View current mapping and audit",
                                "查看当前关联与审计",
                              )}
                            </a>
                          </div>
                        )}
                        <small>
                          {t(
                            "AI confidence (unverified)",
                            "AI 置信度（未经核实）",
                          )}
                          : {Math.round(original.confidence * 100)}%
                        </small>
                        <div className={styles.fields}>
                          <label>
                            {processed.has(keyOf(item))
                              ? t("Original AI action", "原始 AI 操作")
                              : t("Action", "操作")}
                            <ChoiceSelect
                              value={item.action}
                              disabled={
                                busy ||
                                processed.has(keyOf(item)) ||
                                detail.proposal?.status !== "pending"
                              }
                              onValueChange={(value) =>
                                edit(index, {
                                  action: value as Item["action"],
                                  courseKey:
                                    value === "bind"
                                      ? (item.courseKey ?? "")
                                      : null,
                                })
                              }
                            >
                              <option value="bind">{t("Bind", "绑定")}</option>
                              <option value="unbind">
                                {t("Unbind", "解绑")}
                              </option>
                              <option value="reject">
                                {t("Reject mapping", "排除匹配")}
                              </option>
                            </ChoiceSelect>
                          </label>
                          {item.action === "bind" && (
                            <label>
                              {processed.has(keyOf(item))
                                ? t("Original AI target", "原始 AI 目标")
                                : t("Official course key", "官方课程标识")}
                              <input
                                value={item.courseKey ?? ""}
                                maxLength={80}
                                disabled={
                                  busy ||
                                  processed.has(keyOf(item)) ||
                                  detail.proposal?.status !== "pending"
                                }
                                onChange={(event) =>
                                  edit(index, {
                                    courseKey: event.target.value
                                      .toUpperCase()
                                      .replaceAll(" ", ""),
                                  })
                                }
                              />
                            </label>
                          )}
                          <label className={styles.reason}>
                            {processed.has(keyOf(item))
                              ? t("Original AI reason", "原始 AI 理由")
                              : t("Reviewed reason", "经核对的理由")}
                            <textarea
                              rows={2}
                              maxLength={2000}
                              value={item.reason}
                              disabled={
                                busy ||
                                processed.has(keyOf(item)) ||
                                detail.proposal?.status !== "pending"
                              }
                              onChange={(event) =>
                                edit(index, { reason: event.target.value })
                              }
                            />
                          </label>
                        </div>
                        <details>
                          <summary>
                            {t(
                              "Original suggestion & public evidence",
                              "原始建议与公开资料",
                            )}
                          </summary>
                          <p>
                            {original.action} {original.courseKey ?? ""} ·{" "}
                            {original.reason}
                          </p>
                          <ul>
                            {original.evidenceUrls.map((url) => (
                              <li key={url}>
                                <a
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer nofollow"
                                >
                                  {url}
                                </a>
                              </li>
                            ))}
                          </ul>
                          <p>
                            {t("Official course evidence", "官方课程资料")}:{" "}
                            {group?.candidates
                              .map(
                                (candidate) =>
                                  candidate.key +
                                  " " +
                                  candidate.title +
                                  " (" +
                                  (candidate.source === "official_evaluation"
                                    ? t(
                                        "Official evaluation history",
                                        "官方评价历史",
                                      )
                                    : candidate.source ===
                                        "official_catalog_history"
                                      ? t(
                                          "Official catalog history",
                                          "官方目录历史",
                                        )
                                      : t("Published catalog", "已发布目录")) +
                                  (candidate.term
                                    ? " · " + candidate.term
                                    : "") +
                                  ")",
                              )
                              .join(" · ") ||
                              t("None in this snapshot", "此快照中没有候选")}
                          </p>
                          <p>
                            {t("Review excerpts", "评论节选")}:{" "}
                            {group?.reviews.length ?? 0} /{" "}
                            {group?.reviewCount ?? 0}
                            {group?.reviewsSampled
                              ? t(" · sampled or shortened", " · 已抽样或缩短")
                              : ""}
                          </p>
                          {group?.reviews.map((review) => (
                            <blockquote key={review.id}>
                              {review.course}: {review.comment}
                            </blockquote>
                          ))}
                        </details>
                      </article>
                    );
                  })}
                </div>
                {detail.proposal.status === "pending" && (
                  <>
                    <p className={styles.notice}>
                      {t(
                        "Rejecting suggestions leaves RMP mappings unchanged. The 'Reject mapping' action creates a course exclusion only if you approve it.",
                        "拒绝建议不会改变 RMP 关联；“排除匹配”操作只有经您批准后才会屏蔽课程关联。",
                      )}
                    </p>
                    <label className={styles.confirm}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(event) => setConfirmed(event.target.checked)}
                        disabled={busy}
                      />
                      {t(
                        "I checked the evidence and approve these changes.",
                        "我已核对证据并同意这些修改。",
                      )}
                    </label>
                    {notice && <p role="alert">{notice}</p>}
                    <div className={styles.actions}>
                      <Button
                        onClick={() => decide(true)}
                        disabled={busy || !confirmed || !valid}
                      >
                        {busy
                          ? t("Saving…", "正在保存…")
                          : t(
                              `Confirm ${chosenItems.length} reviewed changes`,
                              `确认 ${chosenItems.length} 项经核对的修改`,
                            )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => decide(false)}
                        disabled={busy || !chosenItems.length}
                      >
                        {t("Reject selected suggestions", "拒绝所选建议")}
                      </Button>
                    </div>
                  </>
                )}
              </>
            ) : (
              <p className={styles.empty}>
                {t(
                  "No suggestion has been submitted for this task.",
                  "此任务尚未提交建议。",
                )}
              </p>
            )}
          </>
        )}
      </WorkspaceDialog>
    </section>
  );
}
