"use client";
import { ReportDetail } from "./report-detail";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BarChart3, RefreshCw, Download, LockKeyhole } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import { debugTools } from "@/lib/debug/client";
import { text } from "@/lib/i18n";
import { sharingDate } from "@/lib/saved/share-links";
import ui from "@/components/ui/workspace.module.css";
import styles from "./statistics.module.css";
type Context = {
  id: string;
  user_agent: string;
  accept_language: string;
  language: string;
  languages: string[];
  time_zone: string;
  viewport: string;
  ip: string | null;
  network_source: string;
  browser_context?: Record<string, unknown>;
  network_location?: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
  umami_id?: string | null;
  account_id?: string | null;
  created_at: string;
  environment: string;
};
type Overview = {
  asOf: string;
  totals: { type: string; count: string }[];
  searches: { query: string; submissions: string }[];
  outcomes: { status: string; count: string }[];
  paths: { path: string; views: string }[];
  contexts: Context[];
  contextsNext?: string | null;
  latency?: { bucket: string; count: string }[];
  pageLinks: { links: string; previews: string; opens: string };
};
type Reports = {
  items: {
    id: string;
    captured_at: string;
    readings: number;
    summary?: Record<string, unknown>;
    created_at: string;
  }[];
  next: string | null;
};
const metrics: Record<string, [string, string]> = {
  page_view: ["Page views", "页面访问"],
  search: ["Searches", "搜索"],
  search_result: ["Search responses", "搜索响应"],
  course_open: ["Course opens", "课程查看"],
  favorite_add: ["Saved", "收藏添加"],
  favorite_remove: ["Removed", "收藏移除"],
};
function download(data: unknown) {
  const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = "course-atlas-statistics.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function json<T>(path: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(path, { signal, cache: "no-store" });
  if (!r.ok) throw Error(r.status === 403 ? "forbidden" : "unavailable");
  return r.json();
}
export function StatisticsPage() {
  const { locale } = usePreferences(),
    zh = locale === "zh",
    debug = useSyncExternalStore(
      debugTools.subscribe,
      debugTools.getSnapshot,
      debugTools.getServerSnapshot,
    );
  const [days, setDays] = useState("7"),
    [environment, setEnvironment] = useState(
      process.env.NODE_ENV === "production" ? "production" : "development",
    ),
    [retry, setRetry] = useState(0),
    [data, setData] = useState<Overview | null>(null),
    [reports, setReports] = useState<Reports | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [detail, setDetail] = useState<unknown>(null),
    [reportLoading, setReportLoading] = useState(false),
    [contextLoading, setContextLoading] = useState(false),
    [contextPages, setContextPages] = useState<
      { contexts: Context[]; contextsNext?: string | null }[]
    >([]),
    [reportPages, setReportPages] = useState<Reports[]>([]);
  useEffect(() => {
    if (!debug.authorized) return;
    const c = new AbortController();
    void Promise.all([
      json<Overview>(
        "/api/admin/analytics?" + new URLSearchParams({ days, environment }),
        c.signal,
      ),
      json<Reports>("/api/admin/diagnostics", c.signal),
    ])
      .then(([overview, reports]) => {
        if (!c.signal.aborted) {
          setData(overview);
          setReports(reports);
          setContextPages([]);
          setReportPages([]);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted)
          setError(e instanceof Error ? e.message : "unavailable");
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [debug.authorized, days, environment, retry]);
  async function moreReports() {
    if (!reports?.next) return;
    setReportLoading(true);
    try {
      const page = await json<Reports>(
        "/api/admin/diagnostics?before=" + encodeURIComponent(reports.next),
      );
      setReportPages((old) => [...old, reports]);
      setReports(page);
    } catch {
      setError("unavailable");
    } finally {
      setReportLoading(false);
    }
  }
  async function moreContexts() {
    if (!data?.contextsNext) return;
    setContextLoading(true);
    try {
      const page = await json<{ items: Context[]; next: string | null }>(
        "/api/admin/analytics/contexts?" +
          new URLSearchParams({ environment, before: data.contextsNext }),
      );
      setContextPages((old) => [
        ...old,
        { contexts: data.contexts, contextsNext: data.contextsNext },
      ]);
      setData((old) =>
        old ? { ...old, contexts: page.items, contextsNext: page.next } : old,
      );
    } catch {
      setError("unavailable");
    } finally {
      setContextLoading(false);
    }
  }
  async function openReport(id: string) {
    setReportLoading(true);
    try {
      setDetail(
        await json(
          "/api/admin/diagnostics/detail?id=" + encodeURIComponent(id),
        ),
      );
    } catch {
      setError("unavailable");
    } finally {
      setReportLoading(false);
    }
  }
  const empty = (label: string) => (
    <EmptyResult layout="stack" size={48}>
      {label}
    </EmptyResult>
  );
  return (
    <>
      <AppHeader active="diagnostics" />
      <main className={ui.shell}>
        <div className={ui.heading}>
          <div>
            <h1 className={ui.pageTitle}>
              <BarChart3 size={22} />
              {text(locale, "Site statistics", "网站统计")}
            </h1>
            <p>
              {text(
                locale,
                "First-party events and submitted diagnostics",
                "本站事件与主动提交的诊断报告",
              )}
            </p>
          </div>
          <a className={ui.muted} href="/diagnostics">
            {text(locale, "Browser diagnostics", "浏览器诊断")}
          </a>
        </div>
        {!debug.authorized ? (
          <section className={ui.panel}>
            <h2>
              <LockKeyhole size={18} />
              {text(locale, "Administrator access", "管理端访问")}
            </h2>
            <Button variant="outline" onClick={() => debugTools.open()}>
              {text(locale, "Unlock developer tools", "解锁调试工具")}
            </Button>
          </section>
        ) : (
          <>
            <section className={ui.panel}>
              <div className={ui.tools}>
                <label className={styles.filter}>
                  {text(locale, "Period", "时间范围")}
                  <ChoiceSelect
                    value={days}
                    onValueChange={(value) => {
                      setDays(value);
                      setLoading(true);
                      setError("");
                      setData(null);
                    }}
                  >
                    {[1, 7, 30, 90].map((n) => (
                      <option key={n} value={n}>
                        {text(
                          locale,
                          `${n} ${n === 1 ? "day" : "days"}`,
                          `${n} 天`,
                        )}
                      </option>
                    ))}
                  </ChoiceSelect>
                </label>
                <label className={styles.filter}>
                  {text(locale, "Environment", "环境")}
                  <ChoiceSelect
                    value={environment}
                    onValueChange={(value) => {
                      setEnvironment(value);
                      setLoading(true);
                      setError("");
                      setData(null);
                    }}
                  >
                    {["production", "staging", "development", "all"].map(
                      (value) => (
                        <option key={value} value={value}>
                          {zh
                            ? (
                                {
                                  production: "生产",
                                  staging: "预发布",
                                  development: "开发",
                                  all: "全部",
                                } as Record<string, string>
                              )[value]
                            : value}
                        </option>
                      ),
                    )}
                  </ChoiceSelect>
                </label>
                <Button
                  variant="outline"
                  disabled={loading}
                  onClick={() => {
                    setLoading(true);
                    setError("");
                    setRetry((n) => n + 1);
                  }}
                >
                  <RefreshCw size={14} />
                  {text(locale, "Refresh", "刷新")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!data || loading}
                  onClick={() => download({ overview: data, reports })}
                >
                  <Download size={14} />
                  {text(locale, "Export view", "导出当前结果")}
                </Button>
              </div>
              {data ? (
                <p className={ui.muted}>
                  {sharingDate(data.asOf, locale)} ·{" "}
                  {text(locale, "Daily totals use UTC.", "按 UTC 日期汇总。")}
                </p>
              ) : null}
            </section>
            {error ? (
              <p className={ui.notice} role="status">
                {text(
                  locale,
                  error === "forbidden"
                    ? "Session expired. Unlock developer tools again."
                    : "Statistics are unavailable. Check migrations and database access.",
                  error === "forbidden"
                    ? "会话已过期，请重新解锁调试工具。"
                    : "统计暂不可用，请检查数据库迁移和连接。",
                )}
              </p>
            ) : loading && !data ? (
              <p role="status">{text(locale, "Loading…", "正在读取…")}</p>
            ) : null}
            {data ? (
              <>
                <div className={styles.metrics}>
                  {Object.entries(metrics).map(([type, label]) => (
                    <div key={type}>
                      <small>{label[zh ? 1 : 0]}</small>
                      <strong>
                        {Number(
                          data.totals.find((r) => r.type === type)?.count ?? 0,
                        ).toLocaleString(locale)}
                      </strong>
                    </div>
                  ))}
                </div>
                <div className={styles.columns}>
                  <section className={ui.panel}>
                    <h2>{text(locale, "Search terms", "搜索词")}</h2>
                    {!data.searches.length ? (
                      empty(text(locale, "No searches", "暂无搜索"))
                    ) : (
                      <ol className={styles.ranking}>
                        {data.searches.map((row) => (
                          <li key={row.query}>
                            <span>{row.query}</span>
                            <strong>
                              {Number(row.submissions).toLocaleString(locale)}
                            </strong>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                  <section className={ui.panel}>
                    <h2>{text(locale, "Search results", "搜索结果")}</h2>
                    {!data.outcomes.length ? (
                      empty(text(locale, "No results logged", "暂无结果统计"))
                    ) : (
                      <dl className={styles.facts}>
                        {data.outcomes.map((row) => (
                          <div key={row.status}>
                            <dt>
                              {zh
                                ? ((
                                    {
                                      matches: "有结果",
                                      no_matches: "无匹配",
                                      error: "请求错误",
                                      cancelled: "已取消",
                                    } as Record<string, string>
                                  )[row.status] ?? row.status)
                                : row.status}
                            </dt>
                            <dd>{Number(row.count).toLocaleString(locale)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                    <details className={styles.latency}>
                      <summary>
                        {text(locale, "Search latency", "搜索耗时")}
                      </summary>
                      <dl className={styles.facts}>
                        {(data.latency ?? []).map((row) => (
                          <div key={row.bucket}>
                            <dt>
                              {(
                                {
                                  under250: "< 250 ms",
                                  under1000: "250–999 ms",
                                  under3000: "1–3 s",
                                  under10000: "3–10 s",
                                  over10000: "≥ 10 s",
                                } as Record<string, string>
                              )[row.bucket] ?? row.bucket}
                            </dt>
                            <dd>{Number(row.count).toLocaleString(locale)}</dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                    <h2 className={styles.subheading}>
                      {text(
                        locale,
                        "Attributed links · all time",
                        "分享链接 · 累计",
                      )}
                    </h2>
                    <dl className={styles.facts}>
                      {["links", "previews", "opens"].map((key) => (
                        <div key={key}>
                          <dt>
                            {text(
                              locale,
                              key,
                              (
                                {
                                  links: "链接",
                                  previews: "预览",
                                  opens: "打开",
                                } as Record<string, string>
                              )[key],
                            )}
                          </dt>
                          <dd>
                            {Number(
                              data.pageLinks[
                                key as keyof Overview["pageLinks"]
                              ],
                            ).toLocaleString(locale)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </section>
                </div>
                <section className={ui.panel}>
                  <h2>{text(locale, "Pages", "页面")}</h2>
                  {!data.paths.length ? (
                    empty(text(locale, "No page views", "暂无访问"))
                  ) : (
                    <ol className={styles.ranking}>
                      {data.paths.map((row) => (
                        <li key={row.path}>
                          <code>{row.path}</code>
                          <strong>
                            {Number(row.views).toLocaleString(locale)}
                          </strong>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
                <section className={ui.panel}>
                  <div className={ui.panelHeading}>
                    <h2>{text(locale, "Request context", "请求信息")}</h2>
                    <div className={ui.tools}>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!contextPages.length || contextLoading}
                        onClick={() => {
                          const previous = contextPages.at(-1);
                          if (previous) {
                            setData((old) =>
                              old ? { ...old, ...previous } : old,
                            );
                            setContextPages((old) => old.slice(0, -1));
                          }
                        }}
                      >
                        {text(locale, "Previous", "上一页")}
                      </Button>
                      <span className={ui.muted}>
                        {contextPages.length + 1}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={contextLoading || !data.contextsNext}
                        onClick={() => void moreContexts()}
                      >
                        {text(locale, "Older sessions", "更早会话")}
                      </Button>
                    </div>
                  </div>
                  <p className={ui.muted}>
                    {text(
                      locale,
                      "100 sessions per page, within 7 days. Network sources distinguish trusted ingress and browser-reported public IP.",
                      "最近 7 天的会话，每页 100 条。网络来源区分可信入口与浏览器上报公网 IP。",
                    )}
                  </p>
                  {!data.contexts.length ? (
                    empty(text(locale, "No request context", "暂无请求信息"))
                  ) : (
                    <div className={styles.contexts}>
                      {data.contexts.map((row) => (
                        <details key={row.id}>
                          <summary>
                            <span>{sharingDate(row.created_at, locale)}</span>
                            <span>
                              {row.ip ?? row.language} ·{" "}
                              {String(
                                row.browser_context?.model ||
                                  row.browser_context?.platform ||
                                  row.time_zone,
                              )}
                            </span>
                          </summary>
                          <dl className={styles.facts}>
                            {[
                              [
                                "IP",
                                row.ip ??
                                  text(locale, "Not available", "未获取"),
                              ],
                              [
                                text(locale, "IP source", "IP 来源"),
                                row.network_source,
                              ],
                              [
                                text(locale, "Network location", "网络归属地"),
                                [
                                  row.network_location?.city,
                                  row.network_location?.region,
                                  row.network_location?.country,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") ||
                                  text(locale, "Unavailable", "未获取"),
                              ],
                              ["Umami ID", row.umami_id ?? "—"],
                              [
                                text(locale, "Account", "账号"),
                                row.account_id ?? "—",
                              ],
                              [
                                text(locale, "Browser context", "浏览器上下文"),
                                JSON.stringify(row.browser_context ?? {}),
                              ],
                              ["User-Agent", row.user_agent],
                              ["Accept-Language", row.accept_language],
                              [
                                text(locale, "Browser languages", "浏览器语言"),
                                row.languages.join(", "),
                              ],
                              [text(locale, "Viewport", "视口"), row.viewport],
                              [
                                text(locale, "Environment", "环境"),
                                row.environment,
                              ],
                            ].map(([key, value]) => (
                              <div key={key}>
                                <dt>{key}</dt>
                                <dd>{value}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      ))}
                    </div>
                  )}
                </section>
              </>
            ) : null}
            <section className={ui.panel}>
              <div className={ui.panelHeading}>
                <h2>{text(locale, "Diagnostic reports", "诊断报告")}</h2>
                <small className={ui.muted}>
                  {text(locale, "7-day retention", "保留 7 天")}
                </small>
              </div>
              <p className={ui.muted}>
                {text(
                  locale,
                  "Client values are unverified. Server-observed fields appear separately in each report.",
                  "客户端数据未经验证；每份报告单独列出服务器观察值。",
                )}
              </p>
              {!reports?.items.length ? (
                empty(text(locale, "No submitted reports", "暂无提交报告"))
              ) : (
                <ul className={styles.reports}>
                  {reports.items.map((row) => (
                    <li key={row.id}>
                      <button
                        disabled={reportLoading}
                        onClick={() => void openReport(row.id)}
                      >
                        <span>
                          <strong>{row.id.slice(0, 8)}</strong>
                          <small>{sharingDate(row.created_at, locale)}</small>
                          <span className={styles.reportSummary}>
                            {Object.entries(row.summary ?? {})
                              .filter(([key]) =>
                                ["os", "browser", "ip", "tz"].includes(key),
                              )
                              .map(([key, value]) => (
                                <span key={key}>
                                  {typeof value === "string"
                                    ? value
                                    : JSON.stringify(value).slice(0, 90)}
                                </span>
                              ))}
                          </span>
                        </span>
                        <small>
                          {row.readings} {text(locale, "readings", "项数据")}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className={ui.actions}>
                <Button
                  variant="ghost"
                  disabled={!reportPages.length || reportLoading}
                  onClick={() => {
                    const previous = reportPages.at(-1);
                    if (previous) {
                      setReports(previous);
                      setReportPages((old) => old.slice(0, -1));
                    }
                  }}
                >
                  {text(locale, "Previous", "上一页")}
                </Button>
                <span className={ui.muted}>{reportPages.length + 1}</span>
                {reports?.next ? (
                  <Button
                    disabled={reportLoading}
                    variant="outline"
                    onClick={() => void moreReports()}
                  >
                    {text(locale, "Older reports", "更早报告")}
                  </Button>
                ) : null}
              </div>
            </section>
          </>
        )}
        <WorkspaceDialog
          open={detail !== null}
          onOpenChange={(open) => {
            if (!open) setDetail(null);
          }}
          title={text(locale, "Diagnostic report", "诊断报告")}
          description={text(
            locale,
            "Submitted values and independent request observations.",
            "主动提交的数据及独立的请求观察值。",
          )}
          closeLabel={text(locale, "Close", "关闭")}
        >
          <ReportDetail detail={detail} locale={locale} />
          <Button variant="outline" onClick={() => download(detail)}>
            <Download size={14} />
            {text(locale, "Download JSON", "下载 JSON")}
          </Button>
        </WorkspaceDialog>
      </main>
      <AppFooter />
    </>
  );
}
