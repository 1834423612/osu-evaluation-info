"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { usePreferences } from "@/hooks/use-preferences";
import {
  planningScope,
  subscribePlanningScope,
} from "@/lib/planning/client-sync";
import { usePlanningWorkspace } from "@/components/planning/use-planning-workspace";
import { calendarSchema, type UserCalendar } from "@/lib/calendar/model";
import { browserUuid } from "@/lib/uuid";
import { linkCapability } from "@/lib/saved/share-links";
import { CalendarPreview } from "./calendar-preview";
import { CalendarWeek } from "./calendar-week";
import styles from "./calendar.module.css";
const shift = (date: string, days: number) =>
  new Date(Date.parse(date + "T12:00:00Z") + days * 86400000)
    .toISOString()
    .slice(0, 10);
const monday = (value: string) => {
  const date = new Date(value + "T12:00:00Z");
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
};
export function SharedCalendar() {
  const { locale } = usePreferences(),
    t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [week, setWeek] = useState(() =>
    monday(new Date().toISOString().slice(0, 10)),
  );
  const account = useSyncExternalStore(
      subscribePlanningScope,
      planningScope,
      () => null,
    ),
    { plan, setPlan, ready, persist } = usePlanningWorkspace(account);
  const [data, setData] = useState<{
      calendars: UserCalendar[];
      author: { nickname?: string };
    } | null>(null),
    [message, setMessage] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    const c = new AbortController(),
      url = new URL(location.href),
      id = url.searchParams.get("id"),
      token = id ? linkCapability("calendar", id) : undefined;
    if (!token || !id) {
      queueMicrotask(() => setMessage(t("Calendar unavailable", "日历不可用")));
      return;
    }
    fetch("/api/calendar/public?" + new URLSearchParams({ id, key: token }), {
      signal: c.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((body) => {
        if (c.signal.aborted) return;
        const calendars = body.calendars.map((calendar: unknown) =>
          calendarSchema.parse({
            ...(calendar as object),
            kind: "personal",
            updatedAt: new Date().toISOString(),
          }),
        );
        setData({ ...body, calendars });
        const first = calendars
          .flatMap((calendar: UserCalendar) => calendar.events)
          .sort(
            (
              a: UserCalendar["events"][number],
              b: UserCalendar["events"][number],
            ) => a.start.localeCompare(b.start),
          )[0];
        if (first) setWeek(monday(first.start.slice(0, 10)));
        setSelected(calendars.map((calendar: UserCalendar) => calendar.id));
      })
      .catch(() => {
        if (!c.signal.aborted)
          setMessage(
            t("Calendar unavailable or expired", "日历不可用或已过期"),
          );
      });
    return () => c.abort();
    // The capability belongs to this page URL. Locale changes do not repeat requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <AppHeader />
      <main
        className={`${styles.root} rr-block`}
        data-telemetry-private
        data-analytics-area="calendar_shared"
      >
        <header className={styles.top}>
          <div>
            <h1>{t("Shared calendars", "分享的日历")}</h1>
            {data?.author.nickname && (
              <p>
                {t("Shared by", "分享者")} {data.author.nickname}
              </p>
            )}
          </div>
          <button
            disabled={!ready || !selected.length || !data}
            onClick={async () => {
              if (!data) return;
              if (
                (plan.schedule.calendars?.length ?? 0) + selected.length >
                40
              ) {
                setMessage(
                  t(
                    "The calendar limit is 40. Remove an unused calendar before copying.",
                    "最多保存 40 个日历，请先移除不用的日历。",
                  ),
                );
                return;
              }
              const copies = data.calendars
                .filter((calendar) => selected.includes(calendar.id))
                .map((calendar) => ({
                  ...calendar,
                  id: browserUuid(),
                  updatedAt: new Date().toISOString(),
                }));
              setPlan((plan) => ({
                ...plan,
                schedule: {
                  ...plan.schedule,
                  calendars: [...(plan.schedule.calendars ?? []), ...copies],
                },
              }));
              if (await persist())
                setMessage(t("Calendars copied", "已复制日历"));
              else setMessage(t("Storage unavailable", "存储暂不可用"));
            }}
          >
            {t("Copy selected calendars", "复制选中的日历")}
          </button>
        </header>
        {!account && (
          <p>
            {t(
              "Sign in to sync your calendars across devices.",
              "登录后可在不同设备间同步日历。",
            )}{" "}
            <Link href="/account">{t("Account", "登录 / 注册")}</Link>
          </p>
        )}
        <p role="status">{message}</p>
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            {data?.calendars.map((calendar) => (
              <section className={styles.calendar} key={calendar.id}>
                <button
                  role="checkbox"
                  aria-checked={selected.includes(calendar.id)}
                  onClick={() =>
                    setSelected(
                      selected.includes(calendar.id)
                        ? selected.filter((id) => id !== calendar.id)
                        : [...selected, calendar.id],
                    )
                  }
                >
                  {selected.includes(calendar.id) ? "✓" : "+"} {calendar.title}
                </button>
                <CalendarPreview events={calendar.events} />
                <p>{calendar.description}</p>
              </section>
            ))}
          </aside>
          <section className={styles.content}>
            <div className={styles.toolbar}>
              <div className={styles.actions}>
                <button onClick={() => setWeek(shift(week, -7))}>
                  {t("Previous week", "上一周")}
                </button>
                <span>{week}</span>
                <button onClick={() => setWeek(shift(week, 7))}>
                  {t("Next week", "下一周")}
                </button>
              </div>
            </div>
            <CalendarWeek
              locale={locale}
              dates={Array.from({ length: 7 }, (_, i) => shift(week, i))}
              events={
                data?.calendars
                  .filter((calendar) => selected.includes(calendar.id))
                  .flatMap((calendar) =>
                    calendar.events.map((event) => ({
                      ...event,
                      id: JSON.stringify([calendar.id, event.id]),
                    })),
                  ) ?? []
              }
            />
          </section>
        </div>
      </main>
      <AppFooter />
    </>
  );
}
