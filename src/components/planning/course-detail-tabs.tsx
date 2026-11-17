"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import type { CatalogCourse } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import { usePreferences } from "@/hooks/use-preferences";
import { useSectionAvailability } from "@/hooks/use-section-availability";
import {
  CourseFees,
  CourseIdentityFacts,
} from "@/components/catalog/course-facts";
import SectionsPanel from "@/components/catalog/sections-panel";
import { EnrollmentWatchControl } from "@/components/catalog/enrollment-watch-control";
import { SeatWatchPanel } from "@/components/catalog/seat-watch-panel";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import styles from "./course-detail-tabs.module.css";
const EvaluationPanel = dynamic(
  () => import("@/components/evaluations/evaluation-panel"),
);
const RmpPanel = dynamic(() => import("@/components/rmp/rmp-panel"));
const SyllabusPanel = dynamic(
  () => import("@/components/syllabus/syllabus-panel"),
);

export function CourseDetailTabs({
  course,
  locale,
}: {
  course: CatalogCourse;
  locale: Locale;
}) {
  const [tab, setTab] = useState("sections");
  const preferences = usePreferences();
  const watch = useSectionAvailability(course, {
    visible: true,
    open: tab === "sections",
    focused: true,
    watch: preferences.enrollmentWatch,
    intervalSeconds: preferences.enrollmentWatchInterval,
  });
  const current = watch.course;
  const t = (en: string, zh: string) => text(locale, en, zh);
  return (
    <section className={styles.root}>
      <CourseIdentityFacts course={current} locale={locale} compact />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList
          className={styles.tabs}
          aria-label={t("Course information", "课程信息")}
        >
          <TabsTrigger value="sections">{t("Sections", "班次")}</TabsTrigger>
          <TabsTrigger value="ratings">
            {t("OSU ratings", "官方评价")}
          </TabsTrigger>
          <TabsTrigger value="rmp">RMP</TabsTrigger>
          <TabsTrigger value="syllabus">{t("Syllabus", "大纲")}</TabsTrigger>
        </TabsList>
        <TabsContent value="sections">
          <CourseFees course={current} locale={locale} compact />
          <div className={styles.attributes}>
            {current.attributes.map((a) => (
              <span key={a}>{a}</span>
            ))}
          </div>
          <EnrollmentWatchControl
            enabled={preferences.enrollmentWatch}
            intervalSeconds={preferences.enrollmentWatchInterval}
            locale={locale}
            onEnabledChange={preferences.setEnrollmentWatch}
            onIntervalChange={preferences.setEnrollmentWatchInterval}
          />
          <SeatWatchPanel
            course={current}
            locale={locale}
            selected={watch.selected}
            onSelect={watch.select}
            running={watch.running}
            onStart={watch.start}
            onStop={watch.stop}
            countdown={watch.countdown}
            intervalSeconds={watch.intervalSeconds}
            enabled={preferences.enrollmentWatch}
          />
          <SectionsPanel
            course={current}
            locale={locale}
            watch={preferences.enrollmentWatch}
            selected={watch.selected}
            onSelect={watch.select}
            onRefresh={() => void watch.refresh()}
            refreshing={watch.loading}
            onRefreshSection={(number) => void watch.refreshSection(number)}
          />
        </TabsContent>
        <TabsContent value="ratings">
          <EvaluationPanel
            summary={current.evaluation}
            locale={locale}
            subject={current.subject}
          />
        </TabsContent>
        <TabsContent value="rmp">
          <RmpPanel course={current} locale={locale} />
        </TabsContent>
        <TabsContent value="syllabus">
          <SyllabusPanel course={current} locale={locale} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
