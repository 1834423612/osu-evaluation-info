"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Clock3,
  History,
  LoaderCircle,
  RefreshCw,
} from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { EmptyResult } from "@/components/brand/empty-result";
import { usePreferences } from "@/hooks/use-preferences";
import {
  text,
  localizedCampus,
  localizedTerm,
  campusOptions,
  type Locale,
} from "@/lib/i18n";
import {
  CHANGE_KINDS,
  type ChangesResponse,
  type CatalogChange,
} from "@/lib/catalog/changes";
import styles from "./catalog-updates.module.css";
const labels = {
  added: ["New offerings", "新增开课"],
  restored: ["Reappeared", "恢复开课"],
  changed: ["Changed", "内容调整"],
  removed: ["No longer listed", "不再收录"],
} as const;
const fields: Record<string, [string, string]> = {
  code: ["Course code", "课程代码"],
  title: ["Title", "标题"],
  description: ["Description", "课程介绍"],
  credits: ["Credits", "学分"],
  level: ["Level", "课程层次"],
  grading: ["Grading", "评分方式"],
  attributes: ["Attributes", "课程属性"],
  sections: ["Sections", "班次"],
  teachers: ["Teachers", "教师"],
  schedule: ["Schedule", "上课时间"],
  locations: ["Location", "地点"],
  delivery: ["Delivery", "授课方式"],
};
function timestamp(value: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
function credits(value: (string | null)[] | null) {
  return value?.[0]
    ? value[1] && value[1] !== value[0]
      ? `${value[0]}–${value[1]}`
      : value[0]
    : "—";
}
function ChangeCard({ item, locale }: { item: CatalogChange; locale: Locale }) {
  const courseId = `${item.term}-${item.subject}-${item.catalog}-${item.campus}`;
  return (
    <article
      className={styles.card}
      data-course-update={item.kind}
      data-update-id={item.id}
    >
      <div className={styles.identity}>
        <span className={styles.courseCode}>
          {item.subject} {item.catalog}
        </span>
        <span>{localizedCampus(item.campus, locale)}</span>
        {item.offering !== "1" ? (
          <span>
            {text(locale, "Offering", "开课编号")} {item.offering}
          </span>
        ) : null}
        <span className={styles.badge} data-kind={item.kind}>
          {text(locale, labels[item.kind][0], labels[item.kind][1])}
        </span>
      </div>
      <h2>
        {item.title || text(locale, "Title not provided", "未提供课程名称")}
      </h2>
      <div className={styles.facts}>
        <span>
          {text(locale, "Sections", "班次")}{" "}
          <b>
            {item.beforeSections} → {item.afterSections}
          </b>
        </span>
        <time dateTime={item.observedAt}>
          <Clock3 size={12} aria-hidden="true" />
          {timestamp(item.observedAt, locale)}
        </time>
      </div>
      {item.kind === "changed" ? (
        <div className={styles.fields}>
          {item.fields.map((f) => (
            <span key={f}>{fields[f] ? text(locale, ...fields[f]) : f}</span>
          ))}
        </div>
      ) : null}
      {(item.fields.includes("title") &&
        item.beforeTitle &&
        item.beforeTitle !== item.title) ||
      item.fields.includes("credits") ? (
        <details className={styles.details}>
          <summary>{text(locale, "Previous values", "修改前")}</summary>
          {item.fields.includes("title") ? (
            <p>
              {text(locale, "Title", "标题")}: {item.beforeTitle}
            </p>
          ) : null}
          {item.fields.includes("credits") ? (
            <p>
              {text(locale, "Credits", "学分")}: {credits(item.beforeCredits)} →{" "}
              {credits(item.afterCredits)}
            </p>
          ) : null}
        </details>
      ) : null}
      {item.current ? (
        <Link
          className={styles.courseLink}
          href={{
            pathname: "/",
            query: {
              q: `${item.subject} ${item.catalog}`,
              term: item.term,
              campus: item.campus,
              course: courseId,
            },
          }}
        >
          {text(locale, "Open course", "查看课程")}
          <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      ) : (
        <span className={styles.retained}>
          {text(
            locale,
            "Not in the current catalog · historical copy retained",
            "当前目录未收录 · 历史副本仍保留",
          )}
        </span>
      )}
    </article>
  );
}
export function CatalogUpdates({ query }: { query: string }) {
  const { locale } = usePreferences(),
    router = useRouter();
  const [attempt, setAttempt] = useState(0),
    [state, setState] = useState<{
      key: string;
      data: ChangesResponse | null;
      error: boolean;
    } | null>(null);
  const api = `/api/catalog/changes?${query}`,
    key = `${api}:${attempt}`,
    params = new URLSearchParams(query);
  const data = state?.key === key ? state.data : null,
    error = state?.key === key && state.error,
    loading = state?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    void fetch(api, {
      cache: "no-store",
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(20000)]),
    })
      .then(async (r) => {
        if (!r.ok) throw Error("Unavailable");
        return (await r.json()) as ChangesResponse;
      })
      .then((data) => {
        if (!controller.signal.aborted) setState({ key, data, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: true });
      });
    return () => controller.abort();
  }, [api, key]);
  function change(name: string, value: string) {
    const next = new URLSearchParams(query);
    next.delete("cursor");
    next.set(name, value);
    router.push(`/updates?${next}`);
  }
  const days = params.get("days") || "30",
    kind = params.get("kind") || "all";
  return (
    <>
      <AppHeader active="updates" />
      <main className={styles.page}>
        <header className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>
              <History size={14} aria-hidden="true" /> OSU CLASS CATALOG
            </span>
            <h1>{text(locale, "Course updates", "课程更新")}</h1>
            <p>
              {text(
                locale,
                "New offerings and changes to courses and sections.",
                "新增开课、课程资料与班次调整。",
              )}
            </p>
          </div>
          <a
            className={styles.sourceLink}
            href="https://registrar.osu.edu/staff-resources/class-catalog-and-space/circulating-forms-archive/"
            target="_blank"
            rel="noreferrer"
          >
            {text(locale, "Official course approvals", "官方课程审批档案")}
            <ArrowUpRight size={14} />
          </a>
        </header>
        <form
          className={styles.filters}
          key={query}
          onSubmit={(event) => {
            event.preventDefault();
            const next = new URLSearchParams();
            for (const [k, v] of new FormData(event.currentTarget))
              if (typeof v === "string" && v) next.set(k, v);
            router.push(`/updates?${next}`);
          }}
        >
          <label>
            {text(locale, "Term", "学期")}
            <ChoiceSelect
              name="term"
              defaultValue={params.get("term") ?? data?.term}
              disabled={!data}
            >
              {data?.terms.map((t) => (
                <option key={t.code} value={t.code}>
                  {localizedTerm(t.label, locale)}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <label>
            {text(locale, "Campus", "校区")}
            <ChoiceSelect
              name="campus"
              defaultValue={params.get("campus") || "ALL"}
            >
              <option value="ALL">
                {text(locale, "All campuses", "所有校区")}
              </option>
              {campusOptions.map((c) => (
                <option key={c.value} value={c.value.toUpperCase()}>
                  {c[locale]}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <label>
            {text(locale, "Period", "范围")}
            <ChoiceSelect name="days" defaultValue={days}>
              {[7, 30, 90].map((d) => (
                <option key={d} value={d}>
                  {text(locale, `Last ${d} days`, `最近 ${d} 天`)}
                </option>
              ))}
            </ChoiceSelect>
          </label>
          <label className={styles.search}>
            {text(locale, "Course", "课程")}
            <input
              name="q"
              defaultValue={params.get("q") || ""}
              maxLength={80}
              placeholder={text(locale, "Code or title", "课程代码或标题")}
            />
          </label>
          <input type="hidden" name="kind" value={kind} />
          <button className={styles.apply} type="submit">
            {text(locale, "Apply", "筛选")}
          </button>
        </form>
        <div className={styles.counts}>
          {CHANGE_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              data-kind={k}
              onClick={() => change("kind", kind === k ? "all" : k)}
            >
              <span>{text(locale, labels[k][0], labels[k][1])}</span>
              <strong>{data?.counts[k] ?? "—"}</strong>
            </button>
          ))}
        </div>
        <div className={styles.toolbar}>
          <span>
            {text(
              locale,
              "Detected by complete syncs · browser timezone",
              "完整同步检测 · 浏览器时区",
            )}
          </span>
          {kind !== "all" ? (
            <button onClick={() => change("kind", "all")}>
              {text(locale, "All changes", "全部变化")}
            </button>
          ) : null}
          <button onClick={() => setAttempt((n) => n + 1)} disabled={loading}>
            <RefreshCw size={13} />
            {text(locale, "Reload", "刷新")}
          </button>
        </div>
        <details className={styles.about}>
          <summary>{text(locale, "About these records", "记录口径")}</summary>
          <p>
            {text(
              locale,
              "New means added to this term and campus since the previous complete check; it does not establish when OSU first created the course. Times are our detection times. A term’s first snapshot establishes a baseline.",
              "新增指上次完整检查后出现在该学期、该校区的开课记录，不代表学校首次设立该课。时间为本站检测时间；每个学期首次同步只建立基线。",
            )}
          </p>
          <p>
            {text(
              locale,
              "Live seats are separate. Official proposals and approvals are in the registrar archive linked above.",
              "实时空位单独查询；正式提案与审批记录请查看上方官方档案。",
            )}
          </p>
          {data?.baselineSince ? (
            <p>
              {text(locale, "Records since", "开始记录于")}{" "}
              {timestamp(data.baselineSince, locale)}
            </p>
          ) : null}
        </details>
        {data?.archived ? (
          <p className={styles.notice}>
            {text(
              locale,
              "OSU no longer lists this term; retained history is shown.",
              "官方已不再列出此学期，当前展示留存记录。",
            )}
          </p>
        ) : null}
        {data?.pendingBatches ? (
          <p className={styles.notice}>
            {text(
              locale,
              "Some historical comparisons are still being indexed.",
              "部分历史变化记录正在整理中。",
            )}
          </p>
        ) : null}
        {loading ? (
          <p className={styles.status} role="status">
            <LoaderCircle className="spin" size={18} />
            {text(locale, "Loading updates…", "正在读取更新…")}
          </p>
        ) : error ? (
          <div className={styles.status} role="alert">
            <p>
              {text(
                locale,
                "Course updates are unavailable. Try again.",
                "课程更新暂不可用，请重试。",
              )}
            </p>
            <Link href="/updates">
              {text(locale, "Reset filters", "重置筛选")}
            </Link>
          </div>
        ) : data && !data.items.length ? (
          <EmptyResult layout="stack">
            {data.pendingBatches && !data.comparisonSince
              ? text(
                  locale,
                  "Change history is being indexed.",
                  "正在整理变化记录。",
                )
              : !data.comparisonSince
                ? text(
                    locale,
                    "Baseline recorded; waiting for the next complete check.",
                    "已建立基线，等待下一次完整同步。",
                  )
                : text(
                    locale,
                    "No changes match these filters.",
                    "所选范围内暂无匹配变化。",
                  )}
          </EmptyResult>
        ) : (
          <div className={styles.list}>
            {data?.items.map((item) => (
              <ChangeCard key={item.id} item={item} locale={locale} />
            ))}
          </div>
        )}
        {data ? (
          <footer className={styles.pagination}>
            {params.has("cursor") ? (
              <Link
                href={`/updates?${new URLSearchParams([...params].filter(([k]) => k !== "cursor"))}`}
              >
                {text(locale, "Back to latest", "返回最新")}
              </Link>
            ) : (
              <span />
            )}
            {data.nextCursor ? (
              <Link
                href={`/updates?${new URLSearchParams({ ...Object.fromEntries(params), cursor: data.nextCursor })}`}
              >
                {text(locale, "Earlier updates", "较早更新")} →
              </Link>
            ) : null}
          </footer>
        ) : null}
        {data?.latestCheck ? (
          <p className={styles.checked}>
            {text(locale, "Last compared", "最近核对")}{" "}
            {timestamp(data.latestCheck, locale)}
          </p>
        ) : null}
      </main>
      <AppFooter />
    </>
  );
}
