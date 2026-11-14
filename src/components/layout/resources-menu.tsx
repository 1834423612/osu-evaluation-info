"use client";
import Link from "next/link";
import type { Route } from "next";
import {
  BookOpen,
  ChevronDown,
  FileChartColumn,
  LibraryBig,
  MessageSquare,
  Search,
  Check,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { text, type Locale } from "@/lib/i18n";
import styles from "./resources-menu.module.css";

type Page = "explore" | "saved" | "methodology" | "reference" | "rmp";
function NavigationMenu({
  locale,
  page,
  group,
}: {
  locale: Locale;
  page?: Page;
  group: "explore" | "guides";
}) {
  const exploring = group === "explore";
  const items: {
    page: Page;
    href: Route;
    Icon: typeof Search;
    title: string;
    detail: string;
  }[] = exploring
    ? [
        {
          page: "explore",
          href: "/",
          Icon: Search,
          title: text(locale, "Course search", "课程搜索"),
          detail: text(
            locale,
            "Classes, syllabi and ratings",
            "开课、教学大纲与评分",
          ),
        },
        {
          page: "rmp",
          href: "/rmp",
          Icon: MessageSquare,
          title: text(locale, "RMP faculty library", "RMP 教师库"),
          detail: text(
            locale,
            "Teachers and course reviews",
            "教师档案与课程评价",
          ),
        },
      ]
    : [
        {
          page: "reference",
          href: "/reference",
          Icon: LibraryBig,
          title: text(locale, "OSU field guide", "OSU 课程说明"),
          detail: text(
            locale,
            "Class formats and rating scales",
            "授课方式、班次与评价量表",
          ),
        },
        {
          page: "methodology",
          href: "/methodology",
          Icon: FileChartColumn,
          title: text(locale, "Behind the data", "数据与方法"),
          detail: text(
            locale,
            "Sources, matching and calculations",
            "数据来源、匹配与计算",
          ),
        },
      ];
  const selected = items.some((item) => item.page === page);
  const Icon = exploring ? (page === "rmp" ? MessageSquare : Search) : BookOpen;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`${styles.trigger} ${exploring ? styles.explore : ""}`}
        data-active={selected}
        data-nav-group={group}
        aria-current={selected ? "true" : undefined}
        aria-label={text(
          locale,
          exploring ? "Courses and teachers" : "Guides and data",
          exploring ? "课程与教师" : "课程说明与数据方法",
        )}
      >
        <Icon size={15} aria-hidden="true" />
        <span>
          {exploring
            ? page === "rmp"
              ? text(locale, "Teachers", "RMP 教师库")
              : text(locale, "Courses", "课程探索")
            : text(locale, "Guides & data", "课程说明与数据")}
        </span>
        <ChevronDown size={12} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.menu}
          align={exploring ? "start" : "end"}
          sideOffset={8}
          collisionPadding={10}
        >
          {items.map((item) => (
            <DropdownMenu.Item asChild key={item.page}>
              <Link
                href={item.href}
                aria-current={item.page === page ? "page" : undefined}
                data-nav-page={item.page}
              >
                <item.Icon size={17} aria-hidden="true" />
                <span>
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </span>
                {item.page === page ? (
                  <Check
                    size={14}
                    className={styles.check}
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
export function ExploreMenu({ locale, page }: { locale: Locale; page?: Page }) {
  return <NavigationMenu locale={locale} page={page} group="explore" />;
}
export function ResourcesMenu({
  locale,
  page,
}: {
  locale: Locale;
  page?: Page;
}) {
  return <NavigationMenu locale={locale} page={page} group="guides" />;
}
