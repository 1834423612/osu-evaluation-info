"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Download, ExternalLink, LoaderCircle, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { text, type Locale } from "@/lib/i18n";
import { syllabusClient } from "@/lib/syllabus/client";
import { extractSyllabusSections } from "@/lib/syllabus/content";
import { officialSyllabusUrl, SyllabusError } from "@/lib/syllabus/normalize";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "@/lib/syllabus/types";
import styles from "./syllabus.module.css";
import { SyllabusHighlights } from "./syllabus-highlights";
import { OfficialSyllabusView } from "./official-syllabus-view";
import { scrollOfficialSyllabusSection } from "@/lib/syllabus/official-render";

export function SyllabusReader({
  entry,
  locale,
}: {
  entry: SyllabusEntry;
  locale: Locale;
}) {
  const [result, setResult] = useState<SyllabusResult<SyllabusDocument> | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const sectionId = useId();
  const [layout, setLayout] = useState<"official" | "reading">("official");
  const officialFrame = useRef<HTMLIFrameElement>(null);
  const { code, termId, entityId, classNumber } = entry;

  useEffect(() => {
    const controller = new AbortController();
    syllabusClient
      .document(code, controller.signal)
      .then((data) => {
        if (
          data.data.entry.termId !== termId ||
          data.data.entry.entityId !== entityId ||
          data.data.entry.classNumber !== classNumber
        )
          throw new SyllabusError("unavailable");
        if (!controller.signal.aborted) {
          setResult(data);
          setError(null);
        }
      })
      .catch((reason) => {
        if (!controller.signal.aborted)
          setError(
            reason instanceof SyllabusError ? reason.kind : "unavailable",
          );
      });
    return () => controller.abort();
  }, [code, termId, entityId, classNumber, retry]);

  const sections = useMemo(
    () => (result ? extractSyllabusSections(result.data) : []),
    [result],
  );
  const visible = sections.filter(
    (section) =>
      !query.trim() ||
      `${section.title}\n${section.text}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  async function download() {
    if (!result || exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const { downloadSyllabusPdf } = await import("@/lib/syllabus/pdf");
      await downloadSyllabusPdf(result.data);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  if (error)
    return (
      <div className={styles.notice} role="status">
        <p>
          {error === "restricted"
            ? text(
                locale,
                "The official service declined this document request. Open the official page to check access or sign in.",
                "官方拒绝了这份文档请求。可打开官网检查访问权限或登录。",
              )
            : error === "missing"
              ? text(
                  locale,
                  "This syllabus is not currently published or is no longer available.",
                  "这份大纲目前未发布，或已不再提供。",
                )
              : text(
                  locale,
                  "The syllabus could not be loaded and no usable backup was found.",
                  "大纲暂时无法获取，且未找到可用备份。",
                )}
        </p>
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setError(null);
              setRetry((value) => value + 1);
            }}
          >
            {text(locale, "Retry", "重试")}
          </Button>
          <a
            href={officialSyllabusUrl(code)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text(locale, "Open official syllabus", "打开官方大纲")}{" "}
            <ExternalLink size={13} />
          </a>
        </div>
      </div>
    );
  if (!result)
    return (
      <p className={styles.loading} role="status">
        <LoaderCircle size={16} className="spin" />
        {text(locale, "Loading syllabus…", "正在获取教学大纲…")}
      </p>
    );

  return (
    <div className={styles.reader}>
      <div className={styles.toolbar}>
        <div className={styles.source}>
          <DataSourceBadge
            source={result.source === "backup" ? "sync" : "official"}
          >
            {result.source === "backup"
              ? text(locale, "Archived backup", "历史备份")
              : text(locale, "OSU official", "OSU 官方")}
          </DataSourceBadge>
          <span>
            {result.source === "backup"
              ? text(locale, "Archived", "备份时间")
              : text(locale, "Retrieved", "获取时间")}{" "}
            ·{" "}
            {new Date(result.fetchedAt).toLocaleString(
              locale === "zh" ? "zh-CN" : "en-US",
              { dateStyle: "medium", timeStyle: "short" },
            )}
          </span>
        </div>
        <div className={styles.actions}>
          <Button
            variant="outline"
            size="sm"
            disabled={exporting || !sections.length}
            onClick={() => void download()}
          >
            {exporting ? (
              <LoaderCircle size={14} className="spin" />
            ) : (
              <Download size={14} />
            )}{" "}
            {text(locale, "Download PDF", "下载 PDF")}
          </Button>
          <a
            href={officialSyllabusUrl(code)}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text(locale, "Official", "官网")} <ExternalLink size={13} />
          </a>
        </div>
      </div>
      {result.source === "backup" ? (
        <p className={styles.notice}>
          {text(
            locale,
            "The live document is unavailable. This archived version may differ from the instructor’s latest syllabus.",
            "实时文档暂不可用，现展示历史备份，内容可能与教师最新版本不同。",
          )}
        </p>
      ) : null}
      {result.data.entry.hasUploads ? (
        <p className={styles.notice}>
          {text(
            locale,
            "This syllabus includes uploaded files. Open the official page for those files; this PDF exports the readable sections below.",
            "这份大纲还包含上传文件，请到官网查看；本站 PDF 导出下方可读分区。",
          )}
        </p>
      ) : null}
      {exportError ? (
        <p className={styles.notice} role="alert">
          {text(
            locale,
            "PDF export failed. Please retry or open the official page.",
            "PDF 导出失败，请重试或打开官网。",
          )}
        </p>
      ) : null}
      <p className={styles.caption}>
        {text(
          locale,
          "PDF is generated on your device in US Letter format. Content follows the official published syllabus; the original layout may differ.",
          "PDF 在你的设备上以美国 Letter 纸张生成。内容来自官方已发布大纲，排版可能与原版不同。",
        )}
      </p>
      {sections.length ? (
        <>
          <div
            className={styles.layoutChoice}
            role="group"
            aria-label={text(locale, "Syllabus layout", "大纲版式")}
          >
            <Button
              size="sm"
              variant={layout === "official" ? "secondary" : "ghost"}
              aria-pressed={layout === "official"}
              onClick={() => setLayout("official")}
            >
              {text(locale, "Official layout", "官方版式")}
            </Button>
            <Button
              size="sm"
              variant={layout === "reading" ? "secondary" : "ghost"}
              aria-pressed={layout === "reading"}
              onClick={() => setLayout("reading")}
            >
              {text(locale, "Reading view", "清爽阅读")}
            </Button>
          </div>
          <SyllabusHighlights document={result.data} locale={locale} />
          <div className={styles.search}>
            <Search size={15} />
            <input
              aria-label={text(locale, "Find in syllabus", "在大纲中查找")}
              placeholder={text(
                locale,
                "Find readings, grading, policies…",
                "查找教材、评分、政策…",
              )}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <span aria-live="polite">
              {visible.length}/{sections.length}
            </span>
          </div>
          <nav
            className={styles.contents}
            aria-label={text(locale, "Syllabus contents", "大纲目录")}
          >
            {visible.map((section) => (
              <button
                key={section.id}
                type="button"
                data-category={section.category}
                onClick={() => {
                  if (layout === "official" && officialFrame.current) {
                    scrollOfficialSyllabusSection(
                      officialFrame.current,
                      section.id,
                    );
                    return;
                  }
                  document
                    .getElementById(`${sectionId}-${section.id}`)
                    ?.scrollIntoView({
                      block: "start",
                      behavior: window.matchMedia(
                        "(prefers-reduced-motion: reduce)",
                      ).matches
                        ? "instant"
                        : "smooth",
                    });
                }}
              >
                {section.title}
              </button>
            ))}
          </nav>
          {query && !visible.length ? (
            <p role="status">
              {text(
                locale,
                "No matching sections. Clear the search to read the full syllabus.",
                "没有匹配的分区，清空搜索即可查看完整大纲。",
              )}
            </p>
          ) : null}
          {layout === "official" ? (
            <OfficialSyllabusView
              frameRef={officialFrame}
              components={result.data.components.filter((component) =>
                visible.some((section) => section.id === component.id),
              )}
              locale={locale}
            />
          ) : (
            <article
              className={styles.paper}
              aria-label={text(
                locale,
                "Published syllabus content",
                "已发布大纲正文",
              )}
            >
              {visible.map((section) => (
                <section
                  id={`${sectionId}-${section.id}`}
                  key={section.id}
                  className={styles.contentSection}
                  dangerouslySetInnerHTML={{ __html: section.html }}
                />
              ))}
            </article>
          )}
        </>
      ) : (
        <p className={styles.notice}>
          {text(
            locale,
            "No readable sections were returned. Check uploaded files on the official page.",
            "官方未返回可读分区，请到官网检查上传文件。",
          )}
        </p>
      )}
    </div>
  );
}
