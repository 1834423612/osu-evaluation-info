"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Copy, ArrowRight } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { authClient } from "@/lib/auth/client";
import { text } from "@/lib/i18n";
import { browserUuid } from "@/lib/uuid";
import { emptyPlan } from "@/lib/planning/model";
import {
  planShareSchema,
  copyPlanShare,
  type PlanShare,
} from "@/lib/planning/share-snapshot";
import {
  planningScope,
  subscribePlanningScope,
  planningState,
  savePlanningLocal,
} from "@/lib/planning/client-sync";
import { semesterLabel, planningCampuses } from "@/lib/planning/workspace";
import { linkCapability, sharingDate } from "@/lib/saved/share-links";
import styles from "./plan-tools.module.css";
export function SharedPlan({ id }: { id: string }) {
  const { locale } = usePreferences();
  const t = (en: string, zh: string) => text(locale, en, zh);
  const account = useSyncExternalStore(
    subscribePlanningScope,
    planningScope,
    () => null,
  );
  const { data: session } = authClient.useSession();
  const [snapshot, setSnapshot] = useState<PlanShare | null>(null);
  const [expiry, setExpiry] = useState<string | null>(null);
  const [error, setError] = useState(false),
    [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(""),
    [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/planning/shares/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, capability: linkCapability("planning", id) }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw Error();
        const body = await response.json();
        if (!controller.signal.aborted) {
          setSnapshot(planShareSchema.parse(body.snapshot));
          setExpiry(body.expiresAt);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [id]);
  async function copy() {
    if (!snapshot || !account || session?.user.id !== account || copied) return;
    setBusy(true);
    setNotice("");
    try {
      const current = planningState(account).plan,
        key = browserUuid();
      await savePlanningLocal(
        account,
        current,
        copyPlanShare(current ?? emptyPlan(), snapshot, key, browserUuid),
      );
      setCopied(key);
      setNotice(
        t(
          "Saved as an independent plan. Your personal academic plan is retained.",
          "已转存为独立方案，个人学业规划已保留。",
        ),
      );
    } catch {
      setNotice(
        t(
          "Could not save. Check local storage and your independent plan limit.",
          "转存失败，请检查本地存储与独立方案数量上限。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <AppHeader active="planning" />
      <main className={styles.sharedPage + " rr-block"} data-telemetry-private>
        <header className={styles.sharedHero}>
          <div>
            <a href="/planning">{t("Semester planner", "学期规划")}</a>
            <h1>
              {snapshot?.title ?? t("Shared semester plan", "分享的学期规划")}
            </h1>
            <p>
              {snapshot
                ? snapshot.semesters.length +
                  " " +
                  t("semesters", "个学期") +
                  " · " +
                  snapshot.semesters.reduce((n, s) => n + s.courses.length, 0) +
                  " " +
                  t("courses", "门课程") +
                  " · " +
                  sharingDate(expiry, locale)
                : t(
                    "Preview the semesters, then save your own editable copy.",
                    "先预览学期安排，再转存为可编辑的独立方案。",
                  )}
            </p>
          </div>
          {snapshot ? (
            <div className={styles.actions}>
              {copied ? (
                <a href={"/planning?plan=" + copied}>
                  {t("Open my plan", "打开我的方案")} <ArrowRight size={14} />
                </a>
              ) : account && session?.user.id === account ? (
                <Button disabled={busy} onClick={() => void copy()}>
                  <Copy size={15} />
                  {busy
                    ? t("Saving…", "正在转存…")
                    : t("Save to my account", "一键转存至我的账号")}
                </Button>
              ) : (
                <a href="/account">
                  {t("Sign in to save this plan", "登录后转存此规划")}
                </a>
              )}
            </div>
          ) : null}
        </header>
        {notice ? (
          <p className={styles.result} role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p role="alert">
            {t(
              "This link expired, was revoked, or is missing its access key. Open the complete original link.",
              "链接已过期、已撤销，或缺少访问密钥，请使用原始完整链接。",
            )}
          </p>
        ) : snapshot ? (
          <div className={styles.semesterGrid}>
            {snapshot.semesters.map((semester) => {
              const campus =
                planningCampuses.find(
                  ([code]) => code === semester.campus,
                )?.[1] ?? semester.campus;
              const known = semester.courses.reduce(
                  (n, c) => n + (c.credits ?? 0),
                  0,
                ),
                unknown = semester.courses.filter(
                  (c) => c.credits === null,
                ).length;
              return (
                <section className={styles.semester} key={semester.term}>
                  <header>
                    <h2>{semesterLabel(semester.term, locale)}</h2>
                    <p>
                      {campus} · {semester.courses.length}{" "}
                      {t("courses", "门课程")} · {known} {t("credits", "学分")}
                      {unknown
                        ? " + " + unknown + " " + t("unconfirmed", "门待确认")
                        : ""}
                    </p>
                  </header>
                  <ul className={styles.courses}>
                    {semester.courses.map((course, index) => (
                      <li key={course.subject + course.number + index}>
                        <div className={styles.courseHeading}>
                          <strong>
                            {course.subject} {course.number}
                          </strong>
                          <small>
                            {course.credits === null
                              ? t("Credits pending", "学分待确认")
                              : course.credits + " " + t("cr", "学分")}
                          </small>
                        </div>
                        {course.title ? <p>{course.title}</p> : null}
                        {course.section ? (
                          <small>
                            {t("Section", "班次")} {course.section}
                          </small>
                        ) : null}
                        {course.sections?.length ? (
                          <small>
                            {t("Class numbers", "教学班号")} ·{" "}
                            {course.sections.join(" · ")}
                          </small>
                        ) : null}
                      </li>
                    ))}
                    {semester.placeholders?.map((slot, index) => (
                      <li key={"slot-" + index}>
                        <div className={styles.courseHeading}>
                          <strong>{slot.title}</strong>
                          <small>{t("Elective slot", "待定课程")}</small>
                        </div>
                        <small>
                          {slot.credits === null
                            ? t("Credits pending", "学分待确认")
                            : slot.credits + " " + t("cr", "学分")}
                        </small>
                      </li>
                    ))}
                  </ul>
                  {!semester.courses.length &&
                  !semester.placeholders?.length ? (
                    <p className={styles.form}>
                      {t("No courses planned yet", "尚未安排课程")}
                    </p>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : (
          <p role="status">
            {t("Loading shared plan…", "正在读取分享的规划…")}
          </p>
        )}
      </main>
      <AppFooter />
    </>
  );
}
