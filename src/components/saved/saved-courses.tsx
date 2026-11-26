"use client";
import { FeatureSyncStatus } from "@/components/sync/feature-sync-status";
import { RmpSavedRemove } from "./rmp-saved-remove";

import {
  SavedWorkspace,
  SavedCardFrame,
  useSavedWorkspace,
} from "./saved-workspace";

import Link from "next/link";
import { BookOpen, FileText, GraduationCap, Star, Trash2 } from "lucide-react";
import { useSavedSyllabi } from "@/hooks/use-saved-syllabi";
import { syllabusHasUpdate } from "@/lib/syllabus/saved";
import { SavedSyllabi } from "./saved-syllabi";
import { SavedManager } from "./saved-manager";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { SceneMascot } from "@/components/brand/scene-mascot";
import { EmptyResult } from "@/components/brand/empty-result";
import { CourseCard } from "@/components/catalog/course-card";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
import { MeetingStrip } from "@/components/catalog/meeting-strip";
import {
  usePreferences,
  type SavedSection,
  type SavedInstructor,
} from "@/hooks/use-preferences";
import { useCourseDetails } from "@/hooks/use-course-details";
import { useCourseVisible } from "@/hooks/use-section-availability";
import { CourseIdentityFacts } from "@/components/catalog/course-facts";
import { text, type Locale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CatalogCourse } from "@/lib/catalog/types";
import styles from "./saved-courses.module.css";

type SavedCourseSummary = SavedInstructor["courses"][number];

function relatedCourse(snapshot: SavedCourseSummary): CatalogCourse {
  const [subject = "", catalogNumber = ""] = snapshot.label.split(/\s+/, 2);
  return {
    id: snapshot.id,
    courseId: snapshot.officialCourseId,
    courseIds: snapshot.courseIds,
    subject,
    subjectName: subject,
    catalogNumber,
    title: snapshot.title,
    description: "",
    creditsMin: snapshot.creditsMin ?? 0,
    creditsMax: snapshot.creditsMax ?? snapshot.creditsMin ?? 0,
    campus: "",
    campusCode: snapshot.campusCode ?? snapshot.id.split("-").at(-1) ?? "",
    term: snapshot.term,
    termCode: snapshot.termCode ?? snapshot.id.split("-")[0],
    academicCareer: "",
    attributes: [],
    sections: [],
    sectionsPartial: false,
  };
}

function courseHref(
  snapshot: {
    id: string;
    label: string;
    termCode?: string;
    campusCode?: string;
  },
  focusSection?: string,
) {
  return {
    pathname: "/",
    query: {
      q: snapshot.label,
      term: snapshot.termCode ?? snapshot.id.split("-")[0],
      campus: (
        snapshot.campusCode ??
        snapshot.id.split("-").at(-1) ??
        "col"
      ).toLowerCase(),
      course: snapshot.id,
      detailTab: "sections",
      ...(focusSection ? { focusSection } : {}),
    },
  };
}

function SavedSectionFacts({
  item,
  locale,
}: {
  item: SavedSection;
  locale: Locale;
}) {
  return (
    <SavedCourseFacts
      snapshot={{
        id: item.courseId,
        label: item.courseLabel,
        title: item.courseTitle,
        term: item.term,
        termCode: item.termCode,
        campusCode: item.campusCode,
        officialCourseId: item.officialCourseId || item.section.courseId,
        creditsMin: item.creditsMin,
        creditsMax: item.creditsMax,
      }}
      locale={locale}
    />
  );
}

function SavedCourseFacts({
  snapshot,
  locale,
}: {
  snapshot: SavedCourseSummary;
  locale: Locale;
}) {
  const { ref, visible } = useCourseVisible();
  const metadata = relatedCourse(snapshot);
  const { course, source, error } = useCourseDetails(
    metadata,
    visible && (!metadata.courseId || snapshot.creditsMin === undefined),
  );
  const resolved = source && course ? course : null;
  return (
    <section ref={ref}>
      {resolved || (metadata.courseId && snapshot.creditsMin !== undefined) ? (
        <CourseIdentityFacts course={resolved ?? metadata} locale={locale} />
      ) : (
        <small className={styles.muted}>
          {text(
            locale,
            error
              ? "Course code and credits unavailable"
              : "Loading course code and credits…",
            error ? "课程代码与学分暂不可用" : "正在读取课程代码与学分…",
          )}
        </small>
      )}
    </section>
  );
}

