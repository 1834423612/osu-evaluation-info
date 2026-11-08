import { LoaderCircle, RefreshCw } from "lucide-react";
import type { CatalogSection } from "@/lib/catalog/types";
import { text, type Locale } from "@/lib/i18n";
import styles from "./section-availability.module.css";

export function SectionAvailabilityView({
  section,
  locale,
  onRefresh,
}: {
  section: CatalogSection;
  locale: Locale;
  onRefresh?: () => void;
}) {
  const data = section.availability;
  const busy =
    section.availabilityState === "queued" ||
    section.availabilityState === "loading";
  const failed = section.availabilityState === "error";
  const waiting = data && /wait/i.test(data.enrollmentStatus);
  const open = data?.isOpen === true;
  const closed =
    data?.isOpen === false || /closed|full/i.test(data?.enrollmentStatus ?? "");
  const kind = waiting
    ? "waitlist"
    : open
      ? "open"
      : closed
        ? "closed"
        : "unknown";
  const number = (value: number | null | undefined) =>
    value === null || value === undefined
      ? "—"
      : value.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  const waitRemaining =
    data?.waitlistCapacity !== null && data?.waitlistTotal !== null && data
      ? Math.max(0, data.waitlistCapacity - data.waitlistTotal)
      : null;
  return (
    <div
      className={styles.root}
      data-section-availability={section.classNumber}
    >
      <div className={styles.heading}>
        <span
          className={styles.status}
          data-tone={data && !failed ? kind : "unknown"}
        >
          {failed && data ? text(locale, "Last: ", "上次：") : ""}
          {data
            ? waiting
              ? text(locale, "Waitlist", "候补")
              : open
                ? text(locale, "Open", "可选")
                : closed
                  ? text(locale, "Closed", "不可选")
                  : data.enrollmentStatus ||
                    text(locale, "Status not reported", "状态未返回")
            : busy
              ? text(locale, "Checking…", "查询中…")
              : failed
                ? text(locale, "Check failed", "查询失败")
                : text(locale, "Not checked", "待查询")}
        </span>
        {onRefresh ? (
          <button
            type="button"
            disabled={busy}
            onClick={onRefresh}
            aria-label={text(
              locale,
              `Check seats for section ${section.section}`,
              `查询班次 ${section.section} 空位`,
            )}
            title={text(locale, "Refresh this section", "刷新此班次")}
            className={styles.refresh}
          >
            {busy ? (
              <LoaderCircle size={12} className="spin" aria-hidden="true" />
            ) : (
              <RefreshCw size={12} aria-hidden="true" />
            )}
          </button>
        ) : null}
      </div>
      {data ? (
        <>
          <div className={styles.metrics} key={data.fetchedAt}>
            <span>
              <small>{text(locale, "Available", "剩余可用")}</small>
              <strong
                data-positive={
                  !failed &&
                  Boolean(data.availableSeats && data.availableSeats > 0)
                }
              >
                {number(data.availableSeats)}
              </strong>
            </span>
            <span>
              <small>{text(locale, "Enrolled / cap", "已选／容量")}</small>
              <strong>
                {number(data.enrollmentTotal)}
                <i> / {number(data.enrollmentCapacity)}</i>
              </strong>
            </span>
          </div>
          <div className={styles.waitlist}>
            {data.waitlistCapacity === 0 && !data.waitlistTotal ? (
              text(locale, "No waitlist", "不设候补")
            ) : data.waitlistCapacity === null &&
              data.waitlistTotal === null ? (
              text(locale, "Waitlist not reported", "候补信息未返回")
            ) : (
              <>
                {text(locale, "Waitlist", "候补")} {number(data.waitlistTotal)}{" "}
                / {number(data.waitlistCapacity)}{" "}
                {waitRemaining !== null ? (
                  <span>
                    {text(
                      locale,
                      `${number(waitRemaining)} left`,
                      `余 ${number(waitRemaining)}`,
                    )}
                  </span>
                ) : null}
              </>
            )}
          </div>
          <time
            dateTime={data.fetchedAt}
            className={styles.updated}
            data-error={failed}
          >
            {failed
              ? text(locale, "Refresh failed · last read ", "刷新失败 · 上次 ")
              : busy
                ? text(locale, "Refreshing · last read ", "刷新中 · 上次 ")
                : ""}
            {new Date(data.fetchedAt).toLocaleTimeString(
              locale === "zh" ? "zh-CN" : "en-US",
              { hour: "2-digit", minute: "2-digit", second: "2-digit" },
            )}
          </time>
        </>
      ) : null}
    </div>
  );
}
