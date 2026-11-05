"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Building2 } from "lucide-react";
import type {
  DirectoryLookupResult,
  DirectoryRole,
} from "@/lib/people/directory";
import {
  instructorDirectoryQuery,
  selectDirectoryCandidate,
  type DirectoryInstructor,
} from "@/lib/people/identity";
import { InstructorAvatar } from "./instructor-avatar";
import type { EvaluationLocale } from "./rating-summary";
import styles from "./people-directory-lookup.module.css";

type Props = DirectoryInstructor & { locale: EvaluationLocale };
const failedResult: DirectoryLookupResult = {
  status: "unavailable",
  source: null,
  results: [],
};
const cache = new Map<
  string,
  { result: DirectoryLookupResult; expires: number }
>();
const pending = new Map<string, Promise<DirectoryLookupResult>>();
const queue: Array<() => void> = [];
let active = 0;

function runNext() {
  while (active < 3 && queue.length) queue.shift()!();
}

function lookup(
  term: string,
  fallbackName?: string,
): Promise<DirectoryLookupResult> {
  const key = JSON.stringify([
    term.toLocaleLowerCase(),
    fallbackName?.toLocaleLowerCase() ?? "",
  ]);
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now())
    return Promise.resolve(cached.result);
  const running = pending.get(key);
  if (running) return running;
  const request = new Promise<DirectoryLookupResult>((resolve) => {
    queue.push(() => {
      active++;
      void fetch("/api/people/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          term,
          ...(fallbackName ? { fallbackName } : {}),
        }),
        signal: AbortSignal.timeout(11_000),
      })
        .then(async (response): Promise<DirectoryLookupResult> => {
          if (!response.ok) return failedResult;
          const result = (await response.json()) as DirectoryLookupResult;
          return result.status === "available" && Array.isArray(result.results)
            ? result
            : failedResult;
        })
        .catch(() => failedResult)
        .then((result) => {
          cache.delete(key);
          cache.set(key, {
            result,
            expires:
              Date.now() +
              (result.status === "unavailable"
                ? 30_000
                : result.results.length
                  ? 6 * 60 * 60_000
                  : 30 * 60_000),
          });
          while (cache.size > 384) cache.delete(cache.keys().next().value!);
          resolve(result);
        })
        .finally(() => {
          pending.delete(key);
          active--;
          runNext();
        });
    });
  });
  pending.set(key, request);
  runNext();
  return request;
}

