"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  FileText,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { SyllabusReader } from "@/components/syllabus/syllabus-reader";
import { SyllabusTeachers } from "@/components/syllabus/syllabus-teachers";
import { checkSavedSyllabi } from "@/lib/syllabus/update-check";
import { syllabusHasUpdate, type SavedSyllabus } from "@/lib/syllabus/saved";
import { formatSyllabusTime } from "@/lib/syllabus/time";
import { text, type Locale } from "@/lib/i18n";
import styles from "./saved-syllabi.module.css";

function destination(item: SavedSyllabus, section = false) {
  return {
    pathname: "/",
    query: {
      q: `${item.entry.subject} ${item.entry.catalogNumber}`,
      term: item.course.termCode,
      campus: item.course.campusCode.toLowerCase(),
      course: item.course.id,
      detailTab: "sections",
      ...(section ? { focusSection: item.section.classNumber } : {}),
    },
  };
}
function RelatedLinks({
  item,
  locale,
}: {
  item: SavedSyllabus;
  locale: Locale;
}) {
  return (
    <div className={styles.links}>
      <Link href={destination(item)}>
        <BookOpen size={12} />
        {text(locale, "Course details", "课程详情")}
        <ArrowUpRight size={11} />
      </Link>
      <Link href={destination(item, true)}>
        {text(
          locale,
          `Section #${item.section.classNumber}`,
          `班次 #${item.section.classNumber}`,
        )}
        <ArrowUpRight size={11} />
      </Link>
    </div>
  );
}
export function SavedSyllabi({ locale }: { locale: Locale }) {
  const { savedSyllabi, toggle } = useSavedSyllabi();
  const [selected, setSelected] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState("");
  const opener = useRef<HTMLButtonElement | null>(null);
  const chosen = savedSyllabi.find((item) => item.id === selected);
  const unread = savedSyllabi.filter(syllabusHasUpdate).length;
  const items = [...savedSyllabi].sort(
    (a, b) => Number(syllabusHasUpdate(b)) - Number(syllabusHasUpdate(a)),
  );
  return (
    <>
      <div className={styles.toolbar}>
        <span>
          {text(
            locale,
            "Read saved syllabi directly. Update alerts stay until you mark them as read.",
            "直接阅读收藏的大纲；更新提醒需手动标为已读。",
          )}
        </span>
        <button
          type="button"
          disabled={checking || !items.length}
          onClick={async () => {
            setChecking(true);
            try {
              const result = await checkSavedSyllabi(true);
              setStatus(
                result
                  ? text(
                      locale,
                      `Checked ${result.checked} · ${result.failed + result.archived} could not be verified live`,
                      `已核验 ${result.checked} 份 · ${result.failed + result.archived} 份暂无法实时核验`,
                    )
                  : text(locale, "Already checked", "已完成核验"),
              );
            } catch {
              setStatus(
                text(
                  locale,
                  "Update check unavailable. Existing alerts are kept.",
                  "更新检查暂不可用，已有提醒已保留。",
                ),
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          <RefreshCw size={12} className={checking ? "spin" : undefined} />
          {text(
            locale,
            checking ? "Checking…" : "Check updates",
            checking ? "正在检查…" : "检查更新",
          )}
        </button>
      </div>
      {status ? (
        <p className={styles.status} role="status">
          {status}
        </p>
      ) : null}
      {unread ? (
        <p className={styles.unread} role="status">
          {text(
            locale,
            `${unread} saved syllabi have updates`,
            `${unread} 份收藏大纲有更新`,
          )}
        </p>
      ) : null}
      <div className={styles.list}>
        {items.map((item) => (
          <article
            key={item.id}
            className={styles.card}
            data-saved-syllabus={item.id}
          >
            <div className={styles.heading}>
              <button
                type="button"
                className={styles.open}
                data-open-syllabus={item.id}
                onClick={(event) => {
                  opener.current = event.currentTarget;
                  setSelected(item.id);
                }}
              >
                <FileText size={17} />
                <span>
                  <strong>
                    {item.entry.subject} {item.entry.catalogNumber}
                  </strong>
                  <span>{item.entry.subtitle || item.course.title}</span>
                </span>
                {syllabusHasUpdate(item) ? (
                  <b className={styles.updated}>
                    {text(locale, "Updated", "有更新")}
                  </b>
                ) : null}
              </button>
              <button
                type="button"
                className={styles.remove}
                aria-label={text(
                  locale,
                  `Unsave syllabus #${item.section.classNumber}`,
                  `取消收藏大纲 #${item.section.classNumber}`,
                )}
                onClick={() => toggle(item.course, item.section, item.entry)}
              >
                <Trash2 size={14} />
              </button>
            </div>
            <p className={styles.meta}>
              {item.entry.termName} · {item.course.campus} ·{" "}
              {item.section.component} {item.section.section} · #
              {item.section.classNumber}
            </p>
            <SyllabusTeachers
              people={item.section.instructors}
              course={item.course}
              locale={locale}
            />
            <p className={styles.meta}>
              {text(locale, "Official update", "官方更新")}{" "}
              {formatSyllabusTime(item.latest?.modifiedAt, locale) ??
                text(locale, "Not provided", "未提供")}
            </p>
            <RelatedLinks item={item} locale={locale} />
          </article>
        ))}
      </div>
      {!items.length ? (
        <p className={styles.status}>
          {text(
            locale,
            "No saved syllabi. Save one from a course's Syllabus tab.",
            "暂无收藏大纲，可在课程的「教学大纲」中收藏。",
          )}
        </p>
      ) : null}
      <Sheet
        open={Boolean(chosen)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <SheetContent
          className={styles.readerSheet}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          onInteractOutside={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest("[data-debug-tools]")
            )
              event.preventDefault();
          }}
        >
          <SheetHeader className={styles.readerHeader}>
            <SheetTitle>
              {chosen
                ? `${chosen.entry.subject} ${chosen.entry.catalogNumber} · #${chosen.section.classNumber}`
                : text(locale, "Saved syllabus", "收藏大纲")}
            </SheetTitle>
            <SheetDescription>
              {chosen?.entry.subtitle} · {chosen?.entry.termName}
            </SheetDescription>
            {chosen ? <RelatedLinks item={chosen} locale={locale} /> : null}
          </SheetHeader>
          <div className={styles.readerBody} data-syllabus-reader>
            {chosen ? (
              <SyllabusReader
                key={chosen.id}
                entry={chosen.entry}
                locale={locale}
              />
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
