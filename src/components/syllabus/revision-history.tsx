"use client";
import { useEffect, useState } from "react";
import { GitCompareArrows, LoaderCircle } from "lucide-react";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { Button } from "@/components/ui/button";
import { text, type Locale } from "@/lib/i18n";
import type {
  SyllabusDiffLine,
  SyllabusDiffBlock,
  SyllabusRevisionChanges,
} from "@/lib/syllabus/diff";
import styles from "./revision-history.module.css";
type Version = {
  id: string;
  modifiedAt: string | null;
  fetchedAt: string;
  archivedCopies?: number;
};
export function SyllabusRevisionHistory({
  code,
  locale,
}: {
  code: string;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false),
    [versions, setVersions] = useState<Version[]>([]),
    [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [lines, setLines] = useState<SyllabusDiffLine[]>([]),
    [blocks, setBlocks] = useState<SyllabusDiffBlock[]>([]),
    [changes, setChanges] = useState<SyllabusRevisionChanges | null>(null),
    [mode, setMode] = useState<"lines" | "document">("document"),
    [loading, setLoading] = useState(false),
    [listing, setListing] = useState(false),
    [failed, setFailed] = useState(false),
    [retry, setRetry] = useState(0),
    [context, setContext] = useState(false);
  const t = (en: string, zh: string) => text(locale, en, zh);
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    fetch("/api/syllabus/revisions?" + new URLSearchParams({ code }), {
      signal: c.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) {
          setVersions(d.versions);
          if (d.versions.length < 2) setLoading(false);
          setAfter(d.versions[0]?.id ?? "");
          setBefore(d.versions[1]?.id ?? "");
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setListing(false);
      });
    return () => c.abort();
  }, [open, code, retry]);
  useEffect(() => {
    if (!open || !before || !after) return;
    const c = new AbortController();
    queueMicrotask(() => {
      if (!c.signal.aborted) setLoading(true);
    });
    fetch(
      "/api/syllabus/revisions?" + new URLSearchParams({ code, before, after }),
      { signal: c.signal },
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!c.signal.aborted) {
          setLines(d.lines);
          setBlocks(d.blocks);
          setChanges(d.changes);
        }
      })
      .catch(() => {
        if (!c.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [open, code, before, after, retry]);
  const label = (version: Version) =>
    new Date(version.modifiedAt ?? version.fetchedAt).toLocaleString(
      locale === "zh" ? "zh-CN" : "en-US",
    ) +
    " · " +
    version.id.slice(0, 7);
  const added = lines.filter((line) => line.kind === "added").length,
    removed = lines.filter((line) => line.kind === "removed").length;
  const noTextChange = changes && !changes.text;
  const categories = changes
    ? [
        changes.links && t("Links changed", "链接变化"),
        changes.media && t("Images changed", "图片变化"),
        changes.presentation && t("Formatting changed", "排版变化"),
        changes.metadata && t("Source details changed", "来源信息变化"),
        changes.archiveRepresentation &&
          t("Archived layout added", "补存原版排版"),
      ].filter(Boolean)
    : [];
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setBefore("");
          setAfter("");
          setLines([]);
          setListing(true);
          setLoading(false);
          setFailed(false);
          setOpen(true);
        }}
        data-analytics-action="syllabus_revision_history"
      >
        <GitCompareArrows size={14} />
        {t("Revision history", "内容修改历史")}
      </Button>
      <WorkspaceDialog
        open={open}
        onOpenChange={setOpen}
        wide
        title={t("Syllabus changes", "大纲内容修改记录")}
        description={t(
          "Compare archived versions. Green lines were added; red lines were removed.",
          "对比已归档版本：绿色为新增，红色为删除。",
        )}
        closeLabel={t("Close", "关闭")}
        guard={false}
        detectFormChanges={false}
      >
        <div className={styles.root}>
          {versions.length >= 2 && (
            <div className={styles.controls}>
              <label>
                {t("Earlier version", "旧版本")}
                <ChoiceSelect
                  value={before}
                  onValueChange={(value) => {
                    if (value !== before) {
                      setLoading(true);
                      setFailed(false);
                      setBefore(value);
                    }
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {label(v)}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <label>
                {t("Later version", "新版本")}
                <ChoiceSelect
                  value={after}
                  onValueChange={(value) => {
                    if (value !== after) {
                      setLoading(true);
                      setFailed(false);
                      setAfter(value);
                    }
                  }}
                >
                  {versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {label(v)}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
            </div>
          )}
          {listing || loading ? (
            <p className={styles.status}>
              <LoaderCircle size={15} className="spin" />
              {t("Loading versions…", "正在加载版本…")}
            </p>
          ) : failed ? (
            <Button
              variant="outline"
              onClick={() => {
                setListing(true);
                setFailed(false);
                setRetry((n) => n + 1);
              }}
            >
              {t("Could not load · Retry", "加载失败 · 重试")}
            </Button>
          ) : versions.length < 2 ? (
            <p className={styles.status}>
              {t(
                "There are not yet two archived versions to compare. Future content updates will appear here.",
                "目前尚未归档两个不同版本；后续记录到内容更新后即可在这里对比。",
              )}
            </p>
          ) : (
            <>
              <div className={styles.summary}>
                {noTextChange ? (
                  <p>{t("No text changes", "正文无变化")}</p>
                ) : (
                  <>
                    <span>
                      +{added} {t("added", "行新增")}
                    </span>
                    <span>
                      −{removed} {t("removed", "行删除")}
                    </span>
                  </>
                )}
              </div>
              {categories.length > 0 && (
                <p className={styles.status}>
                  {categories.join(t(" · ", " · "))}
                </p>
              )}
              <div
                className={styles.views}
                role="group"
                aria-label={t("Comparison view", "对比视图")}
              >
                <Button
                  size="sm"
                  variant={mode === "document" ? "default" : "outline"}
                  aria-pressed={mode === "document"}
                  onClick={() => setMode("document")}
                >
                  {t("Document", "文档")}
                </Button>
                <Button
                  size="sm"
                  variant={mode === "lines" ? "default" : "outline"}
                  aria-pressed={mode === "lines"}
                  onClick={() => setMode("lines")}
                >
                  {t("Line diff", "逐行差异")}
                </Button>
                {mode === "lines" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-pressed={context}
                    onClick={() => setContext((value) => !value)}
                  >
                    {context
                      ? t("Changes with context", "仅查看变更上下文")
                      : t("Show full document", "显示完整文档")}
                  </Button>
                )}
              </div>
              {mode === "document" ? (
                <>
                  <p className={styles.legend}>
                    <del>{t("Removed", "删除")}</del>
                    <ins>{t("Added", "新增")}</ins>
                  </p>
                  <div
                    className={styles.document}
                    role="region"
                    aria-label={t("Document changes", "文档修改对比")}
                    tabIndex={0}
                  >
                    {blocks.map((block, index) => (
                      <div
                        key={index}
                        data-kind={block.kind}
                        role={block.kind === "same" ? undefined : "group"}
                        aria-label={
                          block.kind === "removed"
                            ? t("Removed", "删除")
                            : block.kind === "added"
                              ? t("Added", "新增")
                              : undefined
                        }
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                    ))}
                  </div>
                </>
              ) : !added && !removed ? (
                <p className={styles.status}>
                  {t(
                    "The archived text is unchanged. Source updates can change formatting or source details.",
                    "归档正文一致；来源更新可能只涉及排版或来源信息。",
                  )}
                </p>
              ) : (
                <div
                  className={styles.diff}
                  role="region"
                  aria-label={t("Line-by-line changes", "逐行修改对比")}
                  tabIndex={0}
                >
                  {lines.map((line, index) => {
                    if (
                      !context &&
                      line.kind === "same" &&
                      !lines
                        .slice(Math.max(0, index - 3), index + 4)
                        .some((row) => row.kind !== "same")
                    )
                      return index === 0 || lines[index - 1].kind !== "same" ? (
                        <div key={index} className={styles.omitted}>
                          ···
                        </div>
                      ) : null;
                    return (
                      <div
                        className={styles.line}
                        data-kind={line.kind}
                        key={index}
                      >
                        <small>{line.before ?? ""}</small>
                        <small>{line.after ?? ""}</small>
                        <span
                          aria-label={
                            line.kind === "added"
                              ? t("Added", "新增")
                              : line.kind === "removed"
                                ? t("Removed", "删除")
                                : undefined
                          }
                        >
                          {line.kind === "added"
                            ? "+"
                            : line.kind === "removed"
                              ? "−"
                              : " "}
                        </span>
                        <p>{line.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </WorkspaceDialog>
    </>
  );
}
