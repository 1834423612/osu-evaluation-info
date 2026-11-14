"use client";
import { ChoiceSelect } from "@/components/ui/choice-select";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  ListTree,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  X,
} from "lucide-react";
import { SceneMascot } from "@/components/brand/scene-mascot";
import {
  extractSyllabusSections,
  type SyllabusSection,
} from "@/lib/syllabus/content";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import {
  OfficialSyllabusView,
  type SyllabusViewerPosition,
} from "./official-syllabus-view";
import styles from "./syllabus-viewer.module.css";

export type SyllabusViewerHandle = {
  goToSection: (id: string, bringIntoView?: boolean) => void;
};
const subscribeCompact = (notify: () => void) => {
  const media = window.matchMedia("(max-width:700px)");
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};
const compactSnapshot = () => window.matchMedia("(max-width:700px)").matches;
const noSubscribe = () => () => {};
const fullscreenSnapshot = () => Boolean(document.fullscreenEnabled);

function sectionLabel(section: SyllabusSection, index: number, locale: Locale) {
  if (index === 0 && section.category === "other")
    return text(locale, "Course information", "课程信息");
  const label =
    section.category === "instructor"
      ? text(locale, "Instructors", "授课教师")
      : section.category === "materials"
        ? text(locale, "Readings & materials", "教材与阅读")
        : section.category === "schedule"
          ? text(locale, "Course schedule", "课程安排")
          : section.category === "grading"
            ? text(locale, "Assessment", "考核方式")
            : section.category === "policies"
              ? text(locale, "University policies", "学校政策")
              : section.title;
  return label;
}

export const SyllabusViewer = forwardRef<
  SyllabusViewerHandle,
  { document: SyllabusDocument; locale: Locale; downloadAction: ReactNode }