function useDirectory(instructor: DirectoryInstructor, eager = false) {
  const term = instructorDirectoryQuery(instructor);
  const fallbackName =
    /^[a-z0-9_-]+\.\d{1,10}$/i.test(term) &&
    instructor.name.trim().split(/\s+/).length >= 2
      ? instructor.name.trim().replace(/\s+/g, " ")
      : undefined;
  const requestKey = JSON.stringify([term, fallbackName ?? ""]);
  const element = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState<{
    requestKey: string;
    result: DirectoryLookupResult;
  } | null>(null);
  useEffect(() => {
    let alive = true;
    let started = false;
    function load() {
      if (started || !term) return;
      started = true;
      void lookup(term, fallbackName).then((result) => {
        if (alive) setLoaded({ requestKey, result });
      });
    }
    if (
      eager ||
      !element.current ||
      typeof IntersectionObserver === "undefined"
    ) {
      load();
      return () => {
        alive = false;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(element.current);
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [term, fallbackName, requestKey, eager]);
  const result = loaded?.requestKey === requestKey ? loaded.result : null;
  const person =
    result?.status === "available"
      ? selectDirectoryCandidate(result.results, instructor)
      : null;
  return { element, result, person };
}

const roleLabels: Record<EvaluationLocale, Record<DirectoryRole, string>> = {
  en: {
    professor: "Professor",
    lecturer: "Lecturer",
    faculty: "Instructor",
    "teaching-assistant": "TA",
    "student-assistant": "Student assistant",
    student: "Student",
    employee: "OSU employee",
  },
  zh: {
    professor: "教授",
    lecturer: "讲师",
    faculty: "教师",
    "teaching-assistant": "TA 助教",
    "student-assistant": "学生助理",
    student: "学生",
    employee: "OSU 雇员",
  },
};

export function InstructorDirectoryBadge(props: Props) {
  const { element, result, person } = useDirectory(props);
  const roles =
    person?.roles.filter(
      (role) => role !== "employee" || person.roles.length === 1,
    ) ?? [];
  return (
    <span ref={element} className={styles.roles} aria-live="polite">
      {roles.length ? (
        roles.map((role) => (
          <span className={styles.role} data-role={role} key={role}>
            {role === "teaching-assistant" &&
            person?.appointments.some((appointment) =>
              /\bgraduate\b/i.test(appointment.title),
            )
              ? props.locale === "zh"
                ? "研究生 TA"
                : "Graduate TA"
              : role === "teaching-assistant" &&
                  person?.appointments.some((appointment) =>
                    /\bundergraduate\b/i.test(appointment.title),
                  )
                ? props.locale === "zh"
                  ? "本科生 TA"
                  : "Undergraduate TA"
                : roleLabels[props.locale][role]}
          </span>
        ))
      ) : (
        <span className={styles.unknown}>
          {!result
            ? props.locale === "zh"
              ? "身份核对中…"
              : "Checking role…"
            : result.status === "unavailable"
              ? props.locale === "zh"
                ? "身份暂不可用"
                : "Role unavailable"
              : props.locale === "zh"
                ? "身份未确认"
                : "Role unconfirmed"}
        </span>
      )}
    </span>
  );
}

export function InstructorDirectoryDetails(props: Props) {
  const { person, result } = useDirectory(props, true);
  return (
    <div className={styles.appointments}>
      <strong className={styles.detailHeading}>
        <Building2 size={14} aria-hidden="true" />
        {props.locale === "zh"
          ? "OSU 目录任职与部门"
          : "OSU directory appointments"}
      </strong>
      {person?.appointments.length ? (
        <ul>
          {person.appointments.map((appointment, index) => (
            <li key={`${appointment.title}-${index}`}>
              <span>{appointment.title}</span>
              {appointment.organization ? (
                <small>{appointment.organization}</small>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          {!result
            ? props.locale === "zh"
              ? "正在读取任职信息…"
              : "Loading appointments…"
            : result.status === "unavailable"
              ? props.locale === "zh"
                ? "OSU 人员目录暂不可用，请稍后重新打开。"
                : "The OSU directory is temporarily unavailable. Reopen this card later."
              : person
                ? props.locale === "zh"
                  ? "目录未列出任职部门。"
                  : "No appointment is listed in the directory."
                : props.locale === "zh"
                  ? "未获得唯一匹配的目录记录，暂不判断身份。"
                  : "No unique directory match; the role remains unconfirmed."}
        </p>
      )}
      <p className={styles.note}>
        {props.locale === "zh"
          ? "身份依据目录中的任职与身份信息；缺少评价或任教 Recitation 不代表 TA。目录不能确认全职或终身教职状态。"
          : "Roles follow directory appointments and affiliations. Missing ratings or teaching Recitation does not establish TA status. Full-time or tenure status is not established."}
      </p>
    </div>
  );
}

export function InstructorDirectoryIdentity({
  size = 30,
  ...props
}: Props & { size?: number }) {
  const [expanded, setExpanded] = useState(false);
  const detailId = useId();
  return (
    <div className={styles.identity}>
      <button
        className={styles.identityButton}
        type="button"
        aria-expanded={expanded}
        aria-controls={expanded ? detailId : undefined}
        aria-label={
          props.locale === "zh"
            ? `查看 ${props.name} 的任职部门`
            : `View ${props.name}'s appointments`
        }
        onClick={() => setExpanded((value) => !value)}
      >
        <InstructorAvatar name={props.name} email={props.email} size={size} />
        <span className={styles.identityName}>
          <span>{props.name}</span>
          <InstructorDirectoryBadge {...props} />
        </span>
        <ChevronDown
          className={styles.chevron}
          data-open={expanded}
          size={13}
          aria-hidden="true"
        />
      </button>
      {expanded ? (
        <div id={detailId}>
          <InstructorDirectoryDetails {...props} />
        </div>
      ) : null}
    </div>
  );
}
