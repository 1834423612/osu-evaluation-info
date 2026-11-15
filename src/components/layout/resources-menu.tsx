"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Route } from "next";
import {
  BookOpen,
  ChevronDown,
  FileChartColumn,
  LibraryBig,
  MessageSquare,
  Search,
  Check,
  History,
  Bookmark,
  UserRound,
  ArrowRightLeft,
  Link as LinkIcon,
  TrendingUp,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { text, type Locale } from "@/lib/i18n";
import styles from "./resources-menu.module.css";

type Page =
  | "explore"
  | "saved"
  | "methodology"
  | "reference"
  | "rmp"
  | "updates"
  | "history"
  | "account"
  | "transfer"
  | "share"
  | "popular";
function NavigationMenu({
  locale,
  page,
  group,
  status,
}: {
  locale: Locale;
  page?: Page;
  group: "explore" | "guides" | "personal";
  status?: ReactNode;
}) {
  const exploring = group === "explore",
    personal = group === "personal",
    primary = group !== "guides";
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
        {
          page: "updates",
          href: "/updates",
          Icon: History,
          title: text(locale, "Course updates", "课程更新"),
          detail: text(
            locale,
            "New offerings and catalog changes",
            "新增开课与目录变化",
          ),
        },
        {
          page: "popular",
          href: "/popular",
          Icon: TrendingUp,
          title: text(locale, "Most saved", "热门收藏"),
          detail: text(
            locale,
            "Courses, sections and instructors",
            "课程、班次与教师",
          ),
        },
      ]
    : personal
      ? [
          {
            page: "saved",
            href: "/saved",
            Icon: Bookmark,
            title: text(locale, "Saved items", "收藏"),
            detail: text(
              locale,
              "Courses, sections, instructors and syllabi",
              "课程、班次、教师与大纲",
            ),
          },
          {
            page: "account",
            href: "/account",
            Icon: UserRound,
            title: text(locale, "Account & sync", "账号与同步"),
            detail: text(
              locale,
              "Sign in, devices and cloud favorites",
              "登录、设备与云端收藏",
            ),
          },
          {
            page: "history",
            href: "/history",
            Icon: History,
            title: text(locale, "Recent activity", "最近记录"),
            detail: text(
              locale,
              "Searches and viewed courses",
              "搜索与浏览过的课程",
            ),
          },
          {
            page: "share",
            href: "/share",
            Icon: LinkIcon,
            title: text(locale, "Open a share code", "打开分享码"),
            detail: text(
              locale,
              "Preview and save a shared collection",
              "预览并转存收藏清单",
            ),
          },
          {
            page: "transfer",
            href: "/transfer",
            Icon: ArrowRightLeft,
            title: text(locale, "Temporary transfer", "临时转存"),
            detail: text(
              locale,
              "Send, receive and manage device transfers",
              "发送、接收与管理设备转存",
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
  const Icon = personal
    ? (items.find((x) => x.page === page)?.Icon ?? Bookmark)
    : exploring
      ? page === "rmp"
        ? MessageSquare
        : page === "updates"
          ? History
          : Search
      : BookOpen;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={`${styles.trigger} ${primary ? styles.explore : ""}`}
        data-active={selected}
        data-nav-group={group}
        aria-current={selected ? "true" : undefined}
        aria-label={text(
          locale,
          personal
            ? "Saved items and account"
            : exploring
              ? "Courses and teachers"
              : "Guides and data",
          personal
            ? "收藏与账号"
            : exploring
              ? "课程与教师"
              : "课程说明与数据方法",
        )}
      >
        <Icon size={15} aria-hidden="true" />
        <span>
          {personal
            ? text(
                locale,
                page === "account"
                  ? "Account"
                  : page === "transfer"
                    ? "Transfer"
                    : page === "history"
                      ? "Recent"
                      : page === "share"
                        ? "Shared"
                        : "Saved",
                page === "account"
                  ? "账号"
                  : page === "transfer"
                    ? "转存"
                    : page === "history"
                      ? "最近"
                      : page === "share"
                        ? "分享"
                        : "收藏",
              )
            : exploring
              ? text(
                  locale,
                  page === "updates"
                    ? "Updates"
                    : page === "rmp"
                      ? "Teachers"
                      : page === "popular"
                        ? "Most saved"
                        : "Courses",
                  page === "updates"
                    ? "课程更新"
                    : page === "rmp"
                      ? "RMP 教师库"
                      : page === "popular"
                        ? "热门收藏"
                        : "课程探索",
                )
              : text(locale, "Guides & data", "课程说明与数据")}
        </span>
        {status}
        <ChevronDown size={12} aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.menu}
          align={primary ? "start" : "end"}
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

export function PersonalMenu({
  locale,
  page,
  status,
}: {
  locale: Locale;
  page?: Page;
  status?: ReactNode;
}) {
  return (
    <NavigationMenu
      locale={locale}
      page={page}
      group="personal"
      status={status}
    />
  );
}
