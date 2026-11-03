"use client";
import Link from "next/link";
import { Bookmark, HardDrive } from "lucide-react";
import { AppHeader } from "./app-header";
import { CourseCard } from "./course-card";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
export function SavedCourses() {
  const { locale, saved, toggleSaved } = usePreferences();
  return (
    <>
      <AppHeader active="saved" />
      <main className="saved-shell">
        <div className="page-heading">
          <div>
            <h1>{text(locale, "Saved courses", "收藏课程")}</h1>
            <p>
              {text(
                locale,
                `${saved.length} saved courses · Kept on this device`,
                `${saved.length} 门已收藏课程 · 保存在当前设备`,
              )}
            </p>
          </div>
          <span className="saved-note">
            <HardDrive size={13} />
            {text(locale, "Saved course snapshots", "收藏时的课程快照")}
          </span>
        </div>
        {saved.length ? (
          <div className="course-list">
            {saved.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                locale={locale}
                saved
                onSave={toggleSaved}
              />
            ))}
          </div>
        ) : (
          <div className="empty-results">
            <Bookmark size={30} />
            <h2>
              {text(locale, "Keep the courses you like", "收藏感兴趣的课程")}
            </h2>
            <p>
              {text(
                locale,
                "Use the bookmark on any course to add it here.",
                "点击课程卡片上的书签，即可添加到这里。",
              )}
            </p>
            <Button asChild>
              <Link href="/">
                {text(locale, "Explore courses", "探索课程")}
              </Link>
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
