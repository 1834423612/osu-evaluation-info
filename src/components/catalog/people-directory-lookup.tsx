"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Popover } from "radix-ui";
import {
  AlertCircle,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  GraduationCap,
  LoaderCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import type {
  DirectoryCandidate,
  DirectoryLookupResult,
  DirectoryRole,
} from "@/lib/people/directory";
import {
  distinctDirectoryAppointments,
  instructorDirectoryQuery,
  selectDirectoryCandidate,
  visibleDirectoryRoles,
  type DirectoryInstructor,
} from "@/lib/people/identity";
import { InstructorAvatar } from "./instructor-avatar";
import type { EvaluationLocale } from "./rating-summary";
import styles from "./people-directory-lookup.module.css";

type Props = DirectoryInstructor & { locale: EvaluationLocale };
type AvailableDirectoryResult = Extract<
  DirectoryLookupResult,
  { status: "available" }
>;
type StoredDirectoryResult = {
  verifiedAt: string;
  result: AvailableDirectoryResult;
};

const STORAGE_KEY = "course-atlas:people-directory:v2";
const LOCAL_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LOCAL_RECORDS = 256;
const roleSet = new Set<DirectoryRole>([
  "professor",
  "lecturer",
  "faculty",
  "teaching-assistant",
  "student-assistant",
  "student",
  "employee",
]);
const inFlight = new Map<string, Promise<DirectoryLookupResult>>();
const cachedResults = new Map<string, AvailableDirectoryResult>();
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function publish(identity: string, result: AvailableDirectoryResult) {
  cachedResults.delete(identity);
  cachedResults.set(identity, result);
  while (cachedResults.size > MAX_LOCAL_RECORDS)
    cachedResults.delete(cachedResults.keys().next().value!);
  listeners.forEach((listener) => listener());
}

function useCachedResult(identity: string | null) {
  const result = useSyncExternalStore(
    subscribe,
    () => {
      const cached = identity ? cachedResults.get(identity) : null;
      return cached &&
        Date.now() - Date.parse(cached.verifiedAt ?? "") < LOCAL_TTL_MS
        ? cached
        : null;
    },
    () => null,
  );
  useEffect(() => {
    if (!identity) return;
    const local = readLocal(identity);
    if (local) publish(identity, local);
  }, [identity]);
  return result;
}

const roleLabels: Record<EvaluationLocale, Record<DirectoryRole, string>> = {
  en: {
    professor: "Professor",
    lecturer: "Lecturer",
    faculty: "Instructor",
    "teaching-assistant": "Teaching assistant",
    "student-assistant": "Student assistant",
    student: "Student information",
    employee: "OSU employee",
  },
  zh: {
    professor: "教授",
    lecturer: "讲师",
    faculty: "教师",
    "teaching-assistant": "TA 助教",
    "student-assistant": "学生助理",
    student: "学生信息",
    employee: "OSU 雇员",
  },
};

function roleLabel(
  role: DirectoryRole,
  person: DirectoryCandidate,
  locale: EvaluationLocale,
) {
  if (role === "teaching-assistant") {
    const title = person.appointments.map((item) => item.title).join(" ");
    if (/\bgraduate\b/i.test(title))
      return locale === "zh" ? "研究生 TA" : "Graduate TA";
    if (/\bundergraduate\b/i.test(title))
      return locale === "zh" ? "本科生 TA" : "Undergraduate TA";
  }
  return roleLabels[locale][role];
}

function isDirectoryCandidate(value: unknown): value is DirectoryCandidate {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<DirectoryCandidate>;
  return (
    typeof candidate.name === "string" &&
    candidate.name.length > 0 &&
    candidate.name.length <= 180 &&
    Array.isArray(candidate.roles) &&
    candidate.roles.length <= roleSet.size &&
    candidate.roles.every((role) => roleSet.has(role)) &&
    Array.isArray(candidate.appointments) &&
    candidate.appointments.length <= 8 &&
    candidate.appointments.every(
      (appointment) =>
        appointment &&
        typeof appointment.title === "string" &&
        appointment.title.length > 0 &&
        appointment.title.length <= 180 &&
        (appointment.organization === null ||
          (typeof appointment.organization === "string" &&
            appointment.organization.length <= 180)),
    )
  );
}

function isAvailableResult(value: unknown): value is AvailableDirectoryResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const result = value as Partial<AvailableDirectoryResult>;
  return (
    result.status === "available" &&
    (result.source === "osu-search" || result.source === "content-api-v2") &&
    ["source", "memory", "database"].includes(result.cache ?? "") &&
    typeof result.verifiedAt === "string" &&
    Number.isFinite(Date.parse(result.verifiedAt)) &&
    Array.isArray(result.results) &&
    result.results.length <= 15 &&
    result.results.every(isDirectoryCandidate)
  );
}

function queryKey(term: string, fallbackName?: string) {
  return JSON.stringify([
    term.trim().toLocaleLowerCase(),
    fallbackName?.trim().toLocaleLowerCase() ?? "",
  ]);
}

