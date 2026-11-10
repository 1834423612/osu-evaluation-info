"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Download, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { text, type Locale } from "@/lib/i18n";
import {
  chooseSyllabusSaveTarget,
  writeSyllabusFile,
  type SyllabusSaveHandle,
} from "@/lib/syllabus/save";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import styles from "./syllabus-download.module.css";

export function SyllabusDownload({
  document: syllabus,
  locale,
}: {
  document: SyllabusDocument;
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [error, setError] = useState(false);
  const [fallback, setFallback] = useState<{
    url: string;
    fileName: string;
  } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const url = useRef<string | null>(null),
    mounted = useRef(false),
    pending = useRef(false),
    toast = useRef<HTMLDivElement>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);
  useEffect(() => {
    const node = toast.current;
    if (!blocked || !node || typeof node.showPopover !== "function") return;
    try {
      node.showPopover();
    } catch {
      return;
    }
    const timeout = setTimeout(() => node.hidePopover(), 8000);
    return () => {
      clearTimeout(timeout);
      node.hidePopover();
    };
  }, [blocked]);

  async function download() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setSaved(false);
    setError(false);
    setBlocked(false);
    try {
      const fileName =
        `${syllabus.entry.termName}-${syllabus.entry.title}.pdf`.replace(
          /[^a-z0-9. -]/gi,
          "_",
        );
      const target = await chooseSyllabusSaveTarget(
        fileName,
        window as Window & {
          showSaveFilePicker?: (options: object) => Promise<SyllabusSaveHandle>;
        },
      );
      if (target.kind === "cancelled" || !mounted.current) return;
      const { createSyllabusPdf } = await import("@/lib/syllabus/pdf");
      const file = await createSyllabusPdf(syllabus);
      if (!mounted.current) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = null;
      setFallback(null);
      if (target.kind === "file") {
        try {
          await writeSyllabusFile(target.handle, file.blob);
          if (mounted.current) setSaved(true);
          return;
        } catch {
          if (!mounted.current) return;
          setError(true);
        }
      }
      const prepared = {
        url: URL.createObjectURL(file.blob),
        fileName: file.fileName,
      };
      url.current = prepared.url;
      setFallback(prepared);
      if (target.kind === "download") {
        const link = document.createElement("a");
        link.href = prepared.url;
        link.download = prepared.fileName;
        document.body.append(link);
        link.click();
        link.remove();
        setBlocked(target.pickerBlocked);
      }
    } catch {
      if (mounted.current) setError(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className={styles.group}>
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => void download()}
        title={text(
          locale,
          "Create a US Letter PDF on this device",
          "在本机生成 Letter PDF",
        )}
      >
        {busy ? (
          <LoaderCircle size={14} className="spin" />
        ) : saved ? (
          <Check size={14} />
        ) : (
          <Download size={14} />
        )}
        {busy
          ? text(locale, "Preparing…", "正在准备…")
          : saved
            ? text(locale, "Saved", "已保存")
            : text(locale, "Download PDF", "下载 PDF")}
      </Button>
      {fallback ? (
        <a
          className={styles.saveLink}
          href={fallback.url}
          download={fallback.fileName}
        >
          {text(locale, "Save PDF manually", "手动保存 PDF")}
        </a>
      ) : null}
      {error ? (
        <small className={styles.error} role="alert">
          {fallback
            ? text(
                locale,
                "Could not write the file. Use the link above.",
                "文件写入失败，请使用上方链接。",
              )
            : text(
                locale,
                "Export failed. Please retry.",
                "导出失败，请重试。",
              )}
        </small>
      ) : null}
      <div ref={toast} className={styles.toast} popover="manual" role="status">
        <Download size={17} />
        <span>
          {text(
            locale,
            "The browser blocked the save picker. Use the download link if needed.",
            "浏览器拒绝打开保存窗口，可使用按钮下方的保存链接。",
          )}
        </span>
        <button
          type="button"
          aria-label={text(locale, "Dismiss download message", "关闭下载提示")}
          onClick={() => toast.current?.hidePopover()}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
