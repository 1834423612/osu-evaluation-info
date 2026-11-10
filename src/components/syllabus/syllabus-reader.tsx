"use client";

import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { text, type Locale } from "@/lib/i18n";
import { syllabusClient } from "@/lib/syllabus/client";
import { officialSyllabusUrl, SyllabusError } from "@/lib/syllabus/normalize";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusResult,
} from "@/lib/syllabus/types";
import { SyllabusHighlights } from "./syllabus-highlights";
import { SyllabusViewer, type SyllabusViewerHandle } from "./syllabus-viewer";
import styles from "./syllabus.module.css";

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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [downloadFile, setDownloadFile] = useState<{
    url: string;
    fileName: string;
  } | null>(null);
  const downloadUrl = useRef<string | null>(null),
    mounted = useRef(false),
    viewer = useRef<SyllabusViewerHandle>(null);
  const { code, termId, entityId, classNumber } = entry;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
    };
  }, []);
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

  async function download() {
    if (!result || exporting) return;
    setExporting(true);
    setExportError(false);
    try {
      const { downloadSyllabusPdf } = await import("@/lib/syllabus/pdf");
      const prepared = await downloadSyllabusPdf(result.data);
      if (!mounted.current) {
        URL.revokeObjectURL(prepared.url);
        return;
      }
      if (downloadUrl.current) URL.revokeObjectURL(downloadUrl.current);
      downloadUrl.current = prepared.url;
      setDownloadFile(prepared);
    } catch {
      if (mounted.current) setExportError(true);
    } finally {
      if (mounted.current) setExporting(false);
    }
  }

  if (error)
    return (
      <div className={styles.notice} role="status">
        <p>
          {error === "restricted"
            ? text(
                locale,
                "The official service declined this document request. Check access on the official page.",
                "官方拒绝了这份文档请求，请到官网检查访问权限。",
              )
            : error === "missing"
              ? text(
                  locale,
                  "This syllabus is not published or is no longer available.",
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
            {text(locale, "Open official syllabus", "打开官方大纲")}
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

  const downloadAction = (
    <div className={styles.downloadGroup}>
      <Button
        variant="outline"
        size="sm"
        disabled={exporting || !result.data.components.length}
        onClick={() => void download()}
        title={text(
          locale,
          "Create a US Letter PDF on this device",
          "在本机生成 Letter PDF",
        )}
      >
        {exporting ? (
          <LoaderCircle size={14} className="spin" />
        ) : (
          <Download size={14} />
        )}{" "}
        {text(locale, "Download PDF", "下载 PDF")}
      </Button>
      {downloadFile ? (
        <a
          className={styles.saveLink}
          href={downloadFile.url}
          download={downloadFile.fileName}
        >
          {text(locale, "Save again", "再次保存")}
        </a>
      ) : null}
    </div>
  );
  const timestamp =
    result.source === "backup"
      ? result.fetchedAt
      : (result.data.modifiedAt ?? result.fetchedAt);
  return (
    <div className={styles.reader}>
      <div className={styles.sourceLine}>
        <DataSourceBadge
          source={result.source === "backup" ? "sync" : "official"}
        >
          {result.source === "backup"
            ? text(locale, "Archived backup", "历史备份")
            : text(locale, "OSU official", "OSU 官方")}
        </DataSourceBadge>
        <span>
          {result.source === "backup"
            ? text(locale, "Archived", "备份于")
            : result.data.modifiedAt
              ? text(locale, "Updated", "更新于")
              : text(locale, "Retrieved", "获取于")}{" "}
          {new Date(timestamp).toLocaleDateString(
            locale === "zh" ? "zh-CN" : "en-US",
            { year: "numeric", month: "short", day: "numeric" },
          )}
        </span>
        <a
          href={officialSyllabusUrl(code)}
          target="_blank"
          rel="noopener noreferrer"
        >
          {text(locale, "View source", "官方原文")}
          <ExternalLink size={12} />
        </a>
      </div>
      {result.source === "backup" ? (
        <p className={styles.notice}>
          {text(
            locale,
            "Live data is unavailable. This archive may differ from the latest published version.",
            "实时数据暂不可用，历史备份可能与最新发布版本不同。",
          )}
        </p>
      ) : null}
      {result.data.entry.hasUploads ? (
        <p className={styles.notice}>
          {text(
            locale,
            "Additional uploaded files are available on the official page.",
            "这份大纲另有上传附件，可到官网查看。",
          )}
        </p>
      ) : null}
      {exportError ? (
        <p className={styles.notice} role="alert">
          {text(
            locale,
            "PDF export failed. Please retry or open the source.",
            "PDF 导出失败，请重试或打开官方原文。",
          )}
        </p>
      ) : null}
      {result.data.components.length ? (
        <>
          <SyllabusHighlights
            document={result.data}
            locale={locale}
            onNavigate={(id) => viewer.current?.goToSection(id, true)}
          />
          <SyllabusViewer
            ref={viewer}
            document={result.data}
            locale={locale}
            downloadAction={downloadAction}
          />
        </>
      ) : (
        <p className={styles.notice}>
          {text(
            locale,
            "No readable sections were returned. Check the files on the official page.",
            "官方未返回可读分区，请到官网检查上传文件。",
          )}
        </p>
      )}
    </div>
  );
}
