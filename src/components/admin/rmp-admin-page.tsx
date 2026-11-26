"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { AdminFilters } from "@/lib/rmp/admin-input";
import {
  Database,
  AlertTriangle,
  LockKeyhole,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { RmpBatchPanel } from "./rmp-batch-panel";
import { RmpAssistancePanel } from "./rmp-assistance-panel";
import { RmpReasonTemplates } from "./rmp-reason-templates";
import { usePreferences } from "@/hooks/use-preferences";
import { debugTools } from "@/lib/debug/client";
import type {
  RmpAdminRow,
  RmpAdminDetail,
  RmpAdminResult,
} from "@/lib/rmp/admin-types";
import ui from "@/components/ui/workspace.module.css";
import styles from "./rmp-admin.module.css";
const statuses = {
  all: ["All states", "全部状态"],
  accepted: ["Automatic match", "自动匹配"],
  ambiguous: ["Ambiguous", "有歧义"],
  unresolved: ["Unresolved", "未解析"],
  stale: ["Stale", "已过期"],
  bound: ["Manually bound", "人工绑定"],
  unbound: ["Unbound", "已解绑"],
  rejected: ["Rejected", "已拒绝"],
};
const rowKey = (row: RmpAdminRow) =>
  JSON.stringify([row.professorId, row.campus, row.token]);
async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok)
    throw Error(response.status === 403 ? "forbidden" : "unavailable");
  return response.json();
}
export function RmpAdminPage({
  initialFilters,
}: {
  initialFilters: AdminFilters;
}) {
  const { locale } = usePreferences(),
    zh = locale === "zh",
    t = (en: string, cn: string) => (zh ? cn : en);
  const { page: initialPage, ...initialFields } = initialFilters;
  const [draft, setDraft] = useState(initialFields),
    [filters, setFilters] = useState(initialFields),
    [page, setPage] = useState(initialPage),
    [retry, setRetry] = useState(0);
  const [development, setDevelopment] = useState(false);
  const [selection, setSelection] = useState<Set<string>>(() => new Set());
  const [developmentCourseView, setDevelopmentCourseView] = useState(false);
  const [data, setData] = useState<RmpAdminResult | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [detail, setDetail] = useState<RmpAdminDetail | null>(null),
    [opening, setOpening] = useState(false);
  const [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [links, setLinks] = useState(""),
    [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState(""),
    [catalog, setCatalog] = useState<
      { key: string; title: string; source?: string; term?: string | null }[]
    >([]);
  useEffect(() => {
    const controller = new AbortController();
    void read<{ development: boolean; developmentCourseView?: boolean }>(
      "/api/admin/rmp?access=1",
      controller.signal,
    )
      .then((access) => {
        if (!controller.signal.aborted) {
          setDevelopment(access.development);
          setDevelopmentCourseView(!!access.developmentCourseView);
        }
      })
      .catch(() => {});
    void read<RmpAdminResult>(
      "/api/admin/rmp?" +
        new URLSearchParams({ ...filters, page: String(page) }),
      controller.signal,
    )
      .then((value) => {
        if (!controller.signal.aborted) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setData(null);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [filters, page, retry]);
  useEffect(() => {
    if (!detail || target.trim().length < 2) {
      return;
    }
    const controller = new AbortController(),
      timer = setTimeout(() => {
        void read<{ items: { key: string; title: string }[] }>(
          "/api/admin/rmp?catalog=" +
            encodeURIComponent(target) +
            "&campus=" +
            encodeURIComponent(detail.row.campus),
          controller.signal,
        )
          .then((result) => setCatalog(result.items))
          .catch(() => {});
      }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [target, detail]);
  async function open(row: RmpAdminRow, preserveDraft = false) {
    setOpening(true);
    setSaveError("");
    try {
      const next = await read<RmpAdminDetail>(
        "/api/admin/rmp?" +
          new URLSearchParams({
            professorId: row.professorId,
            campus: row.campus,
            token: row.token,
          }),
      );
      setDetail(next);
      if (!preserveDraft) {
        setTarget(next.row.courseKey ?? next.row.candidates[0] ?? "");
        setReason("");
        setLinks("");
        setDirty(false);
      }
    } catch {
      setError("unavailable");
    } finally {
      setOpening(false);
    }
  }
  async function decide(action: "bind" | "unbind" | "reject") {
    if (!detail || saving) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/admin/rmp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          professorId: detail.row.professorId,
          campus: detail.row.campus,
          token: detail.row.token,
          action,
          courseKey:
            action === "bind"
              ? target.toUpperCase().replace(/[^A-Z0-9.]/g, "")
              : null,
          reason,
          evidenceUrls: links
            .split(/\n/)
            .map((url) => url.trim())
            .filter(Boolean),
          expectedVersion: detail.row.version,
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        throw Error(body.error ?? "unavailable");
      }
      setDirty(false);
      setReason("");
      setLinks("");
      await open(detail.row);
      setSelection(new Set());
      setRetry((value) => value + 1);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "unavailable");
    } finally {
      setSaving(false);
    }
  }
  const stateLabel = (state: string) =>
    statuses[state as keyof typeof statuses]?.[zh ? 1 : 0] ?? state;
  const refresh = () => {
    setSelection(new Set());
    setLoading(true);
    setRetry((value) => value + 1);
  };
  const selectedRows = (data?.items ?? []).filter((row) =>
    selection.has(rowKey(row)),
  );
  const allSelected =
    !!data?.items.length && selectedRows.length === data.items.length;
  return (
    <>
      <AppHeader active="rmp" />
      <main className={`${ui.shell} ${styles.shell}`}>
        <div className={ui.heading}>
          <div>
            <h1 className={ui.pageTitle}>
              <Database size={22} />
              {t("RMP reconciliation", "RMP 数据核对")}
            </h1>
            <p>
              {t(
                "Review course labels and their evidence",
                "核对课程标签及其证据",
              )}
            </p>
          </div>
          <div className={ui.tools}>
            <Link href="/admin/users">
              {t("Accounts & permissions", "账号与权限")}
            </Link>
            <Link href="/rmp">{t("Browse RMP", "浏览 RMP")}</Link>
          </div>
        </div>
        {development || data?.development ? (
          <aside className={styles.warning} role="status">
            <AlertTriangle size={22} />
            <div>
              <strong>
                {t(
                  "Development mode · administrator checks relaxed",
                  "开发模式 · 管理员认证已放宽",
                )}
              </strong>
              <p>
                {t(
                  "Private network access verified. Decisions are written to the development schema.",
                  "已验证私有网络访问；人工决定写入开发数据库命名空间。",
                )}
                {!developmentCourseView ? (
                  <>
                    {" "}
                    {t(
                      "Development course preview is inactive; public RMP pages still show published bindings.",
                      "开发课程预览未启用；公开 RMP 页面仍显示已发布的绑定。",
                    )}
                  </>
                ) : null}
              </p>
            </div>
          </aside>
        ) : null}
        {error === "forbidden" ? (
          <section className={ui.panel}>
            <h2>
              <LockKeyhole size={18} />
              {t("Administrator access required", "需要管理员权限")}
            </h2>
            <p>
              {t(
                "Sign in with a verified account holding an active administrator role within the last 30 minutes, then unlock administrator tools.",
                "请使用已验证且获授权的管理员账号在 30 分钟内重新登录，再解锁管理工具。",
              )}
            </p>
            <div className={ui.tools}>
              <Button asChild variant="outline">
                <a href="/account">{t("Account", "账号")}</a>
              </Button>
              <Button onClick={() => debugTools.open()}>
                {t("Unlock administrator tools", "解锁管理工具")}
              </Button>
              <Button variant="ghost" onClick={refresh}>
                {t("Check access", "检查权限")}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <form
              className={styles.filters}
              onSubmit={(event) => {
                event.preventDefault();
                setSelection(new Set());
                setLoading(true);
                setFilters({ ...draft });
                setPage(1);
                window.history.replaceState(
                  null,
                  "",
                  "?" + new URLSearchParams(draft),
                );
              }}
            >
              {(
                [
                  ["course", "Course", "课程"],
                  ["professor", "Professor / profile ID", "教授 / 档案 ID"],
                  [
                    "keyword",
                    "Keyword in evidence or reviews",
                    "证据或评论关键词",
                  ],
                ] as const
              ).map(([key, en, cn]) => (
                <label key={key}>
                  {t(en, cn)}
                  <SearchField
                    value={draft[key]}
                    maxLength={
                      key === "keyword" ? 200 : key === "professor" ? 120 : 80
                    }
                    onValueChange={(value) =>
                      setDraft({ ...draft, [key]: value })
                    }
                  />
                </label>
              ))}
              <label>
                {t("Status", "状态")}
                <ChoiceSelect
                  value={draft.status}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      status: value as AdminFilters["status"],
                    })
                  }
                >
                  {Object.keys(statuses).map((state) => (
                    <option key={state} value={state}>
                      {stateLabel(state)}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <label>
                {t("Campus", "校区")}
                <ChoiceSelect
                  value={draft.campus}
                  onValueChange={(value) =>
                    setDraft({
                      ...draft,
                      campus: value as AdminFilters["campus"],
                    })
                  }
                >
                  {["ALL", "COL", "MNS", "LMA", "MRN", "NWK", "WST"].map(
                    (campus) => (
                      <option key={campus} value={campus}>
                        {campus === "ALL"
                          ? t("All campuses", "全部校区")
                          : campus}
                      </option>
                    ),
                  )}
                </ChoiceSelect>
              </label>
              <Button type="submit">{t("Filter", "筛选")}</Button>
              <Button
                type="button"
                variant="ghost"
                aria-label={t("Refresh", "刷新")}
                disabled={loading}
                onClick={refresh}
              >
                <RefreshCw size={16} />
              </Button>
            </form>
            {error ? (
              <p role="alert" className={ui.notice}>
                {t(
                  "Data unavailable. Check the RMP administration migration and database connection.",
                  "数据暂不可用，请检查 RMP 管理迁移和数据库连接。",
                )}
              </p>
            ) : null}
            <div className={styles.listHeader}>
              <strong aria-live="polite">
                {loading
                  ? t("Loading…", "读取中…")
                  : `${data?.total.toLocaleString() ?? 0} ${t("records", "条记录")}`}
              </strong>
              <span>
                {t(
                  "One profile · campus · source label per record",
                  "每条记录对应一个档案、校区与原始标签",
                )}
              </span>
            </div>
            <div className={styles.selectionBar}>
              <label className={styles.selectPage}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(node) => {
                    if (node)
                      node.indeterminate =
                        selectedRows.length > 0 && !allSelected;
                  }}
                  disabled={loading || !data?.items.length}
                  onChange={(event) =>
                    setSelection(
                      event.target.checked
                        ? new Set((data?.items ?? []).map(rowKey))
                        : new Set(),
                    )
                  }
                />
                {t("Select current page", "选择当前页")}
              </label>
              <span aria-live="polite">
                {selectedRows.length}{" "}
                {t("selected on this page", "条当前页记录已选")}
              </span>
              <RmpBatchPanel
                selected={selectedRows}
                onApplied={refresh}
                development={development}
              />
              {selectedRows.length ? (
                <Button variant="ghost" onClick={() => setSelection(new Set())}>
                  {t("Clear selection", "清除选择")}
                </Button>
              ) : null}
            </div>
            <div className={styles.tableWrap} aria-busy={loading}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("Professor", "教授")}</th>
                    <th>{t("Source → course", "原始标签 → 课程")}</th>
                    <th>{t("Status", "状态")}</th>
                    <th>{t("Evidence", "证据")}</th>
                    <th>
                      <span className="sr-only">{t("Actions", "操作")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.items ?? []).map((row) => (
                    <tr key={`${row.professorId}:${row.campus}:${row.token}`}>
                      <td>
                        <div className={styles.profileCell}>
                          <label className={styles.selectionBox}>
                            <input
                              type="checkbox"
                              aria-label={t(
                                `Select ${row.name} ${row.campus} ${row.token}`,
                                `选择 ${row.name} ${row.campus} ${row.token}`,
                              )}
                              checked={selection.has(rowKey(row))}
                              disabled={loading}
                              onChange={(event) =>
                                setSelection((old) => {
                                  const next = new Set(old);
                                  if (event.target.checked)
                                    next.add(rowKey(row));
                                  else next.delete(rowKey(row));
                                  return next;
                                })
                              }
                            />
                          </label>
                          <div>
                            <strong>{row.name}</strong>
                            <small>{row.department}</small>
                            <small>
                              #{row.professorId} · {row.campus}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code>{row.token || "∅"}</code>
                        <span className={styles.arrow}>→</span>
                        <strong>{row.courseKey ?? "—"}</strong>
                        <small>
                          {row.reviewCount} {t("reviews", "条评论")}
                        </small>
                      </td>
                      <td>
                        <span className={styles.badge} data-state={row.state}>
                          {stateLabel(row.state)}
                        </span>
                        {row.version > 0 ? (
                          <small>
                            v{row.version} · {t("manual", "人工")}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <small>
                          {row.username
                            ? `${t("Verified identity", "已核实身份")}: ${row.username}`
                            : t("Identity unconfirmed", "身份未核实")}
                        </small>
                        <small>
                          {row.candidates.length}{" "}
                          {t("course candidates", "个课程候选")}
                        </small>
                      </td>
                      <td>
                        <Button
                          variant="ghost"
                          disabled={opening}
                          onClick={() => void open(row)}
                        >
                          {t("Preview", "预览")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!loading && !data?.items.length ? (
                    <tr>
                      <td colSpan={5} className={styles.empty}>
                        {t(
                          "No records match these filters.",
                          "没有符合筛选的记录。",
                        )}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <nav
              className={styles.pagination}
              aria-label={t("Result pages", "结果分页")}
            >
              <span>
                {t("Page", "第")} {page} /{" "}
                {Math.max(1, Math.ceil((data?.total ?? 0) / 30))}
                {zh ? " 页" : ""}
              </span>
              <Button
                variant="outline"
                disabled={loading || page === 1}
                onClick={() => {
                  setLoading(true);
                  setSelection(new Set());
                  setPage((n) => n - 1);
                }}
              >
                <ChevronLeft size={16} />
                {t("Previous", "上一页")}
              </Button>
              <Button
                variant="outline"
                disabled={loading || page * 30 >= (data?.total ?? 0)}
                onClick={() => {
                  setLoading(true);
                  setSelection(new Set());
                  setPage((n) => n + 1);
                }}
              >
                {t("Next", "下一页")}
                <ChevronRight size={16} />
              </Button>
            </nav>
            <RmpAssistancePanel
              selected={selectedRows}
              onApplied={refresh}
              development={development}
            />
          </>
        )}
      </main>
      <AppFooter />
      <WorkspaceDialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={
          detail
            ? `${detail.row.name} · ${detail.row.token}`
            : t("Record preview", "记录预览")
        }
        description={t(
          "Review source evidence before saving a course decision.",
          "保存人工课程决定前，请核对来源证据。",
        )}
        closeLabel={t("Close", "关闭")}
        wide
        dirty={dirty}
        detectFormChanges={false}
      >
        {detail ? (
          <div className={styles.detail}>
            <div className={styles.detailHeader}>
              <span className={styles.badge} data-state={detail.row.state}>
                {stateLabel(detail.row.state)}
              </span>
              <span>
                {detail.row.campus} · v{detail.row.version}
              </span>
              <a
                href={`https://www.ratemyprofessors.com/professor/${detail.row.professorId}`}
                target="_blank"
                rel="noreferrer"
              >
                RMP <ExternalLink size={14} />
              </a>
            </div>
            <p className={styles.boundary}>
              {t(
                "Course-label inference does not verify an official teaching assignment. Identity and official teaching evidence are shown separately.",
                "课程标签推断不代表官方授课关系。身份与官方授课证据分别展示。",
              )}
            </p>
            <section>
              <h3>{t("Official teaching evidence", "官方授课证据")}</h3>
              {detail.teaching.length ? (
                <div className={styles.facts}>
                  {detail.teaching.map((fact) => (
                    <div key={`${fact.source}:${fact.source_record_key}`}>
                      <strong>{fact.course_key}</strong>
                      <small>
                        {fact.campus_code} · {fact.latest_term} ·{" "}
                        {fact.source === "official_catalog"
                          ? t("Official OSU catalog", "OSU 官方课程目录")
                          : fact.source === "official_evaluation"
                            ? t("Official OSU evaluations", "OSU 官方教学评价")
                            : fact.source}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p>
                  {t(
                    "No verified official teaching evidence for this identity.",
                    "该身份暂无已核实的官方授课证据。",
                  )}
                </p>
              )}
            </section>
            <section>
              <h3>{t("Course candidates", "课程候选")}</h3>
              <div className={ui.tools}>
                {detail.row.candidates.map((course) => (
                  <Button
                    key={course}
                    variant="outline"
                    onClick={() => {
                      setTarget(course);
                      setDirty(true);
                    }}
                  >
                    {course}
                  </Button>
                ))}
                {!detail.row.candidates.length ? (
                  <span>{t("No automatic candidates", "暂无自动候选")}</span>
                ) : null}
              </div>
            </section>
            <section className={styles.decision}>
              <h3>{t("Manual decision", "人工决定")}</h3>
              <p className={styles.scope}>
                {t(
                  `Applies to all ${detail.row.reviewCount} active reviews with this source label for this profile and campus. If the group mixes different courses, leave it ambiguous.`,
                  `此决定作用于该档案、该校区下所有 ${detail.row.reviewCount} 条使用此原始标签的有效评论；若混合了不同课程，请保留歧义。`,
                )}
              </p>
              <label>
                {t("Official course code", "官方课程代码")}
                <SearchField
                  value={target}
                  list="rmp-official-courses"
                  onValueChange={(value) => {
                    setTarget(value);
                    setDirty(true);
                  }}
                  placeholder="MATH 1131"
                  autoComplete="off"
                />
                <datalist id="rmp-official-courses">
                  {catalog.map((course) => (
                    <option
                      key={`${course.key}:${course.title}`}
                      value={course.key}
                    >
                      {[
                        course.title,
                        course.source === "official_evaluation"
                          ? t("Official evaluation history", "官方教学评价历史")
                          : course.source === "official_catalog_history"
                            ? t("Official catalog history", "官方课程目录历史")
                            : t("Published catalog", "已发布课程目录"),
                        course.term,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                {t("Reason (required)", "理由（必填）")}
                <textarea
                  value={reason}
                  minLength={3}
                  maxLength={2000}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setDirty(true);
                  }}
                  rows={3}
                />
              </label>
              <RmpReasonTemplates
                zh={zh}
                onSelect={(value) => {
                  setReason(value);
                  setDirty(true);
                }}
              />
              <label>
                {t(
                  "Evidence URLs · one HTTPS link per line",
                  "证据链接 · 每行一个 HTTPS 链接",
                )}
                <textarea
                  value={links}
                  onChange={(event) => {
                    setLinks(event.target.value);
                    setDirty(true);
                  }}
                  rows={2}
                />
              </label>
              {detail.row.manualReason ? (
                <p>
                  {t("Current decision:", "当前人工理由：")}{" "}
                  {detail.row.manualReason}
                </p>
              ) : null}
              {saveError ? (
                <p role="alert" className={ui.notice}>
                  {saveError === "conflict"
                    ? t(
                        "Another administrator changed this record. Reload and review the new version before saving.",
                        "其他管理员已修改此记录，请重新读取并核对新版本后再保存。",
                      )
                    : t(
                        "Could not save. Use a published official course, a reason of at least 3 characters and valid HTTPS evidence links.",
                        "保存失败。请填写已发布的官方课程、至少 3 个字符的理由及有效的 HTTPS 证据链接。",
                      )}
                </p>
              ) : null}
              <div className={ui.tools}>
                <Button
                  disabled={
                    saving || reason.trim().length < 3 || !target.trim()
                  }
                  onClick={() => void decide("bind")}
                >
                  {t("Bind course", "绑定课程")}
                </Button>
                <Button
                  variant="outline"
                  disabled={saving || reason.trim().length < 3}
                  onClick={() => void decide("unbind")}
                >
                  {t("Unbind", "解绑")}
                </Button>
                <Button
                  variant="destructive"
                  disabled={saving || reason.trim().length < 3}
                  onClick={() => void decide("reject")}
                >
                  {t("Reject match", "拒绝匹配")}
                </Button>
                {saveError === "conflict" ? (
                  <Button
                    variant="ghost"
                    onClick={() => void open(detail.row, true)}
                  >
                    {t("Reload record", "重新读取记录")}
                  </Button>
                ) : null}
              </div>
            </section>
            <details>
              <summary>{t("Resolution evidence", "解析证据")}</summary>
              <pre>{JSON.stringify(detail.row.evidence, null, 2)}</pre>
            </details>
            <section>
              <h3>{t("Source review samples", "原始评论样本")}</h3>
              {detail.reviews.map((review) => (
                <blockquote key={review.id}>
                  <small>
                    {review.course} · {review.date ?? "—"} · #{review.id}
                  </small>
                  <p>{review.comment}</p>
                </blockquote>
              ))}
            </section>
            <details>
              <summary>
                {t("Decision audit history", "人工决定审计历史")} (
                {detail.history.length})
              </summary>
              {detail.history.map((entry) => (
                <pre key={entry.id}>
                  {JSON.stringify(
                    { recordedAt: entry.recorded_at, ...entry.decision },
                    null,
                    2,
                  )}
                </pre>
              ))}
            </details>
          </div>
        ) : null}
      </WorkspaceDialog>
    </>
  );
}
