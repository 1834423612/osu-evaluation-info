"use client";
import { Bookmark, FolderPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { savedScope } from "@/lib/saved/scope";
import type { CatalogCourse } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
export function CourseSaveButton({
  course,
  saved,
  locale,
  onSave,
  compact = false,
}: {
  course: CatalogCourse;
  saved: boolean;
  locale: Locale;
  onSave: (course: CatalogCourse) => void;
  compact?: boolean;
}) {
  const label = saved
    ? text(locale, "Edit saved folders", "修改收藏夹")
    : text(locale, "Save course", "收藏课程");
  return (
    <Button
      type="button"
      variant={saved ? "outline" : "ghost"}
      size={compact ? "icon-sm" : "sm"}
      aria-label={`${label} · ${course.subject} ${course.catalogNumber}`}
      aria-pressed={saved}
      title={label}
      data-analytics-action={
        saved ? "course_favorite_folders" : "course_favorite"
      }
      onClick={(event) => {
        event.stopPropagation();
        if (saved)
          window.dispatchEvent(
            new CustomEvent("course-atlas:favorite-added", {
              detail: {
                key: "course:" + course.id,
                title: course.subject + " " + course.catalogNumber,
                scope: savedScope(),
              },
            }),
          );
        else onSave(course);
      }}
    >
      {saved ? <FolderPen size={15} /> : <Bookmark size={15} />}
      {compact ? null : label}
    </Button>
  );
}
