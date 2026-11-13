"use client";
import Link from "next/link";
import {
  BookOpen,
  ChevronDown,
  FileChartColumn,
  LibraryBig,
  MessageSquare,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { text, type Locale } from "@/lib/i18n";
import styles from "./resources-menu.module.css";
export function ResourcesMenu({
  locale,
  active,
}: {
  locale: Locale;
  active: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className={styles.trigger}
        data-active={active}
        aria-label={text(locale, "Guides and data", "课程说明与数据方法")}
      >
        <BookOpen size={15} />
        <span>{text(locale, "Guides & data", "课程说明与数据")}</span>
        <ChevronDown size={12} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={styles.menu}
          align="end"
          sideOffset={10}
          collisionPadding={10}
        >
          <DropdownMenu.Item asChild>
            <Link href="/rmp">
              <MessageSquare size={17} />
              <span>
                <b>{text(locale, "RMP faculty library", "RMP 教师库")}</b>
                <small>
                  {text(
                    locale,
                    "All profiles and course reviews",
                    "全部档案与课程评价",
                  )}
                </small>
              </span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/reference">
              <LibraryBig size={17} />
              <span>
                <b>{text(locale, "OSU field guide", "OSU 课程说明")}</b>
                <small>
                  {text(
                    locale,
                    "Class formats, SEI, SSLE and scores",
                    "授课方式、班次、量表与评分",
                  )}
                </small>
              </span>
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link href="/methodology">
              <FileChartColumn size={17} />
              <span>
                <b>{text(locale, "Behind the data", "数据与方法")}</b>
                <small>
                  {text(
                    locale,
                    "Sources, matching and calculations",
                    "数据来源、身份匹配与计算流程",
                  )}
                </small>
              </span>
            </Link>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
