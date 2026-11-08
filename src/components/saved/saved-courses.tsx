"use client";
import Link from "next/link";
import { BookOpen, GraduationCap, HardDrive, Star, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { BrandMascot } from "@/components/brand/brand-mascot";
import { CourseCard } from "@/components/catalog/course-card";
import { InstructorDirectoryIdentity } from "@/components/people/people-directory-lookup";
import { MeetingStrip } from "@/components/catalog/meeting-strip";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { CatalogCourse } from "@/lib/catalog/types";
import styles from "./saved-courses.module.css";

function relatedCourse(snapshot: {
  id: string;
  label: string;
  title: string;
  term: string;
  termCode?: string;
  campusCode?: string;
}): CatalogCourse {
  const [subject = "", catalogNumber = ""] = snapshot.label.split(/\s+/, 2);
  return {
    id: snapshot.id,
    subject,
    subjectName: subject,
    catalogNumber,
    title: snapshot.title,
    description: "",
    creditsMin: 0,
    creditsMax: 0,
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

export function SavedCourses() {
  const {
    locale,
    saved,
    savedSections,
    savedInstructors,
    toggleSaved,
    toggleSection,
    toggleInstructor,
    enrollmentWatch,
    enrollmentWatchInterval,
    setEnrollmentWatch,
    setEnrollmentWatchInterval,
  } = usePreferences();
  const savedCount =
    saved.length + savedSections.length + savedInstructors.length;
  return (
    <>
      <AppHeader active="saved" />
      <main className="saved-shell">
        <div className="page-heading">
          <div>
            <h1>{text(locale, "Saved items", "我的收藏")}</h1>
            <p>
              {text(
                locale,
                `${savedCount} saved items · Kept on this device`,
                `${savedCount} 个收藏 · 保存在当前设备`,
              )}
            </p>
          </div>
          <span className="saved-note">
            <HardDrive size={13} />
            {text(locale, "Saved on this device", "保存在当前设备")}
          </span>
        </div>
        {savedCount ? (
          <Tabs
            defaultValue={
              saved.length
                ? "courses"
                : savedSections.length
                  ? "sections"
                  : "instructors"
            }
            className={styles.tabs}
          >
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
            </TabsList>
            <TabsContent value="courses" className={styles.tabContent}>
              {saved.length ? (
                <div className="course-list">
                  {saved.map((course) => (
                    <CourseCard
                      key={course.id}
                      course={course}
                      locale={locale}
                      saved
                      enrollmentWatch={enrollmentWatch}
                      enrollmentWatchInterval={enrollmentWatchInterval}
                      onEnrollmentWatchChange={setEnrollmentWatch}
                      onEnrollmentWatchIntervalChange={
                        setEnrollmentWatchInterval
                      }
                      onSave={toggleSaved}
                    />
                  ))}
                </div>
              ) : (
                <p className={styles.emptyCategory}>
                  {text(locale, "No saved courses.", "暂无收藏课程。")}
                </p>
              )}
            </TabsContent>
            <TabsContent value="sections" className={styles.tabContent}>
              {savedSections.length ? (
                <div className={styles.list}>
                  {savedSections.map((item) => (
                    <article className={styles.item} key={item.id}>
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
                              {item.section.component} {item.section.section}
                            </strong>
                            <span className={styles.muted}>
                              #{item.section.classNumber} · {item.term} ·{" "}
                              {item.campus}
                            </span>
                          </Link>
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
                                subject={item.courseLabel.split(/\s+/, 1)[0]}
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
                  ))}
                </div>
              ) : (
                <p className={styles.emptyCategory}>
                  {text(locale, "No saved sections.", "暂无收藏班次。")}
                </p>
              )}
            </TabsContent>
            <TabsContent value="instructors" className={styles.tabContent}>
              {savedInstructors.length ? (
                <div className={styles.list}>
                  {savedInstructors.map((instructor) => (
                    <article className={styles.item} key={instructor.id}>
                      <div className={styles.instructorHeading}>
                        <div className={styles.peopleIdentity}>
                          <InstructorDirectoryIdentity
                            name={instructor.name}
                            email={instructor.email}
                            locale={locale}
                            size={38}
                            subject={
                              instructor.courses[0]?.label.split(/\s+/, 1)[0]
                            }
                          />
                        </div>
                        <span className={styles.relationCount}>
                          {instructor.courses.length}{" "}
                          {text(locale, "courses", "门课程")}
                        </span>
                      </div>
                      <div className={styles.relations}>
                        {instructor.courses.map((course) => (
                          <div className={styles.relation} key={course.id}>
                            <Link href={courseHref(course)}>
                              <span className={styles.courseCode}>
                                {course.label}
                              </span>
                              <span>{course.title}</span>
                              <small>{course.term}</small>
                            </Link>
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
                  ))}
                </div>
              ) : (
                <p className={styles.emptyCategory}>
                  {text(locale, "No saved instructors.", "暂无收藏教师。")}
                </p>
              )}
            </TabsContent>
          </Tabs>
        ) : (
          <div className="empty-results">
            <BrandMascot expression="salute" size={136} />
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
      <AppFooter />
    </>
  );
}
