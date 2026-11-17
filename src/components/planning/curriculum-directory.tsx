"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  X,
  RefreshCw,
} from "lucide-react";
import type {
  DirectoryResponse,
  PublicDocument,
} from "@/lib/planning/directory";
import { text, type Locale } from "@/lib/i18n";
import styles from "./curriculum-directory.module.css";
type Code = { subject: string; number: string };
type Candidate = {
  id: string;
  program: string;
  semesters: Array<{ label: string; entries: Array<{ evidence: string }> }>;
};
export function CurriculumDirectory({
  locale,
  addCourse,
}: {
  locale: Locale;
  addCourse: (code: Code) => void;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [query, setQuery] = useState("");
  const [college, setCollege] = useState("");
  const [program, setProgram] = useState("");
  const [year, setYear] = useState("");
  const [ge, setGe] = useState("");
  const [version, setVersion] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<{
    document: PublicDocument;
    curricula: Candidate[];
  } | null>(null);
  const [detailError, setDetailError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setBusy(true);
      setError(false);
      const params = new URLSearchParams({
        q: query,
        college,
        program,
        year,
        ge,
        version,
        kind,
        page: String(page),
      });
      fetch("/api/planning/curricula?" + params, { signal: controller.signal })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((value) => {
          if (!controller.signal.aborted) setData(value);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setBusy(false);
        });
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, college, program, year, ge, version, kind, page, retry]);
  useEffect(() => {
    if (!selected) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controller = new AbortController();
    fetch("/api/planning/curricula?" + new URLSearchParams({ id: selected }), {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((value) => {
        if (!controller.signal.aborted) setDetail(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDetailError(true);
      });
    return () => {
      controller.abort();
      document.body.style.overflow = previousOverflow;
    };
  }, [selected, retry]);
  const activeProgram = data?.programs.find((p) => p.id === program);
  function openDocument(id: string) {
    setDetail(null);
    setDetailError(false);
    setSelected(id);
  }
  return (
    <section className={styles.root}>
      <div className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>
            {t("THE OFFICIAL STARTING POINT", "从官方资料出发")}
          </span>
          <h2>{t("Find your curriculum.", "找到你的培养方案。")}</h2>
          <p>
            {t(
              "Browse programs, source documents and dated versions. Check applicable requirements before planning.",
              "查找专业、来源文档及历史版本，核对适用要求后安排课程。",
            )}
          </p>
        </div>
        <BookOpen size={42} strokeWidth={1.25} />
      </div>
      {data && (
        <div className={styles.stats}>
          {[
            [data.programs.length, t("program index entries", "专业索引条目")],
            [
              new Set(data.programs.map((p) => p.college)).size,
              t("index groups", "索引分组"),
            ],
            [
              data.counts.downloadedVersions,
              t("archived source versions", "来源版本档案"),
            ],
            [
              data.counts.withCourseReferences,
              t("with course references", "含课程参考的来源"),
            ],
          ].map(([value, label]) => (
            <div key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <div className={styles.filters}>
        <label className={styles.search}>
          <span>
            <Search size={14} />
            {t("Search documents or versions", "搜索文档或版本")}
          </span>
          <input
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Molecular Genetics, AU2022…"
          />
        </label>
        <label>
          {t("College or school", "学院或学部")}
          <ChoiceSelect
            value={college}
            onValueChange={(value) => {
              setCollege(value);
              setProgram("");
              setPage(1);
            }}
          >
            <option value="">{t("All colleges", "全部学院")}</option>
            {[...new Set(data?.programs.map((p) => p.college))].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </ChoiceSelect>
        </label>
        <label>
          {t("Program index", "专业索引")}
          <ChoiceSelect
            value={program}
            onValueChange={(value) => {
              setProgram(value);
              setPage(1);
            }}
          >
            <option value="">{t("Choose a program", "选择专业")}</option>
            {data?.programs
              .filter((p) => !college || p.college === college)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ·{" "}
                  {p.documentIds.length
                    ? t("references found", "已有课程参考")
                    : t("coverage pending", "待补充资料")}
                </option>
              ))}
          </ChoiceSelect>
        </label>
        <label>
          {t("Document academic year", "文档学年")}
          <ChoiceSelect
            value={year}
            onValueChange={(value) => {
              setYear(value);
              setPage(1);
            }}
          >
            <option value="">{t("All / unknown", "全部 / 未知")}</option>
            {data?.years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </ChoiceSelect>
        </label>
        <label>
          {t("Published requirement term", "已公布的要求学期")}
          <ChoiceSelect
            value={version}
            onValueChange={(value) => {
              setVersion(value);
              setPage(1);
            }}
          >
            <option value="">{t("All / unknown", "全部 / 未知")}</option>
            {data?.versions.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </ChoiceSelect>
        </label>
        <label>
          {t("GE system", "通识体系")}
          <ChoiceSelect
            value={ge}
            onValueChange={(value) => {
              setGe(value);
              setPage(1);
            }}
          >
            <option value="">{t("All / unknown", "全部 / 未知")}</option>
            <option>GEN</option>
            <option>GEL</option>
          </ChoiceSelect>
        </label>
        <label>
          {t("Document type", "文档类型")}
          <ChoiceSelect
            value={kind}
            onValueChange={(value) => {
              setKind(value);
              setPage(1);
            }}
          >
            <option value="">{t("All documents", "全部文档")}</option>
            <option value="sample-plan">
              {t("Sample plans", "学期规划样表")}
            </option>
            <option value="requirements">
              {t("Requirement references", "要求参考")}
            </option>
            <option value="source">{t("Source pages", "来源页面")}</option>
          </ChoiceSelect>
        </label>
      </div>
      {activeProgram && (
        <div className={styles.program}>
          <div>
            <span className={styles.eyebrow}>{activeProgram.college}</span>
            <h3>{activeProgram.name}</h3>
            <span>
              {activeProgram.documentIds.length}{" "}
              {t(
                "sources with course references · pending review",
                "个含课程参考的来源 · 待复核",
              )}
            </span>
          </div>
          <a href={activeProgram.indexUrl} target="_blank" rel="noreferrer">
            {t("University index", "全校索引")}
            <ArrowUpRight size={15} />
          </a>
        </div>
      )}
      <div className={styles.resultHeading}>
        <span aria-live="polite">
          {busy
            ? t("Loading sources…", "正在载入来源…")
            : (data?.total ?? 0) + " " + t("sources", "个来源")}
        </span>
        <span>
          {t("Snapshot", "快照日期")} {data?.generatedAt.slice(0, 10) ?? "—"} ·{" "}
          {t("Partial coverage", "部分覆盖")}
        </span>
      </div>
      {error ? (
        <div className={styles.empty}>
          <p>
            {t(
              "The source directory could not be loaded.",
              "暂时无法载入来源目录。",
            )}
          </p>
          <button onClick={() => setRetry((r) => r + 1)}>
            <RefreshCw size={16} />
            {t("Retry", "重试")}
          </button>
        </div>
      ) : (
        <div className={styles.documents} aria-busy={busy}>
          {data?.documents.map((d) => (
            <article className={styles.document} key={d.id}>
              <div className={styles.badges}>
                <span>
                  {d.mediaType === "application/pdf" ? "PDF" : "HTML"}
                </span>
                <span>
                  {d.documentKind === "sample-plan"
                    ? t("Sample plan", "规划样表")
                    : d.documentKind === "requirements"
                      ? t("Requirements", "要求参考")
                      : t("Source", "来源")}
                </span>
                {d.publicationStatus === "draft" && (
                  <span>{t("Draft", "草案")}</span>
                )}
              </div>
              <h3>{d.title}</h3>
              <div className={styles.facts}>
                <span>
                  {t("Document year", "文档学年")}{" "}
                  <b>{d.academicYears.join(", ") || t("Unknown", "未知")}</b>
                </span>
                <span>
                  {t("Effective term", "生效学期")}{" "}
                  <b>{d.effectiveTerms.join(", ") || "—"}</b>
                </span>
                <span>
                  Applied Version <b>{d.appliedVersions.join(", ") || "—"}</b>
                </span>
                <span>
                  {t("GE system", "通识体系")}{" "}
                  <b>{d.geSystems.join(" / ") || "—"}</b>
                </span>
              </div>
              <div className={styles.cardFoot}>
                <span>
                  {d.courseCount} {t("course references", "个课程参考")} ·{" "}
                  {t("Pending review", "待复核")}
                  {d.extractionStatus === "unsupported" &&
                    " · " + t("Text unavailable", "文本未提取")}
                </span>
                <button onClick={() => openDocument(d.id)}>
                  {t("View", "查看")}
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </article>
          ))}
          {!busy && !data?.documents.length && (
            <div className={styles.empty}>
              <BookOpen size={32} />
              <h3>{t("No matching archived sources", "暂无匹配的来源档案")}</h3>
              <p>
                {t(
                  "Try fewer filters or consult the university index.",
                  "可减少筛选条件，或查询全校专业索引。",
                )}
              </p>
              <a
                href="https://undergrad.osu.edu/majors-and-academics/majors-by-college"
                target="_blank"
                rel="noreferrer"
              >
                {t("Open university index", "打开全校索引")}
                <ArrowUpRight size={14} />
              </a>
            </div>
          )}
        </div>
      )}
      {data && data.total > 24 && (
        <div className={styles.pagination}>
          <button
            disabled={page === 1 || busy}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={16} />
            {t("Previous", "上一页")}
          </button>
          <span>
            {page} / {Math.ceil(data.total / 24)}
          </span>
          <button
            disabled={page * 24 >= data.total || busy}
            onClick={() => setPage((p) => p + 1)}
          >
            {t("Next", "下一页")}
            <ChevronRight size={16} />
          </button>
        </div>
      )}
      {selected && (
        <dialog
          className={styles.dialog}
          ref={(element) => {
            if (element && !element.open) element.showModal();
          }}
          onCancel={() => setSelected("")}
          aria-label={t("Curriculum source details", "培养方案来源详情")}
        >
          <div className={styles.dialogHead}>
            <span>{t("SOURCE SNAPSHOT", "来源快照")}</span>
            <button
              onClick={() => setSelected("")}
              aria-label={t("Close source details", "关闭来源详情")}
            >
              <X size={18} />
            </button>
          </div>
          {detailError ? (
            <p>{t("Details could not be loaded.", "详情载入失败。")}</p>
          ) : !detail ? (
            <p role="status">{t("Loading…", "正在载入…")}</p>
          ) : (
            <>
              <h2>{detail.document.title}</h2>
              <a
                href={detail.document.url}
                target="_blank"
                rel="noreferrer"
                className={styles.sourceLink}
              >
                {t("Open official source", "打开官方来源")}
                <ArrowUpRight size={16} />
              </a>
              <dl className={styles.provenance}>
                <dt>{t("Fetched", "抓取日期")}</dt>
                <dd>{detail.document.fetchedAt.slice(0, 10)}</dd>
                <dt>SHA-256</dt>
                <dd>{detail.document.sha256}</dd>
              </dl>
              {detail.document.extractionStatus === "unsupported" && (
                <p className={styles.notice}>
                  {detail.document.extractionIssue === "page-limit"
                    ? t(
                        "This document exceeds the text extraction page limit. Consult the official original.",
                        "此文件超出文本解析页数上限，请查阅官方原文。",
                      )
                    : t(
                        "Text extraction is unavailable for this document. Consult the official original.",
                        "此文件暂未提取文本，请查阅官方原文。",
                      )}
                </p>
              )}
              {detail.curricula.map((c) => (
                <section className={styles.sample} key={c.id}>
                  <h3>
                    {c.program} ·{" "}
                    {t("Sample · pending review", "样表 · 待复核")}
                  </h3>
                  <div>
                    {c.semesters.map((s) => (
                      <article key={s.label}>
                        <h4>{s.label}</h4>
                        <ul>
                          {s.entries.map((e, i) => (
                            <li key={i}>{e.evidence}</li>
                          ))}
                        </ul>
                      </article>
                    ))}
                  </div>
                </section>
              ))}
              <h3>{t("Course references", "课程参考")}</h3>
              <div className={styles.codes}>
                {detail.document.courseReferences.map((c) => (
                  <div key={c.subject + c.number}>
                    <a
                      href={
                        "/?" +
                        new URLSearchParams({ q: c.subject + " " + c.number })
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <b>{c.subject}</b> {c.number}
                    </a>
                    <button
                      onClick={() => {
                        addCourse(c);
                        setSelected("");
                      }}
                      aria-label={
                        t("Add to plan", "添加到规划") +
                        " " +
                        c.subject +
                        " " +
                        c.number
                      }
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                ))}
              </div>
              {!detail.document.courseReferences.length && (
                <p>
                  {t(
                    "This source has no supported course references yet.",
                    "此来源暂无可识别的课程参考。",
                  )}
                </p>
              )}
            </>
          )}
        </dialog>
      )}
    </section>
  );
}
