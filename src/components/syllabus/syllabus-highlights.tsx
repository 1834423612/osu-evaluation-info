"use client";

import { useMemo } from "react";
import {
  ArrowDownRight,
  BookOpen,
  CalendarDays,
  ListChecks,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { extractSyllabusSections } from "@/lib/syllabus/content";
import {
  extractSyllabusSchedule,
  syllabusSectionBody,
  scheduleBlockText,
  type ScheduleBlock,
  type SchedulePart,
} from "@/lib/syllabus/insights";
import type { SyllabusDocument } from "@/lib/syllabus/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./syllabus-highlights.module.css";

export function SyllabusHighlights({
  document,
  locale,
  onNavigate,
}: {
  document: SyllabusDocument;
  locale: Locale;
  onNavigate?: (id: string) => void;
}) {
  const highlights = useMemo(
    () =>
      extractSyllabusSections(document)
        .filter((section) =>
          ["grading", "materials", "schedule"].includes(section.category),
        )
        .map((section) => ({
          ...section,
          schedule:
            section.category === "schedule"
              ? extractSyllabusSchedule(section)
              : null,
        })),
    [document],
  );
  if (!highlights.length) return null;
  return (
    <section
      className={styles.highlights}
      aria-label={text(locale, "Syllabus quick reference", "大纲速览")}
    >
      <Tabs defaultValue={highlights[0].id} className={styles.tabs}>
        <div className={styles.heading}>
          <span className={styles.kicker}>
            {text(locale, "AT A GLANCE", "大纲速览")}
          </span>
          <span>
            {text(locale, "From the published syllabus", "来自已发布大纲")}
          </span>
        </div>
        <TabsList
          className={styles.tabList}
          variant="line"
          aria-label={text(locale, "Syllabus highlights", "大纲重点")}
        >
          {highlights.map((section) => (
            <TabsTrigger key={section.id} value={section.id}>
              {section.category === "schedule" ? (
                <CalendarDays size={14} />
              ) : section.category === "grading" ? (
                <ListChecks size={14} />
              ) : (
                <BookOpen size={14} />
              )}{" "}
              {section.category === "schedule"
                ? text(locale, "Weekly plan", "课程安排")
                : section.category === "grading"
                  ? text(locale, "Assessment", "考核方式")
                  : text(locale, "Readings & materials", "教材与阅读")}
            </TabsTrigger>
          ))}
        </TabsList>
        {highlights.map((section) => (
          <TabsContent
            key={section.id}
            value={section.id}
            className={styles.tabContent}
          >
            <div className={styles.content}>
              {section.schedule?.items.length ? (
                <>
                  {section.schedule.note ? (
                    <p className={styles.note}>{section.schedule.note}</p>
                  ) : null}
                  <ol className={styles.timeline}>
                    {section.schedule.items.map((item, index) => (
                      <li key={`${index}-${item.label}`}>
                        <span className={styles.week}>
                          {item.weekStart !== null
                            ? text(
                                locale,
                                `Week ${item.weekStart}${item.weekEnd !== item.weekStart ? `–${item.weekEnd}` : ""}`,
                                `第 ${item.weekStart}${item.weekEnd !== item.weekStart ? `–${item.weekEnd}` : ""} 周`,
                              )
                            : item.label}
                        </span>
                        <div>
                          <span className={styles.dot} />
                          {item.topic ? (
                            item.topic.length > 240 ? (
                              <details className={styles.topicDetails}>
                                <summary>
                                  {item.topic
                                    .slice(0, 140)
                                    .replace(/\s+\S*$/, "")}
                                  …
                                </summary>
                                <p>
                                  <ScheduleText
                                    parts={
                                      item.topicParts ?? [{ text: item.topic }]
                                    }
                                  />
                                </p>
                              </details>
                            ) : (
                              <p>
                                <ScheduleText
                                  parts={
                                    item.topicParts ?? [{ text: item.topic }]
                                  }
                                />
                              </p>
                            )
                          ) : null}
                          <ScheduleBlocks blocks={item.blocks} />
                          {item.sessions.length ? (
                            <div className={styles.sessions}>
                              {item.sessions.map((session, sessionIndex) => {
                                const short =
                                  session.blocks.length === 1 &&
                                  scheduleBlockText(session.blocks[0]).length <=
                                    140;
                                return short ? (
                                  <div
                                    className={styles.session}
                                    key={sessionIndex}
                                  >
                                    <strong>{session.label}</strong>
                                    <ScheduleBlocks blocks={session.blocks} />
                                  </div>
                                ) : (
                                  <details
                                    className={styles.sessionDetails}
                                    key={sessionIndex}
                                  >
                                    <summary>
                                      <strong>{session.label}</strong>
                                      <span>
                                        {text(
                                          locale,
                                          `${session.blocks.length} items`,
                                          `${session.blocks.length} 项`,
                                        )}
                                      </span>
                                    </summary>
                                    <ScheduleBlocks blocks={session.blocks} />
                                  </details>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <div
                  className={styles.sourceBody}
                  dangerouslySetInnerHTML={{
                    __html: syllabusSectionBody(section.html),
                  }}
                />
              )}
            </div>
            {onNavigate ? (
              <button
                className={styles.jump}
                type="button"
                onClick={() => onNavigate(section.id)}
              >
                {text(
                  locale,
                  "View this section in the document",
                  "在正文中查看此章节",
                )}
                <ArrowDownRight size={14} />
              </button>
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}

function ScheduleText({ parts }: { parts: SchedulePart[] }) {
  return parts.map((part, index) =>
    part.href ? (
      <a key={index} href={part.href} target="_blank" rel="noopener noreferrer">
        {part.text}
      </a>
    ) : (
      <span key={index}>
        {part.text
          .split(/(https?:\/\/[^\s<>“”]+)/g)
          .map((piece, pieceIndex) => {
            if (!/^https?:\/\//.test(piece)) return piece;
            const href = piece.replace(/[.,;!?)\]]+$/, "");
            return (
              <span key={pieceIndex}>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  {href}
                </a>
                {piece.slice(href.length)}
              </span>
            );
          })}
      </span>
    ),
  );
}
function ScheduleBlocks({ blocks }: { blocks: ScheduleBlock[] }) {
  if (!blocks?.length) return null;
  return (
    <div className={styles.blocks}>
      {blocks.map((block, index) => (
        <p key={index} data-reading={block.reading}>
          <ScheduleText parts={block.parts} />
        </p>
      ))}
    </div>
  );
}