>(function SyllabusViewer({ document: syllabus, locale, downloadAction }, ref) {
  const sections = useMemo(() => extractSyllabusSections(syllabus), [syllabus]);
  const [layout, setLayout] = useState<"official" | "reading">("official");
  const [query, setQuery] = useState("");
  const [zoom, setZoom] = useState(1);
  const [outlineChoice, setOutlineChoice] = useState<boolean | null>(null);
  const [position, setPosition] = useState<SyllabusViewerPosition>({
    activeId: sections[0]?.id ?? "",
    percent: 0,
  });
  const [fullscreen, setFullscreen] = useState(false);
  const compact = useSyncExternalStore(
    subscribeCompact,
    compactSnapshot,
    () => false,
  );
  const supportsFullscreen = useSyncExternalStore(
    noSubscribe,
    fullscreenSnapshot,
    () => false,
  );
  const outlineOpen = outlineChoice ?? !compact;
  const root = useRef<HTMLDivElement>(null),
    frame = useRef<HTMLIFrameElement>(null),
    reading = useRef<HTMLDivElement>(null);
  const pending = useRef<string | null>(null),
    animation = useRef<number | null>(null);
  const outlineId = useId();
  const visible = useMemo(
    () =>
      sections.filter(
        (section) =>
          !query.trim() ||
          `${section.title}\n${section.text}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [sections, query],
  );
  const components = useMemo(
    () =>
      syllabus.components.filter((component) =>
        visible.some((section) => section.id === component.id),
      ),
    [syllabus, visible],
  );
  const current = Math.max(
    0,
    visible.findIndex((section) => section.id === position.activeId),
  );
  const onPosition = useCallback(
    (next: SyllabusViewerPosition) =>
      setPosition((previous) =>
        previous.activeId === next.activeId && previous.percent === next.percent
          ? previous
          : next,
      ),
    [],
  );

  const navigate = useCallback(
    (id: string, bringIntoView = false) => {
      if (bringIntoView)
        root.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      if (!visible.some((section) => section.id === id)) {
        pending.current = id;
        setQuery("");
        return;
      }
      const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
        .matches
        ? "instant"
        : "smooth";
      if (layout === "official") {
        const doc = frame.current?.contentDocument,
          target = doc?.getElementById(`syllabus-${id}`),
          view = frame.current?.contentWindow;
        if (!target || !view) {
          pending.current = id;
          return;
        }
        view.scrollTo({
          top: view.scrollY + target.getBoundingClientRect().top - 20,
          behavior,
        });
      } else {
        const scroller = reading.current,
          target = scroller?.querySelector<HTMLElement>(
            `[data-syllabus-section="${id}"]`,
          );
        if (!scroller || !target) {
          pending.current = id;
          return;
        }
        scroller.scrollTo({
          top:
            scroller.scrollTop +
            target.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top -
            24,
          behavior,
        });
      }
      pending.current = null;
      if (compact) setOutlineChoice(false);
    },
    [visible, layout, compact],
  );
  useImperativeHandle(ref, () => ({ goToSection: navigate }), [navigate]);
  const onReady = useCallback(() => {
    if (pending.current) navigate(pending.current);
  }, [navigate]);
  useEffect(() => {
    if (layout === "reading" && pending.current) navigate(pending.current);
  }, [layout, navigate]);
  useEffect(() => {
    const changed = () =>
      setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      if (animation.current !== null) cancelAnimationFrame(animation.current);
    };
  }, []);

  const readingPosition = useCallback(() => {
    if (animation.current !== null) return;
    animation.current = requestAnimationFrame(() => {
      animation.current = null;
      const scroller = reading.current;
      if (!scroller) return;
      let activeId = visible[0]?.id ?? "";
      for (const section of visible) {
        const node = scroller.querySelector<HTMLElement>(
          `[data-syllabus-section="${section.id}"]`,
        );
        if (
          node &&
          node.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top <=
            80
        )
          activeId = section.id;
        else break;
      }
      const distance = scroller.scrollHeight - scroller.clientHeight;
      onPosition({
        activeId,
        percent:
          distance > 1
            ? Math.max(
                0,
                Math.min(
                  100,
                  Math.round((scroller.scrollTop / distance) * 100),
                ),
              )
            : 100,
      });
    });
  }, [visible, onPosition]);
  useEffect(() => {
    if (layout === "reading") readingPosition();
  }, [layout, zoom, readingPosition]);

  return (
    <div
      ref={root}
      className={styles.viewer}
      data-syllabus-viewer
      data-outline-open={outlineOpen}
    >
      <div className={styles.header}>
        <div className={styles.documentName}>
          <FileText size={17} />
          <span>
            {syllabus.entry.subject} {syllabus.entry.catalogNumber}
            <small>
              #{syllabus.entry.classNumber || syllabus.entry.sectionIdentifier}
            </small>
          </span>
        </div>
        <div className={styles.tools}>
          <button
            className={styles.toolButton}
            type="button"
            onClick={() => setOutlineChoice(!outlineOpen)}
            aria-label={text(
              locale,
              "Toggle document outline",
              "显示或隐藏文档大纲",
            )}
            aria-expanded={outlineOpen}
            aria-controls={outlineId}
          >
            <ListTree size={16} />
          </button>
          <span className={styles.divider} />
          <button
            className={styles.toolButton}
            type="button"
            disabled={zoom <= 0.75}
            onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))}
            aria-label={text(locale, "Zoom out", "缩小文档")}
          >
            <Minus size={15} />
          </button>
          <ChoiceSelect
            className={styles.zoomSelect}
            aria-label={text(locale, "Document zoom", "文档缩放")}
            value={Math.round(zoom * 100)}
            onValueChange={(value) => setZoom(Number(value) / 100)}
          >
            {[75, 100, 125, 150, 175].map((value) => (
              <option key={value} value={value}>
                {value}%
              </option>
            ))}
          </ChoiceSelect>
          <button
            className={styles.toolButton}
            type="button"
            disabled={zoom >= 1.75}
            onClick={() => setZoom((value) => Math.min(1.75, value + 0.25))}
            aria-label={text(locale, "Zoom in", "放大文档")}
          >
            <Plus size={15} />
          </button>
          <button
            className={styles.toolButton}
            type="button"
            onClick={() => setZoom(1)}
          >
            {text(locale, "Fit", "适宽")}
          </button>
          {supportsFullscreen ? (
            <button
              className={styles.toolButton}
              type="button"
              onClick={() => {
                const request = document.fullscreenElement
                  ? document.exitFullscreen()
                  : root.current?.requestFullscreen();
                void request?.catch(() => {});
              }}
              aria-label={
                fullscreen
                  ? text(locale, "Exit fullscreen", "退出全屏阅读")
                  : text(locale, "Read fullscreen", "全屏阅读")
              }
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
          ) : null}
        </div>
        <div className={styles.download}>{downloadAction}</div>
      </div>
      <div className={styles.modeBar}>
        <div
          className={styles.modes}
          role="group"
          aria-label={text(locale, "Syllabus layout", "大纲版式")}
        >
          {(["official", "reading"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={layout === mode}
              onClick={() => {
                pending.current = visible[current]?.id ?? null;
                setLayout(mode);
              }}
            >
              {mode === "official"
                ? text(locale, "Official layout", "官方版式")
                : text(locale, "Reading view", "清爽阅读")}
            </button>
          ))}
        </div>
        <div className={styles.search}>
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={text(locale, "Find in document…", "查找正文…")}
            aria-label={text(locale, "Find in syllabus", "在大纲中查找")}
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={text(locale, "Clear document search", "清空正文搜索")}
            >
              <X size={13} />
            </button>
          ) : (
            <kbd>⌕</kbd>
          )}
        </div>
      </div>
      <div className={styles.body}>
        {outlineOpen ? (
          <nav
            id={outlineId}
            className={styles.outline}
            aria-label={text(locale, "Document outline", "文档大纲")}
          >
            <div className={styles.outlineHeading}>
              <ListTree size={13} />
              {text(locale, "CONTENTS", "文档大纲")}
              <span>{visible.length}</span>
            </div>
            <ol>
              {visible.map((section, index) => (
                <li key={section.id}>
                  <button
                    type="button"
                    aria-current={current === index ? "location" : undefined}
                    onClick={() => navigate(section.id)}
                    title={section.title}
                  >
                    <span className={styles.chapterNumber}>{index + 1}</span>
                    <span>
                      {sectionLabel(section, sections.indexOf(section), locale)}
                    </span>
                    {current === index ? <ChevronRight size={12} /> : null}
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        <div className={styles.canvas}>
          {!visible.length ? (
            <div className={styles.empty} role="status">
              <SceneMascot scene="no-results" size={72} />
              <p>{text(locale, "No matching sections", "没有匹配的章节")}</p>
              <button type="button" onClick={() => setQuery("")}>
                {text(locale, "Clear search", "清空搜索")}
              </button>
            </div>
          ) : layout === "official" ? (
            <OfficialSyllabusView
              components={components}
              locale={locale}
              frameRef={frame}
              zoom={zoom}
              onPosition={onPosition}
              onReady={onReady}
            />
          ) : (
            <div
              ref={reading}
              className={styles.readingScroll}
              onScroll={readingPosition}
              role="region"
              aria-label={text(
                locale,
                "Readable syllabus document",
                "清爽阅读正文",
              )}
              tabIndex={0}
            >
              <article className={styles.paper} style={{ zoom }}>
                {visible.map((section) => (
                  <section
                    key={section.id}
                    data-syllabus-section={section.id}
                    className={styles.contentSection}
                    dangerouslySetInnerHTML={{ __html: section.html }}
                  />
                ))}
              </article>
            </div>
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <span>
          {query
            ? text(
                locale,
                `${visible.length} matching sections`,
                `${visible.length} 个匹配章节`,
              )
            : text(
                locale,
                `Section ${visible.length ? current + 1 : 0} of ${visible.length}`,
                `第 ${visible.length ? current + 1 : 0} / ${visible.length} 章节`,
              )}
        </span>
        <div>
          <button
            className={styles.toolButton}
            type="button"
            disabled={!visible.length || current === 0}
            onClick={() => navigate(visible[current - 1].id)}
            aria-label={text(locale, "Previous section", "上一章节")}
          >
            <ChevronLeft size={14} />
          </button>
          <span className={styles.currentSection}>
            {visible[current]
              ? sectionLabel(
                  visible[current],
                  sections.indexOf(visible[current]),
                  locale,
                )
              : "—"}
          </span>
          <button
            className={styles.toolButton}
            type="button"
            disabled={!visible.length || current === visible.length - 1}
            onClick={() => navigate(visible[current + 1].id)}
            aria-label={text(locale, "Next section", "下一章节")}
          >
            <ChevronRight size={14} />
          </button>
        </div>
        <span>
          {position.percent}%<ChevronDown size={11} />
        </span>
      </div>
      <div
        className={styles.progress}
        role="progressbar"
        aria-label={text(locale, "Document reading progress", "文档阅读进度")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={position.percent}
      >
        <span style={{ width: `${position.percent}%` }} />
      </div>
    </div>
  );
});
