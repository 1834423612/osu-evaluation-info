"use client";
import { useState } from "react";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { sameRevision, syllabusHasUpdate } from "@/lib/syllabus/saved";
import type { SyllabusDocument, SyllabusResult } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus.module.css";

export function SyllabusUpdateNotice({
  result,
  locale,
}: {
  result: SyllabusResult<SyllabusDocument>;
  locale: Locale;
}) {
  const { savedSyllabi, acknowledge } = useSavedSyllabi();
  const [kept, setKept] = useState(false);
  const item = savedSyllabi.find((item) => item.id === result.data.entry.code);
  if (!item || !syllabusHasUpdate(item)) return null;
  const current =
    result.source !== "backup" && sameRevision(item.latest, result.data);
  return (
    <div className={styles.updateNotice} role="status" data-syllabus-update>
      <strong>
        {text(locale, "Updated since you saved it", "收藏后有更新")}
      </strong>
      <p>
        {kept
          ? text(
              locale,
              "Notification kept. You can mark it as read later.",
              "提醒已保留，可稍后标为已读。",
            )
          : text(
              locale,
              "Opening this syllabus keeps the notification. Clear it when you have reviewed the update.",
              "打开大纲不会清除提醒。确认查看更新后，可手动标为已读。",
            )}
      </p>
      {!current ? (
        <p>
          {text(
            locale,
            "Load the latest official version to mark this update as read.",
            "需载入最新官方版本后才能消除本次提醒。",
          )}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button
          type="button"
          disabled={!current}
          onClick={() =>
            acknowledge(item.id, {
              snapshotId: result.data.snapshotId,
              modifiedAt: result.data.modifiedAt,
            })
          }
        >
          {text(locale, "Mark as read", "标为已读")}
        </button>
        <button type="button" onClick={() => setKept(true)}>
          {text(locale, "Keep unread", "暂时保留提醒")}
        </button>
      </div>
    </div>
  );
}
