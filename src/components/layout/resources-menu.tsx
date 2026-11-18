"use client";
import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { useDevelopmentAccount } from "@/lib/development/client";
import type { ReactNode } from "react";
import type { Route } from "next";
import {
  BookOpen,
  Activity,
  ChevronDown,
  FileChartColumn,
  LibraryBig,
  MessageSquare,
  Search,
  Check,
  History,
  UserRound,
  ArrowRightLeft,
  Link as LinkIcon,
  TrendingUp,
  Bookmark,
  CalendarDays,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { text, type Locale } from "@/lib/i18n";
import styles from "./resources-menu.module.css";

type Page =
  | "calendar"
  | "planning"
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
  | "popular"
  | "diagnostics";
type NavigationItem = {
  page: Page;
  href: Route;
  Icon: typeof Search;
  title: string;
  detail: string;
};
function NavigationMenu({
  locale,
  page,
  group,
  status,
}: {
  locale: Locale;
  page?: Page;
  group: "explore" | "guides" | "personal" | "saved";
  status?: ReactNode;
}) {
  const { data: session } = authClient.useSession();
  const development = useDevelopmentAccount(session?.user.id);
  const exploring = group === "explore",
    saved = group === "saved",
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
          title: text(locale, "Discover", "发现好课"),
          detail: text(
            locale,
            "Courses, sections and instructors",
            "课程、班次与教师",
          ),
        },
      ]
    : personal || saved
      ? (
          [
            {
              page: "saved" as Page,
              href: "/saved" as Route,
              Icon: Bookmark,
              title: text(locale, "My saved items", "我的收藏"),
              detail: text(
                locale,
                "Courses, sections, teachers and syllabi",
                "课程、班次、教授与大纲",
              ),
            },
            {
              page: "calendar" as Page,
              href: "/calendar" as Route,
              Icon: CalendarDays,
              title: text(locale, "My calendars", "我的日程"),
              detail: text(
                locale,
                "Schedules, assignments and calendar feeds",
                "课程表、作业与日历订阅",
              ),
            },
            {
              page: "planning",
              href: "/planning",
              Icon: BookOpen,
              title: text(locale, "Schedule planning", "学期规划"),
              detail: text(
                locale,
                "Private plans and official curricula",
                "私有规划与官方培养方案",
              ),
            },
            {
              page: "account",
              href: "/account",
              Icon: UserRound,
              title: text(locale, "Account & devices", "账号与设备"),
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
          ] satisfies NavigationItem[]
        ).filter((item) =>
          saved
            ? ["saved", "share", "transfer"].includes(item.page)
            : !["saved", "share", "transfer", "account"].includes(item.page),
        )
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
            page: "diagnostics",
            href: "/diagnostics",
            Icon: Activity,
            title: text(locale, "Browser diagnostics", "浏览器诊断"),
            detail: text(
              locale,
              "Device checks and report preview",
              "设备检测与报告预览",
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
  const selected =
    items.some((item) => item.page === page) ||
    (personal && page === "account");
  const Icon = saved
    ? Bookmark
    : personal
      ? UserRound
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
          saved
            ? "Saved and sharing"
            : personal
              ? "My account and tools"
              : exploring
                ? "Courses and teachers"
                : "Guides and data",
          saved
            ? "收藏与分享"
            : personal
              ? "账号与个人工具"
              : exploring
                ? "课程与教师"
                : "课程说明与数据方法",
        )}
      >
        <Icon size={15} aria-hidden="true" />
        <span>
          {saved
            ? text(locale, "Saved", "收藏")
            : personal
              ? text(locale, "My space", "我的")
              : exploring
                ? text(
                    locale,
                    page === "updates"
                      ? "Updates"
                      : page === "rmp"
                        ? "Teachers"
                        : page === "popular"
                          ? "Discover"
                          : "Courses",
                    page === "updates"
                      ? "课程更新"
                      : page === "rmp"
                        ? "RMP 教师库"
                        : page === "popular"
                          ? "发现好课"
                          : "课程探索",
                  )
                : text(locale, "Guides & data", "课程说明与数据")}
        </span>
        {personal && development.development && (
          <span className={styles.devBadge}>{text(locale, "DEV", "开发")}</span>
        )}
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
          {personal ? (
            <DropdownMenu.Item asChild>
              <Link
                href="/account"
                className={styles.menuProfile}
                data-telemetry-private
              >
                <UserRound size={19} />
                <span>
                  <b>
                    {session?.user.name ??
                      text(locale, "Your space", "我的空间")}
                  </b>
                  <small>
                    {session
                      ? session.user.email
                      : text(
                          locale,
                          "Sign in to sync your favorites",
                          "登录后同步你的收藏",
                        )}
                  </small>
                </span>
              </Link>
            </DropdownMenu.Item>
          ) : null}
          {items.map((item) => (
            <DropdownMenu.Item asChild key={item.page}>
              <Link
                href={item.href}
                onClick={
                  item.page === "planning"
                    ? (event) => {
                        event.preventDefault();
                        // A full navigation destroys any previously loaded session recorder.
                        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                        window.location.assign("/planning");
                      }
                    : undefined
                }
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
export function SavedMenu({
  locale,
  page,
  count,
}: {
  locale: Locale;
  page?: Page;
  count: number;
}) {
  return (
    <NavigationMenu
      locale={locale}
      page={page}
      group="saved"
      status={<span className="nav-count">{count}</span>}
    />
  );
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