function readLocal(identity: string): AvailableDirectoryResult | null {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "{}",
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    const record = (parsed as Record<string, StoredDirectoryResult>)[identity];
    if (
      !record ||
      !isAvailableResult(record.result) ||
      Date.now() - Date.parse(record.verifiedAt) >= LOCAL_TTL_MS ||
      Date.parse(record.verifiedAt) > Date.now() + 60_000 ||
      record.verifiedAt !== record.result.verifiedAt ||
      record.result.stale
    )
      return null;
    return { ...record.result, cache: "memory" };
  } catch {
    return null;
  }
}

function writeLocal(identity: string, result: AvailableDirectoryResult) {
  if (result.stale || !result.results.length) return;
  publish(identity, result);
  try {
    let parsed: Record<string, StoredDirectoryResult> = {};
    try {
      const current: unknown = JSON.parse(
        localStorage.getItem(STORAGE_KEY) ?? "{}",
      );
      if (current && typeof current === "object" && !Array.isArray(current))
        parsed = current as Record<string, StoredDirectoryResult>;
    } catch {
      parsed = {};
    }
    parsed[identity] = { verifiedAt: result.verifiedAt!, result };
    for (const [key, value] of Object.entries(parsed))
      if (
        !value ||
        !isAvailableResult(value.result) ||
        Date.now() - Date.parse(value.verifiedAt) >= LOCAL_TTL_MS
      )
        delete parsed[key];
    for (const key of Object.keys(parsed).slice(0, -MAX_LOCAL_RECORDS))
      delete parsed[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Private browsing and storage quotas should not prevent verification.
  }
}

function lookup(
  term: string,
  fallbackName: string | undefined,
): Promise<DirectoryLookupResult> {
  const key = queryKey(term, fallbackName);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const request = fetch("/api/people/lookup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ term, ...(fallbackName ? { fallbackName } : {}) }),
    signal: AbortSignal.timeout(11_000),
  })
    .then(async (response): Promise<DirectoryLookupResult> => {
      if (!response.ok)
        return { status: "unavailable", source: null, results: [] };
      const body: unknown = await response.json();
      if (!isAvailableResult(body))
        return { status: "unavailable", source: null, results: [] };
      return body;
    })
    .catch((): DirectoryLookupResult => ({
      status: "unavailable",
      source: null,
      results: [],
    }))
    .finally(() => inFlight.delete(key));
  inFlight.set(key, request);
  return request;
}

function verifiedIdentity(props: DirectoryInstructor) {
  return (
    props.email
      ?.trim()
      .match(/^([a-z0-9_-]+\.\d{1,10})@osu\.edu$/i)?.[1]
      .toLocaleLowerCase() ?? null
  );
}

function detailRows(
  person: DirectoryCandidate,
  roles: DirectoryRole[],
  locale: EvaluationLocale,
) {
  const rows: Array<{
    key: string;
    icon: "student" | "appointment" | "department" | "confirmed";
    label: string;
  }> = roles
    .filter((role) => role === "student" || !person.appointments.length)
    .map((role) => ({
      key: `role-${role}`,
      icon:
        role === "student" || role === "student-assistant"
          ? "student"
          : "appointment",
      label: roleLabel(role, person, locale),
    }));
  for (const [index, appointment] of distinctDirectoryAppointments(
    person.appointments,
  )
    .slice(0, 2)
    .entries()) {
    rows.push({
      key: `appointment-${index}`,
      icon: "appointment",
      label: appointment.title,
    });
    if (appointment.organization)
      rows.push({
        key: `department-${index}`,
        icon: "department",
        label: appointment.organization,
      });
  }
  if (!rows.length)
    rows.push({
      key: "confirmed",
      icon: "confirmed",
      label:
        locale === "zh" ? "目录未列出任职信息" : "No appointment is listed",
    });
  return rows.slice(0, 4);
}