export function SavedCourses() {
  return (
    <SavedWorkspace>
      <SavedCoursesBody />
    </SavedWorkspace>
  );
}
function SavedCoursesBody() {
  const {
    locale,
    saved: allSaved,
    savedSections: allSections,
    savedInstructors: allInstructors,
    toggleSaved,
    toggleSection,
    toggleInstructor,
    enrollmentWatch,
    enrollmentWatchInterval,
    setEnrollmentWatch,
    setEnrollmentWatchInterval,
  } = usePreferences();
  const { savedSyllabi } = useSavedSyllabi();
  const { collections, active, kind, setKind, compact, selecting } =
    useSavedWorkspace();
  const group = collections.find((x) => x.id === active);
  const visible = (key: string) => !group || group.members.includes(key);
  const saved = allSaved.filter((x) => visible("course:" + x.id));
  const savedSections = allSections.filter((x) => visible("section:" + x.id));
  const savedInstructors = allInstructors.filter((x) =>
    visible("instructor:" + x.id),
  );
  const syllabusUpdates = savedSyllabi.filter(syllabusHasUpdate).length;
  const visibleSyllabi = savedSyllabi.filter((x) =>
    visible("syllabus:" + x.id),
  );
  const hasSaved =
    allSaved.length +
      allSections.length +
      allInstructors.length +
      savedSyllabi.length >
    0;
  const savedCount =
    saved.length +
    savedSections.length +
    savedInstructors.length +
    visibleSyllabi.length;
  return (
    <>
      <AppHeader active="saved" />
      <main className="saved-shell" data-telemetry-private>
        <div className="page-heading">
          <div>
            <h1>{text(locale, "Saved items", "我的收藏")}</h1>
            <p>
              {text(
                locale,
                `${savedCount} saved items`,
                `${savedCount} 个收藏`,
              )}
            </p>
          </div>
          <FeatureSyncStatus feature="favorites" locale={locale} />
        </div>
        <Tabs
          value={
            kind !== "all"
              ? ({
                  course: "courses",
                  section: "sections",
                  instructor: "instructors",
                  syllabus: "syllabi",
                }[kind] ?? "courses")
              : saved.length
                ? "courses"
                : savedSections.length
                  ? "sections"
                  : savedInstructors.length
                    ? "instructors"
                    : "syllabi"
          }
          onValueChange={(value) =>
            setKind(
              (
                {
                  courses: "course",
                  sections: "section",
                  instructors: "instructor",
                  syllabi: "syllabus",
                } as Record<string, string>
              )[value],
            )
          }
          className={styles.tabs}
          data-compact={(compact && selecting) || undefined}
        >
          {hasSaved ? (
            <TabsList
              className={styles.tabList}
              aria-label={text(locale, "Saved categories", "收藏分类")}
            >
              <TabsTrigger value="courses">
                <BookOpen size={14} />
                {text(locale, "Courses", "课程")}
                <span>{saved.length}</span>
              </TabsTrigger>
              <TabsTrigger value="sections">
                <GraduationCap size={14} />
                {text(locale, "Sections", "班次")}
                <span>{savedSections.length}</span>
              </TabsTrigger>
              <TabsTrigger value="instructors">
                <Star size={14} />
                {text(locale, "Instructors", "教师")}
                <span>{savedInstructors.length}</span>
              </TabsTrigger>
              <TabsTrigger value="syllabi">
                <FileText size={14} />
                {text(locale, "Syllabi", "大纲")}
                <span>{visibleSyllabi.length}</span>
                {syllabusUpdates ? (
                  <b className={styles.syllabusUpdates}>
                    {text(
                      locale,
                      `${syllabusUpdates} source updates`,
                      `${syllabusUpdates} 份来源更新`,
                    )}
                  </b>
                ) : null}
              </TabsTrigger>
            </TabsList>
          ) : null}
          <SavedManager locale={locale} />
          {hasSaved ? (
            <>
              <TabsContent value="syllabi" className={styles.tabContent}>
                <SavedSyllabi locale={locale} />
              </TabsContent>
              <TabsContent value="courses" className={styles.tabContent}>
                {saved.length ? (
                  <div className="course-list">
                    {saved.map((course) => (
                      <SavedCardFrame
                        key={course.id}
                        id={"course:" + course.id}
                        title={course.subject + " " + course.catalogNumber}
                        locale={locale}
                      >
                        <CourseCard
                          key={course.id}
                          course={course}
                          locale={locale}
                          saved
                          refreshPreview
                          enrollmentWatch={enrollmentWatch}
                          enrollmentWatchInterval={enrollmentWatchInterval}
                          onEnrollmentWatchChange={setEnrollmentWatch}
                          onEnrollmentWatchIntervalChange={
                            setEnrollmentWatchInterval
                          }
                          onSave={toggleSaved}
                        />
                      </SavedCardFrame>
                    ))}
                  </div>
                ) : (
                  <EmptyResult>
                    {text(locale, "No saved courses.", "暂无收藏课程。")}
                  </EmptyResult>
                )}
              </TabsContent>
              <TabsContent value="sections" className={styles.tabContent}>
                {savedSections.length ? (
                  <div className={styles.list}>
                    {savedSections.map((item) => (
                      <SavedCardFrame
                        key={item.id}
                        id={"section:" + item.id}
                        title={item.courseLabel}
                        locale={locale}
                      >
                        <article className={styles.item}>
                          <div className={styles.itemHeading}>
                            <div className={styles.itemIdentity}>
                              <Link
                                className={styles.sectionDestination}
                                href={courseHref(
                                  {
                                    id: item.courseId,
                                    label: item.courseLabel,
                                    termCode: item.termCode,
                                    campusCode: item.campusCode,
                                  },
                                  item.section.classNumber,
                                )}
                              >
                                <span className={styles.courseCode}>
                                  {item.courseLabel}
                                </span>
                                <strong>
                                  {item.section.component}{" "}
                                  {item.section.section}
                                </strong>
                                <span className={styles.muted}>
                                  #{item.section.classNumber} · {item.term} ·{" "}
                                  {item.campus}
                                </span>
                              </Link>
                              <SavedSectionFacts item={item} locale={locale} />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={text(
                                locale,
                                `Remove ${item.courseLabel} section ${item.section.section}`,
                                `取消收藏 ${item.courseLabel} ${item.section.section} 班次`,
                              )}
                              title={text(
                                locale,
                                "Remove saved section",
                                "取消收藏班次",
                              )}
                              onClick={() =>
                                toggleSection(
                                  relatedCourse({
                                    id: item.courseId,
                                    label: item.courseLabel,
                                    title: item.courseTitle,
                                    term: item.term,
                                  }),
                                  item.section,
                                )
                              }
                            >
                              <Trash2 />
                            </Button>
                          </div>
                          <div className={styles.relatedTitle}>
                            {item.courseTitle}
                          </div>
                          {item.section.instructors.length ? (
                            <div className={styles.people}>
                              {item.section.instructors.map((instructor) => (
                                <div key={instructor.email ?? instructor.name}>
                                  <InstructorDirectoryIdentity
                                    name={instructor.name}
                                    email={instructor.email}
                                    locale={locale}
                                    size={24}
                                    subject={
                                      item.courseLabel.split(/\s+/, 1)[0]
                                    }
                                  />
                                </div>
                              ))}
                            </div>
                          ) : null}
                          <div className={styles.meetings}>
                            {item.section.meetings.length ? (
                              item.section.meetings.map((meeting, index) => (
                                <MeetingStrip
                                  key={index}
                                  meeting={meeting}
                                  instructionMode={item.section.instructionMode}
                                  locale={locale}
                                />
                              ))
                            ) : (
                              <MeetingStrip
                                instructionMode={item.section.instructionMode}
                                locale={locale}
                              />
                            )}
                          </div>
                        </article>
                      </SavedCardFrame>
                    ))}
                  </div>
                ) : (
                  <EmptyResult>
                    {text(locale, "No saved sections.", "暂无收藏班次。")}
                  </EmptyResult>
                )}
              </TabsContent>
              <TabsContent value="instructors" className={styles.tabContent}>
                {savedInstructors.length ? (
                  <div className={styles.list}>
                    {savedInstructors.map((instructor) => (
                      <SavedCardFrame
                        key={instructor.id}
                        id={"instructor:" + instructor.id}
                        title={instructor.name}
                        locale={locale}
                      >
                        <article className={styles.item}>
                          <div className={styles.instructorHeading}>
                            <div className={styles.peopleIdentity}>
                              {instructor.rmp ? (
                                <div className={styles.rmpIdentity}>
                                  <Link href={`/rmp/${instructor.rmp.id}`}>
                                    <strong>{instructor.name}</strong>
                                  </Link>
                                  <span>
                                    RMP #{instructor.rmp.id} ·{" "}
                                    {instructor.rmp.username
                                      ? text(
                                          locale,
                                          "Identity verified",
                                          "身份已确认",
                                        )
                                      : text(
                                          locale,
                                          "Identity unconfirmed",
                                          "身份待确认",
                                        )}
                                  </span>
                                  <small>
                                    {instructor.rmp.department} · RMP{" "}
                                    {instructor.rmp.quality ?? "–"}/5 ·{" "}
                                    {instructor.rmp.reviewCount}{" "}
                                    {text(locale, "reviews", "条评价")}
                                  </small>
                                </div>
                              ) : (
                                <InstructorDirectoryIdentity
                                  name={instructor.name}
                                  email={instructor.email}
                                  locale={locale}
                                  size={38}
                                  subject={
                                    instructor.courses[0]?.label.split(
                                      /\s+/,
                                      1,
                                    )[0]
                                  }
                                />
                              )}
                            </div>
                            {instructor.rmp ? (
                              <RmpSavedRemove instructor={instructor} />
                            ) : (
                              <span className={styles.relationCount}>
                                {instructor.courses.length}{" "}
                                {text(locale, "courses", "门课程")}
                              </span>
                            )}
                          </div>
                          <div className={styles.relations}>
                            {instructor.courses.map((course) => (
                              <div className={styles.relation} key={course.id}>
                                <div className={styles.relationInfo}>
                                  <Link href={courseHref(course)}>
                                    <span className={styles.courseCode}>
                                      {course.label}
                                    </span>
                                    <span>{course.title}</span>
                                    <small>{course.term}</small>
                                  </Link>
                                  <SavedCourseFacts
                                    snapshot={course}
                                    locale={locale}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label={text(
                                    locale,
                                    `Unsave ${instructor.name} for ${course.label}`,
                                    `取消收藏 ${instructor.name} 在 ${course.label} 的关系`,
                                  )}
                                  title={text(
                                    locale,
                                    "Remove instructor course relation",
                                    "取消教师课程关联收藏",
                                  )}
                                  onClick={() =>
                                    toggleInstructor(
                                      relatedCourse(course),
                                      instructor,
                                    )
                                  }
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </article>
                      </SavedCardFrame>
                    ))}
                  </div>
                ) : (
                  <EmptyResult>
                    {text(locale, "No saved instructors.", "暂无收藏教师。")}
                  </EmptyResult>
                )}
              </TabsContent>
            </>
          ) : (
            <div className="empty-results">
              <SceneMascot scene="no-results" size={136} />
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
        </Tabs>
      </main>
      <AppFooter />
    </>
  );
}
