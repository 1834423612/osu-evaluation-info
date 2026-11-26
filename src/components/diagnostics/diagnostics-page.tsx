"use client";
import { SearchField } from "@/components/ui/search-field";
import { browserUuid } from "@/lib/uuid";
import { useEffect, useRef, useState } from "react";
import { Activity, Download, Play, Square, Send, Search } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import {
  registry,
  boundedValue,
  probeCategory,
  type DiagnosticResult,
  type DiagnosticReport,
  type DiagnosticStatus,
} from "@/lib/diagnostics/protocol";
import { runDiagnostics, runProbe } from "@/lib/diagnostics/runner";
import { readJpegExif } from "@/lib/diagnostics/exif";
import styles from "./diagnostics.module.css";
import ui from "@/components/ui/workspace.module.css";
const groups: Record<string, string> = {
  Network: "网络",
  "Network exits": "网络出口",
  "Request headers": "请求头",
  Locale: "语言与地区",
  Device: "设备",
  Browser: "浏览器",
  Fingerprints: "指纹",
};
const statuses: Record<DiagnosticStatus, [string, string]> = {
  available: ["Read", "已读取"],
  unsupported: ["Unavailable", "不支持或未提供"],
  denied: ["Permission denied", "权限被拒绝"],
  blocked: ["Blocked", "被阻止"],
  timed_out: ["Timed out", "超时"],
  failed: ["Failed", "检测失败"],
  not_configured: ["Not configured", "未配置"],
  not_run: ["Not run", "未运行"],
};
const sources: Record<DiagnosticResult["source"], [string, string]> = {
  browser: ["Browser API", "浏览器 API"],
  server: ["Request", "请求观察"],
  trusted_proxy: ["Trusted proxy", "可信代理"],
  configured_probe: ["Configured probe", "已配置探针"],
  heuristic: ["Estimate", "推断"],
  local_file: ["Local file", "本地文件"],
};
function download(report: DiagnosticReport) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "course-atlas-diagnostics.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function DiagnosticsPage() {
  const { locale } = usePreferences(),
    zh = locale === "zh";
  const [results, setResults] = useState<Record<string, DiagnosticResult>>({}),
    [advanced, setAdvanced] = useState(false),
    [expandAll, setExpandAll] = useState(false),
    [network, setNetwork] = useState(false),
    [running, setRunning] = useState(false),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Set<string>>(new Set()),
    [report, setReport] = useState<DiagnosticReport | null>(null),
    [message, setMessage] = useState(""),
    [sending, setSending] = useState(false),
    [sent, setSent] = useState(false);
  const [controller, setController] = useState<AbortController | null>(null),
    file = useRef<HTMLInputElement>(null);
  useEffect(() => () => controller?.abort(), [controller]);
  const update = (r: DiagnosticResult) =>
    setResults((old) => ({ ...old, [r.id]: r }));
  async function run(id?: string) {
    controller?.abort();
    const c = new AbortController();
    setController(c);
    setRunning(true);
    setMessage("");
    setReport(null);
    setSent(false);
    if (!id) {
      setResults({});
      setSelected(new Set());
    }
    try {
      if (id) update(await runProbe(id, c.signal));
      else await runDiagnostics({ advanced, network }, c.signal, update);
    } catch {
      if (!c.signal.aborted)
        setMessage(
          text(locale, "Diagnostics could not finish.", "检测未能完成。"),
        );
    } finally {
      if (!c.signal.aborted) setRunning(false);
    }
  }
  function preview() {
    setSent(false);
    setMessage("");
    setReport({
      version: 1,
      id: browserUuid(),
      capturedAt: new Date().toISOString(),
      consent: "selected-report-v1",
      results: registry
        .filter((r) => selected.has(r.id) && results[r.id])
        .map((r) => results[r.id]),
    });
  }
  async function submit() {
    if (!report) return;
    setSending(true);
    try {
      const response = await fetch("/api/diagnostics/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      });
      if (!response.ok) throw Error();
      setSent(true);
      setMessage(
        text(
          locale,
          "Report received. Admin access expires in 7 days.",
          "报告已接收，管理端可查看 7 天。",
        ),
      );
    } catch {
      setMessage(
        text(
          locale,
          "Report was not confirmed. Retry with the same report.",
          "尚未确认报告已接收，可重试。",
        ),
      );
    } finally {
      setSending(false);
    }
  }
  const visible = registry.filter((r) =>
      (r.id + " " + r.label.en + " " + r.label.zh + " " + r.group)
        .toLowerCase()
        .includes(query.toLowerCase()),
    ),
    available = Object.values(results).filter(
      (r) => r.status === "available",
    ).length;
  return (
    <>
      <AppHeader active="diagnostics" />
      <main className={ui.shell}>
        <div className={ui.heading}>
          <div>
            <h1 className={ui.pageTitle}>
              <Activity size={22} />
              {text(locale, "Browser diagnostics", "浏览器诊断")}
            </h1>
            <p>
              {text(
                locale,
                "Read locally. Review selected results before sending.",
                "本机检测，选好项目后预览并提交。",
              )}
            </p>
          </div>
          <a href="/admin/statistics" className={ui.muted}>
            {text(locale, "Admin statistics", "管理统计")}
          </a>
        </div>
        <section className={ui.panel}>
          <div className={ui.actions}>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={advanced}
                disabled={running}
                onChange={(e) => setAdvanced(e.target.checked)}
              />
              {text(locale, "Device & fingerprint probes", "设备与指纹检测")}
            </label>
            <label className={styles.option}>
              <input
                type="checkbox"
                checked={network}
                disabled={running}
                onChange={(e) => setNetwork(e.target.checked)}
              />
              {text(locale, "Network probes", "网络检测")}
            </label>
            <Button disabled={running} onClick={() => void run()}>
              <Play size={14} />
              {text(locale, "Run diagnostics", "开始检测")}
            </Button>
            {running ? (
              <Button
                variant="outline"
                onClick={() => {
                  controller?.abort();
                  setRunning(false);
                }}
              >
                <Square size={14} />
                {text(locale, "Stop", "停止")}
              </Button>
            ) : null}
          </div>
          <p className={ui.muted}>
            {text(
              locale,
              "Location, sensors and files run separately. Fingerprints are estimates, not account identifiers.",
              "定位、传感器和文件需单独运行；指纹结果仅用于诊断。",
            )}
          </p>
          <div role="status" className={styles.progress}>
            {Object.keys(results).length} / {registry.length} · {available}{" "}
            {text(locale, "read", "项已读取")}
          </div>
        </section>
        <section className={ui.panel}>
          <div className={styles.toolbar}>
            <label className={styles.search}>
              <Search size={15} />
              <SearchField
                className={ui.input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={text(locale, "Find a probe", "查找检测项")}
                aria-label={text(locale, "Find a probe", "查找检测项")}
              />
            </label>
            <Button
              variant="outline"
              disabled={running || !available}
              onClick={() =>
                setSelected(
                  new Set(
                    Object.values(results)
                      .filter(
                        (r) =>
                          r.status === "available" &&
                          !["geoloc", "sensors", "exif", "ip", "lan"].includes(
                            r.id,
                          ),
                      )
                      .map((r) => r.id),
                  ),
                )
              }
            >
              {text(locale, "Select results", "选择检测结果")}
            </Button>
            <Button
              variant="ghost"
              disabled={!selected.size}
              onClick={() => setSelected(new Set())}
            >
              {text(locale, "Clear selection", "取消选择")}
            </Button>
            <Button variant="ghost" onClick={() => setExpandAll((v) => !v)}>
              {text(
                locale,
                expandAll ? "Collapse groups" : "Expand groups",
                expandAll ? "收起分组" : "展开分组",
              )}
            </Button>
            <Button
              variant="outline"
              disabled={!selected.size || running}
              onClick={preview}
            >
              <Send size={14} />
              {text(
                locale,
                `Review (${selected.size})`,
                `预览（${selected.size}）`,
              )}
            </Button>
          </div>
          <small className={ui.muted}>
            {text(
              locale,
              "Bulk selection excludes IP, local addresses, location, sensors and photo metadata.",
              "批量选择不含 IP、局域网地址、定位、传感器和照片信息。",
            )}
          </small>
          {!visible.length ? (
            <EmptyResult layout="stack" size={56}>
              {text(locale, "No matching probes", "没有匹配的检测项")}
            </EmptyResult>
          ) : (
            Object.keys(groups).map((group) => {
              const rows = visible.filter((r) => r.group === group);
              if (!rows.length) return null;
              return (
                <details
                  className={styles.group}
                  key={group}
                  open={expandAll || !!query || group === "Locale"}
                >
                  <summary>
                    <strong>{zh ? groups[group] : group}</strong>
                    <span>{rows.length}</span>
                  </summary>
                  <div>
                    {rows.map((row) => {
                      const result = results[row.id],
                        status = result?.status ?? "not_run",
                        category = probeCategory(row.id);
                      return (
                        <article
                          key={row.id}
                          className={styles.row}
                          data-probe={row.id}
                        >
                          <label className={styles.select}>
                            <input
                              type="checkbox"
                              disabled={!result || running}
                              checked={selected.has(row.id)}
                              onChange={(e) =>
                                setSelected((old) => {
                                  const next = new Set(old);
                                  if (e.target.checked) next.add(row.id);
                                  else next.delete(row.id);
                                  return next;
                                })
                              }
                              aria-label={text(
                                locale,
                                `Include ${row.label.en}`,
                                `选择${row.label.zh}`,
                              )}
                            />
                            <span>
                              <strong>
                                {zh ? row.label.zh : row.label.en}
                              </strong>
                              <code>{row.id}</code>
                            </span>
                          </label>
                          <div className={styles.reading}>
                            <span
                              className={styles.status}
                              data-status={status}
                            >
                              {statuses[status][zh ? 1 : 0]}
                            </span>
                            {result?.status === "available" ? (
                              <details>
                                <summary>
                                  {text(locale, "View value", "查看数据")} ·{" "}
                                  {sources[result.source][zh ? 1 : 0]}
                                </summary>
                                <pre>
                                  {JSON.stringify(result.value, null, 2)}
                                </pre>
                              </details>
                            ) : null}
                            <small>{row.method}</small>
                            {row.note.en !== "—" ? (
                              <small>{zh ? row.note.zh : row.note.en}</small>
                            ) : null}
                          </div>
                          <div className={styles.rowAction}>
                            {category === "permission" || row.id === "agent" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={running}
                                onClick={() => void run(row.id)}
                              >
                                {text(locale, "Run separately", "单独检测")}
                              </Button>
                            ) : category === "file" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={running}
                                onClick={() => file.current?.click()}
                              >
                                {text(locale, "Choose JPEG", "选择 JPEG")}
                              </Button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </details>
              );
            })
          )}
        </section>
        <input
          ref={file}
          className={styles.file}
          type="file"
          accept="image/jpeg"
          aria-label={text(locale, "Read JPEG metadata", "读取 JPEG 元数据")}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              if (f.size > 20 * 1024 * 1024) throw Error();
              const value = readJpegExif(
                new Uint8Array(await f.slice(0, 262144).arrayBuffer()),
              );
              if (!boundedValue(value)) throw Error();
              update({
                id: "exif",
                status: "available",
                source: "local_file",
                value,
                duration: 0,
              });
            } catch {
              update({
                id: "exif",
                status: "failed",
                source: "local_file",
                detail: "jpeg_metadata_unavailable",
                duration: 0,
              });
            }
          }}
        />
        {message && !report ? (
          <p role="status" className={ui.notice}>
            {message}
          </p>
        ) : null}
        <small className={ui.muted}>
          {text(locale, "Probe inventory adapted from", "检测清单参考")}{" "}
          <a
            href="https://github.com/yt1988/who-are-you"
            target="_blank"
            rel="noreferrer"
          >
            Who Are You
          </a>{" "}
          · MIT
        </small>
        <WorkspaceDialog
          open={!!report}
          onOpenChange={(open) => {
            if (!open && !sending) setReport(null);
          }}
          title={text(locale, "Review diagnostic report", "预览诊断报告")}
          description={text(
            locale,
            "Only the selected values below are submitted. Access is restricted; reports expire after 7 days.",
            "仅提交下面选中的数据，仅管理端可访问，7 天后到期。",
          )}
          closeLabel={text(locale, "Close", "关闭")}
        >
          <pre className={styles.report}>
            {report ? JSON.stringify(report, null, 2) : ""}
          </pre>
          <div className={ui.actions}>
            <Button
              variant="outline"
              onClick={() => report && download(report)}
            >
              <Download size={14} />
              {text(locale, "Download JSON", "下载 JSON")}
            </Button>
            <Button disabled={sending || sent} onClick={() => void submit()}>
              {text(
                locale,
                sending ? "Sending…" : sent ? "Received" : "Submit report",
                sending ? "提交中…" : sent ? "已接收" : "提交报告",
              )}
            </Button>
          </div>
          {message ? (
            <p role="status" className={ui.notice}>
              {message}
            </p>
          ) : null}
        </WorkspaceDialog>
      </main>
      <AppFooter />
    </>
  );
}