export function InstructorDirectoryIdentity({
  size = 30,
  ...props
}: Props & { size?: number }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DirectoryLookupResult | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const identity = verifiedIdentity(props);
  const cached = useCachedResult(identity);
  const effectiveResult = result ?? cached;
  const term = identity ?? instructorDirectoryQuery(props);
  const fallbackName =
    identity && props.name.trim().split(/\s+/).length >= 2
      ? props.name.trim().replace(/\s+/g, " ")
      : undefined;
  const person =
    effectiveResult?.status === "available"
      ? selectDirectoryCandidate(effectiveResult.results, props)
      : null;

  async function verify() {
    if (
      (effectiveResult?.status === "available" &&
        selectDirectoryCandidate(effectiveResult.results, props)) ||
      loading
    )
      return;
    const stored = identity ? readLocal(identity) : null;
    if (stored) {
      setResult(stored);
      return;
    }
    setLoading(true);
    try {
      const next = await lookup(term, fallbackName);
      setResult(next);
      if (
        identity &&
        next.status === "available" &&
        !next.stale &&
        selectDirectoryCandidate(next.results, props)
      )
        writeLocal(identity, next);
    } finally {
      setLoading(false);
    }
  }

  const roles = person ? visibleDirectoryRoles(person.roles) : [];
  const roleCaption = roles
    .slice(0, 2)
    .map((role) => roleLabel(role, person!, props.locale))
    .join(" · ");
  const checked = Boolean(person && effectiveResult?.status === "available");

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setPortalContainer(
            triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
          );
          void verify();
        }
      }}
    >
      <Popover.Trigger asChild>
        <button
          className={styles.identityButton}
          ref={triggerRef}
          type="button"
          aria-label={
            props.locale === "zh"
              ? `${checked ? "查看" : "核验"}${props.name}的身份信息`
              : `${checked ? "View" : "Verify"} ${props.name}'s OSU identity`
          }
          aria-expanded={open}
        >
          <InstructorAvatar name={props.name} email={props.email} size={size} />
          <span className={styles.identityName}>
            <span>{props.name}</span>
            {checked && roleCaption ? (
              <span className={styles.role} data-role={roles[0]}>
                {roleCaption}
              </span>
            ) : (
              <span className={styles.unknown}>
                {loading
                  ? props.locale === "zh"
                    ? "正在核验…"
                    : "Checking…"
                  : checked
                    ? props.locale === "zh"
                      ? "已核验"
                      : "Verified"
                    : props.locale === "zh"
                      ? "核验身份"
                      : "Verify identity"}
              </span>
            )}
          </span>
          <ChevronDown
            className={styles.chevron}
            data-open={open}
            size={13}
            aria-hidden="true"
          />
        </button>
      </Popover.Trigger>
      <Popover.Portal container={portalContainer}>
        <Popover.Content
          className={styles.popover}
          side="bottom"
          align="start"
          sideOffset={8}
          collisionPadding={10}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Popover.Arrow className={styles.arrow} />
          <div className={styles.popoverHeader}>
            {person ? (
              <ShieldCheck size={15} aria-hidden="true" />
            ) : loading ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : effectiveResult?.status === "unavailable" ? (
              <AlertCircle size={15} aria-hidden="true" />
            ) : (
              <ShieldCheck size={15} aria-hidden="true" />
            )}
            <strong>
              {person
                ? props.locale === "zh"
                  ? "OSU 目录身份"
                  : "OSU directory identity"
                : loading
                  ? props.locale === "zh"
                    ? "正在读取官方目录"
                    : "Checking OSU directory"
                  : props.locale === "zh"
                    ? "身份核验"
                    : "Identity check"}
            </strong>
          </div>
          {person ? (
            <div className={styles.details}>
              {detailRows(person, roles, props.locale).map((row) => (
                <div className={styles.detailRow} key={row.key}>
                  {row.icon === "student" ? (
                    <GraduationCap size={15} aria-hidden="true" />
                  ) : row.icon === "appointment" ? (
                    <BriefcaseBusiness size={14} aria-hidden="true" />
                  ) : row.icon === "department" ? (
                    <Building2 size={14} aria-hidden="true" />
                  ) : (
                    <Check size={15} aria-hidden="true" />
                  )}
                  <span>{row.label}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.status} role={loading ? "status" : undefined}>
              {loading
                ? props.locale === "zh"
                  ? "正在查询 OSU 官方人员目录…"
                  : "Checking the official OSU directory…"
                : effectiveResult?.status === "unavailable"
                  ? props.locale === "zh"
                    ? "目录暂不可用。稍后可再次点击核验。"
                    : "The directory is unavailable. Click to retry later."
                  : effectiveResult?.status === "available"
                    ? props.locale === "zh"
                      ? "没有唯一匹配的目录记录，暂不显示身份。"
                      : "No unique directory record matched; no role is shown."
                    : props.locale === "zh"
                      ? "点击教师姓名，通过 OSU 官方目录核验。"
                      : "Verify this instructor against the official OSU directory."}
            </p>
          )}
          {person && effectiveResult?.status === "available" ? (
            <p className={styles.source}>
              {effectiveResult.stale
                ? props.locale === "zh"
                  ? "暂时使用已核验的缓存资料"
                  : "Using the previously verified record"
                : effectiveResult.cache === "database" ||
                    effectiveResult.cache === "memory"
                  ? props.locale === "zh"
                    ? "OSU 官方资料缓存"
                    : "Verified OSU directory cache"
                  : props.locale === "zh"
                    ? "来自 OSU 官方人员目录"
                    : "From the official OSU directory"}
              {effectiveResult.verifiedAt
                ? ` · ${new Date(effectiveResult.verifiedAt).toLocaleDateString(
                    props.locale === "zh" ? "zh-CN" : "en-US",
                  )}`
                : ""}
            </p>
          ) : null}
          <Popover.Close asChild>
            <button
              type="button"
              className={styles.closeButton}
              aria-label={props.locale === "zh" ? "关闭" : "Close"}
            >
              <X aria-hidden="true" />
            </button>
          </Popover.Close>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function InstructorDirectoryBadge(props: Props) {
  return (
    <span className={styles.unknown}>
      {props.locale === "zh" ? "身份未核验" : "Unverified identity"}
    </span>
  );
}

export function InstructorDirectoryDetails(_props: Props) {
  void _props;
  return null;
}
