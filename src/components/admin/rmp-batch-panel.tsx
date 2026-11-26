"use client";
import { useState } from "react";
import { Check, ListChecks, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { SearchField } from "@/components/ui/search-field";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { RmpReasonTemplates } from "./rmp-reason-templates";
import { usePreferences } from "@/hooks/use-preferences";
import type { RmpAdminRow } from "@/lib/rmp/admin-types";
import type { BatchIssue } from "@/lib/rmp/admin-batch";
import styles from "./rmp-batch.module.css";
type Entry = {
  row: RmpAdminRow;
  action: "bind" | "unbind" | "reject";
  target: string;
  reason: string;
  evidence: string;
};
const key = (row: { professorId: string; campus: string; token: string }) =>
  JSON.stringify([row.professorId, row.campus, row.token]);
const canonicalTarget = (target: string) =>
  target.toUpperCase().replace(/[^A-Z0-9.]/g, "");
export function RmpBatchPanel({
  selected,
  onApplied,
}: {
  selected: RmpAdminRow[];
  onApplied: () => void;
  development?: boolean;
}) {
  const { locale } = usePreferences(),
    zh = locale === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const [open, setOpen] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [sharedReason, setSharedReason] = useState("");
  const [dirty, setDirty] = useState(false),
    [phase, setPhase] = useState<"edit" | "review">("edit"),
    [confirmed, setConfirmed] = useState(false),
    [saving, setSaving] = useState(false);
  const [issues, setIssues] = useState<BatchIssue[]>([]),
    [error, setError] = useState("");
  const begin = () => {
    setEntries(
      selected.map((row) => ({
        row,
        action: "bind",
        target: row.candidates.length === 1 ? row.candidates[0] : "",
        reason: "",
        evidence: "",
      })),
    );
    setSharedReason("");
    setDirty(false);
    setPhase("edit");
    setConfirmed(false);
    setError("");
    setIssues([]);
    setOpen(true);
  };
  const update = (index: number, change: Partial<Entry>) => {
    const remaining = issues.filter(
      (issue) =>
        key(issue) !== key(entries[index].row) ||
        ["version_conflict", "evidence_changed"].includes(issue.code),
    );
    setIssues(remaining);
    if (!remaining.length) setError("");
    setEntries((old) =>
      old.map((entry, i) => (i === index ? { ...entry, ...change } : entry)),
    );
    setDirty(true);
    setConfirmed(false);
  };
  const fillAll = (reason: string) => {
    if (!issues.length) setError("");
    setSharedReason(reason);
    setEntries((old) => old.map((entry) => ({ ...entry, reason })));
    setDirty(true);
    setConfirmed(false);
  };
  const valid =
    entries.length > 0 &&
    entries.every(
      (entry) =>
        /^[a-f0-9]{64}$/.test(entry.row.recordFingerprint ?? "") &&
        entry.reason.trim().length >= 3 &&
        (entry.action !== "bind" ||
          /^[A-Z]{2,20}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}$/.test(
            canonicalTarget(entry.target),
          )),
    );
  async function apply() {
    if (!confirmed || !valid || saving || issues.length) return;
    setSaving(true);
    setError("");
    setIssues([]);
    try {
      const response = await fetch("/api/admin/rmp/batch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          items: entries.map(({ row, action, target, reason, evidence }) => ({
            professorId: row.professorId,
            campus: row.campus,
            token: row.token,
            action,
            courseKey:
              action === "bind"
                ? target.toUpperCase().replace(/[^A-Z0-9.]/g, "")
                : null,
            expectedVersion: row.version,
            recordFingerprint: row.recordFingerprint,
            reason,
            evidenceUrls: evidence
              .split("\n")
              .map((url) => url.trim())
              .filter(Boolean),
          })),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        setIssues(body.issues ?? []);
        throw Error(body.error ?? "unavailable");
      }
      setDirty(false);
      setOpen(false);
      setEntries([]);
      onApplied();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "unavailable");
    } finally {
      setSaving(false);
    }
  }
  const conflictKeys = new Set(issues.map(key));
  const rejected = [
    "batch_conflict",
    "batch_invalid",
    "invalid",
    "origin",
    "forbidden",
    "machine_token_cannot_apply",
    "conflict",
    "stale",
    "scope",
    "revoked",
    "expired",
  ].includes(error);
  return (
    <>
      <Button variant="outline" disabled={!selected.length} onClick={begin}>
        <ListChecks size={16} />
        {t("Batch decisions", "批量处理")} ({selected.length})
      </Button>
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        title={t("Batch course decisions", "批量课程决定")}
        description={t(
          "Prepare each target, review the scope, then confirm the whole batch.",
          "逐条设置目标、核对作用范围，再确认整批保存。",
        )}
        closeLabel={t("Close", "关闭")}
        wide
        dirty={dirty}
        detectFormChanges={false}
      >
        <div className={styles.panel}>
          <p className={styles.scope}>
            {t(
              "Each decision applies to every review sharing its profile, campus and original label, including future matching reviews. If a label mixes courses, leave that group unbound.",
              "每条决定作用于同一档案、校区和原始标签的全部评论，并持续作用于之后匹配的评论；若混合不同课程，请保留未绑定状态。",
            )}
          </p>
          {phase === "edit" ? (
            <>
              <section className={styles.reasonTools}>
                <RmpReasonTemplates zh={zh} onSelect={fillAll} />
                <label>
                  {t("Shared reason · editable", "共用理由 · 可编辑")}
                  <textarea
                    value={sharedReason}
                    maxLength={2000}
                    rows={2}
                    onChange={(event) => {setSharedReason(event.target.value);setDirty(true);}}
                  />
                </label>
                <Button
                  variant="outline"
                  disabled={sharedReason.trim().length < 3}
                  onClick={() => fillAll(sharedReason)}
                >
                  {t("Fill every reason", "填入全部理由")}
                </Button>
              </section>
              <div className={styles.entries}>
                {entries.map((entry, index) => (
                  <section
                    className={styles.entry}
                    key={key(entry.row)}
                    data-batch-entry
                    data-conflict={
                      conflictKeys.has(key(entry.row)) || undefined
                    }
                  >
                    <div className={styles.entryHeading}>
                      <div>
                        <strong>{entry.row.name}</strong>
                        <small>
                          #{entry.row.professorId} · {entry.row.campus} ·{" "}
                          {entry.row.token || "∅"} · {entry.row.reviewCount}{" "}
                          {t("reviews", "条评论")}
                        </small>
                        <small>
                          {t("Current:", "当前：")} {entry.row.courseKey ?? "—"}{" "}
                          · v{entry.row.version}
                        </small>
                      </div>
                      <Button
                        variant="ghost"
                        aria-label={t(
                          `Remove ${entry.row.name} from batch`,
                          `从批次移除 ${entry.row.name}`,
                        )}
                        onClick={() => {
                          setEntries((old) =>
                            old.filter((_, i) => i !== index),
                          );
                          const remaining = issues.filter(
                            (issue) => key(issue) !== key(entry.row),
                          );
                          setIssues(remaining);
                          if (!remaining.length) setError("");
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={15} />
                      </Button>
                    </div>
                    <div className={styles.fields}>
                      <label>
                        {t("Action", "操作")}
                        <ChoiceSelect
                          value={entry.action}
                          onValueChange={(value) =>
                            update(index, { action: value as Entry["action"] })
                          }
                        >
                          <option value="bind">
                            {t("Bind course", "绑定课程")}
                          </option>
                          <option value="unbind">{t("Unbind", "解绑")}</option>
                          <option value="reject">
                            {t("Reject association", "拒绝关联")}
                          </option>
                        </ChoiceSelect>
                      </label>
                      <label>
                        {t("Target course", "目标课程")}
                        <SearchField
                          aria-label={t(
                            `Target for ${entry.row.name}`,
                            `${entry.row.name} 的目标课程`,
                          )}
                          value={entry.target}
                          maxLength={40}
                          disabled={entry.action !== "bind"}
                          list={`rmp-batch-candidates-${index}`}
                          onValueChange={(target) => update(index, { target })}
                        />
                        <datalist id={`rmp-batch-candidates-${index}`}>
                          {entry.row.candidates.map((course) => (
                            <option key={course} value={course} />
                          ))}
                        </datalist>
                      </label>
                      <label className={styles.reason}>
                        {t("Reason", "理由")}
                        <textarea
                          aria-label={t(
                            `Reason for ${entry.row.name}`,
                            `${entry.row.name} 的理由`,
                          )}
                          value={entry.reason}
                          maxLength={2000}
                          rows={2}
                          onChange={(event) =>
                            update(index, { reason: event.target.value })
                          }
                        />
                      </label>
                    </div>
                    {entry.row.candidates.length > 1 ? (
                      <small className={styles.ambiguous}>
                        {t(
                          "Ambiguous: choose a target after reviewing the evidence.",
                          "存在歧义：核对证据后再选择目标课程。",
                        )}
                      </small>
                    ) : null}
                    <details>
                      <summary>{t("Evidence URLs", "证据链接")}</summary>
                      <textarea
                        aria-label={t(
                          `Evidence links for ${entry.row.name}`,
                          `${entry.row.name} 的证据链接`,
                        )}
                        value={entry.evidence}
                        maxLength={24012}
                        onChange={(event) =>
                          update(index, { evidence: event.target.value })
                        }
                        rows={2}
                        placeholder="https://…"
                      />
                    </details>
                  </section>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className={styles.preview}>
                <table>
                  <thead>
                    <tr>
                      <th>{t("Profile / group", "档案 / 评论组")}</th>
                      <th>{t("Current → target", "当前 → 目标")}</th>
                      <th>{t("Reason", "理由")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={key(entry.row)}>
                        <td>
                          <strong>{entry.row.name}</strong>
                          <small>
                            #{entry.row.professorId} · {entry.row.campus} ·{" "}
                            {entry.row.token || "∅"} · {entry.row.reviewCount}{" "}
                            {t("reviews", "条评论")}
                          </small>
                        </td>
                        <td>
                          {entry.row.courseKey ?? "—"} →{" "}
                          {entry.action === "bind"
                            ? entry.target
                            : entry.action === "unbind"
                              ? t("Unbound", "未绑定")
                              : t("Rejected", "已拒绝")}
                        </td>
                        <td>{entry.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <label className={styles.confirm}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                <span>
                  {t(
                    `I reviewed all ${entries.length} groups, targets and reasons. Apply the whole batch.`,
                    `我已核对全部 ${entries.length} 组评论、目标和理由，确认整批应用。`,
                  )}
                </span>
              </label>
            </>
          )}
          {error ? (
            <div role="alert" className={styles.error}>
              <strong>
                {rejected
                  ? t("No batch changes were saved.", "整批变更均未保存。")
                  : t(
                      "Batch result could not be confirmed.",
                      "无法确认整批保存结果。",
                    )}
              </strong>
              <p>
                {error === "batch_conflict"
                  ? t(
                      "Some versions or evidence changed. Refresh and review the affected groups before retrying.",
                      "部分版本或证据已变化，请刷新并重新核对受影响的评论组。",
                    )
                  : t(
                      "Check permissions, official course targets, reasons and HTTPS evidence links.",
                      "请检查权限、官方课程目标、理由及 HTTPS 证据链接。",
                    )}
              </p>
              {issues.map((issue) => (
                <small key={key(issue)}>
                  {issue.campus} · {issue.token || "∅"} · #{issue.professorId}:{" "}
                  {issue.code === "version_conflict"
                    ? t("Version changed", "版本已变化")
                    : issue.code === "evidence_changed"
                      ? t("Evidence changed", "证据已变化")
                      : t(
                          "Invalid group or official course",
                          "评论组或官方课程无效",
                        )}
                </small>
              ))}
            </div>
          ) : null}
          <div className={styles.actions}>
            <span>
              {entries.length} {t("groups selected", "个评论组")}
            </span>
            {phase === "edit" ? (
              <Button
                disabled={!valid}
                onClick={() => {
                  setPhase("review");
                  setConfirmed(false);
                  if (!issues.length) setError("");
                }}
              >
                {t("Review batch", "核对整批")}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  disabled={saving}
                  onClick={() => {
                    setPhase("edit");
                    setConfirmed(false);
                  }}
                >
                  {t("Back to edit", "返回编辑")}
                </Button>
                <Button
                  disabled={!confirmed || saving || issues.length > 0}
                  onClick={() => void apply()}
                >
                  <Check size={16} />
                  {saving
                    ? t("Saving…", "保存中…")
                    : t("Confirm and apply batch", "确认并应用整批")}
                </Button>
              </>
            )}
          </div>
        </div>
      </WorkspaceDialog>
    </>
  );
}
