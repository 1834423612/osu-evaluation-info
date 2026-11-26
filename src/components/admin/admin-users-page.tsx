"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, LockKeyhole, AlertTriangle } from "lucide-react";
import { AppHeader } from "@/components/layout/app-header";
import { AppFooter } from "@/components/layout/app-footer";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/ui/search-field";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { usePreferences } from "@/hooks/use-preferences";
import { debugTools } from "@/lib/debug/client";
import ui from "@/components/ui/workspace.module.css";
import styles from "./admin-users.module.css";
type User = {
  id: string;
  name: string;
  email: string;
  verified: boolean;
  admin: boolean;
  createdAt: string;
};
type Audit = {
  id: string;
  userId: string;
  action: string;
  actor: string;
  reason: string;
  createdAt: string;
};
type Data = {
  items: User[];
  page: number;
  total: number;
  pageSize: number;
  audit: Audit[];
  development: boolean;
};
export function AdminUsersPage() {
  const { locale } = usePreferences();
  const t = (en: string, zh: string) => (locale === "zh" ? zh : en);
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [page, setPage] = useState(1),
    [auditPage, setAuditPage] = useState(1),
    [retry, setRetry] = useState(0),
    [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [target, setTarget] = useState<User | null>(null),
    [reason, setReason] = useState(""),
    [saving, setSaving] = useState(false),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const c = new AbortController();
    fetch(
      "/api/admin/users?" +
        new URLSearchParams({
          search: query,
          page: String(page),
          auditPage: String(auditPage),
        }),
      { signal: c.signal, cache: "no-store" },
    )
      .then(async (r) => {
        const result = await r.json();
        if (!r.ok) throw Error(result.error ?? "unavailable");
        return result;
      })
      .then((value) => {
        if (!c.signal.aborted) {
          setData(value);
          setError("");
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) {
          setError(e.message);
          setData(null);
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [query, page, auditPage, retry]);
  const reload = () => {
    setLoading(true);
    setRetry((n) => n + 1);
  };
  async function changeRole() {
    if (!target) return;
    setSaving(true);
    setNotice("");
    try {
      const r = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: target.id,
          action: target.admin ? "revoke" : "grant",
          reason,
        }),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error ?? "unavailable");
      setTarget(null);
      setReason("");
      setNotice(t("Permissions updated.", "权限已更新。"));
      reload();
    } catch (e) {
      setNotice(
        e instanceof Error && e.message === "last_admin"
          ? t(
              "The final administrator must remain authorized.",
              "必须保留至少一名管理员。",
            )
          : e instanceof Error && e.message === "email_unverified"
            ? t(
                "Verify the account email before granting administrator access.",
                "请先验证账号邮箱，再授予管理员权限。",
              )
            : t(
                "Permission change failed. Check access and try again.",
                "权限修改失败，请检查权限后重试。",
              ),
      );
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <AppHeader active="rmp" />
      <main className={`${ui.shell} ${styles.shell} rr-block`} data-telemetry-private>
        <div className={ui.heading}>
          <div>
            <h1 className={ui.pageTitle}>
              <Users size={22} />
              {t("Accounts & permissions", "账号与权限")}
            </h1>
            <p>
              {t(
                "Manage administrator roles for existing accounts.",
                "管理已有账号的管理员权限。",
              )}
            </p>
          </div>
          <Link href="/admin/rmp">
            {t("RMP reconciliation", "RMP 数据核对")}
          </Link>
        </div>
        {data?.development && (
          <aside className={styles.warning} role="status">
            <AlertTriangle size={20} />
            <p>
              {t(
                "Development mode · changes apply only to development accounts.",
                "开发模式 · 修改仅作用于开发账号。",
              )}
            </p>
          </aside>
        )}
        {error === "forbidden" ? (
          <section className={ui.panel}>
            <h2>
              <LockKeyhole size={18} />
              {t("Administrator access required", "需要管理员权限")}
            </h2>
            <p>
              {t(
                "Use a verified administrator account, sign in again within 30 minutes, then unlock administrator tools.",
                "请使用已验证的管理员账号在 30 分钟内重新登录，再解锁管理工具。",
              )}
            </p>
            <div className={styles.actions}>
              <Button asChild variant="outline">
                <Link href="/account">{t("Account", "账号")}</Link>
              </Button>
              <Button onClick={() => debugTools.open()}>
                {t("Unlock administrator tools", "解锁管理工具")}
              </Button>
              <Button variant="ghost" onClick={reload}>
                {t("Check access", "检查权限")}
              </Button>
            </div>
          </section>
        ) : (
          <>
            <form
              className={styles.search}
              onSubmit={(event) => {
                event.preventDefault();
                setPage(1);
                setQuery(search.trim());
                setLoading(true);
                setRetry((n) => n + 1);
              }}
            >
              <SearchField
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t(
                  "Name, email or account ID",
                  "姓名、邮箱或账号 ID",
                )}
                aria-label={t("Find account", "查找账号")}
              />
              <Button type="submit">{t("Search", "搜索")}</Button>
              <Button type="button" variant="outline" onClick={reload}>
                {t("Refresh", "刷新")}
              </Button>
            </form>
            {notice && <p role="status">{notice}</p>}
            {loading ? (
              <p role="status">{t("Loading accounts…", "正在加载账号…")}</p>
            ) : error ? (
              <p role="alert">
                {t("Account data is unavailable.", "账号数据暂不可用。")}
              </p>
            ) : (
              data && (
                <>
                  <p className={styles.count}>
                    {data.total} {t("accounts", "个账号")}
                  </p>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t("Account", "账号")}</th>
                          <th>{t("Email verified", "邮箱已验证")}</th>
                          <th>{t("Role", "权限")}</th>
                          <th>{t("Action", "操作")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((user) => (
                          <tr key={user.id}>
                            <td>
                              <strong>{user.name}</strong>
                              <span>{user.email}</span>
                              <small>{user.id}</small>
                            </td>
                            <td>
                              {user.verified ? t("Yes", "是") : t("No", "否")}
                            </td>
                            <td>
                              {user.admin
                                ? t("Administrator", "管理员")
                                : t("User", "用户")}
                            </td>
                            <td>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={!user.verified && !user.admin}
                                onClick={() => {
                                  setTarget(user);
                                  setReason("");
                                  setNotice("");
                                }}
                              >
                                {user.admin
                                  ? t("Revoke admin", "撤销管理员")
                                  : t("Grant admin", "授予管理员")}
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.items.length && (
                      <p className={styles.empty}>
                        {t("No matching accounts.", "未找到匹配账号。")}
                      </p>
                    )}
                  </div>
                  <div className={styles.pagination}>
                    <Button
                      variant="outline"
                      disabled={page === 1}
                      onClick={() => {
                        setLoading(true);
                        setPage((n) => n - 1);
                      }}
                    >
                      {t("Previous", "上一页")}
                    </Button>
                    <span>
                      {page} /{" "}
                      {Math.max(1, Math.ceil(data.total / data.pageSize))}
                    </span>
                    <Button
                      variant="outline"
                      disabled={page * data.pageSize >= data.total}
                      onClick={() => {
                        setLoading(true);
                        setPage((n) => n + 1);
                      }}
                    >
                      {t("Next", "下一页")}
                    </Button>
                  </div>
                  <h2 className={styles.auditTitle}>
                    {t("Permission audit", "权限审计")}
                  </h2>
                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>{t("Time & account", "时间与账号")}</th>
                          <th>{t("Change", "变更")}</th>
                          <th>{t("Operator & reason", "操作者与理由")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.audit.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span>
                                {new Date(item.createdAt).toLocaleString(
                                  locale === "zh" ? "zh-CN" : "en-US",
                                )}
                              </span>
                              <small>{item.userId}</small>
                            </td>
                            <td>
                              {item.action === "grant"
                                ? t("Granted", "授予")
                                : t("Revoked", "撤销")}
                            </td>
                            <td>
                              <span>{item.actor}</span>
                              <p>{item.reason}</p>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.audit.length && (
                      <p className={styles.empty}>
                        {t(
                          "No permission changes recorded.",
                          "尚无权限变更记录。",
                        )}
                      </p>
                    )}
                  </div>
                  <div className={styles.pagination}>
                    <Button
                      variant="outline"
                      disabled={auditPage === 1}
                      onClick={() => {
                        setLoading(true);
                        setAuditPage((n) => n - 1);
                      }}
                    >
                      {t("Previous audit page", "上一页审计")}
                    </Button>
                    <span>{auditPage}</span>
                    <Button
                      variant="outline"
                      disabled={data.audit.length < 25}
                      onClick={() => {
                        setLoading(true);
                        setAuditPage((n) => n + 1);
                      }}
                    >
                      {t("Next audit page", "下一页审计")}
                    </Button>
                  </div>
                </>
              )
            )}
          </>
        )}
        <WorkspaceDialog
          open={!!target}
          onOpenChange={(open) => {
            if (!open && !saving) setTarget(null);
          }}
          title={
            target?.admin
              ? t("Revoke administrator", "撤销管理员权限")
              : t("Grant administrator", "授予管理员权限")
          }
          description={target ? `${target.name} · ${target.email}` : ""}
          closeLabel={t("Close", "关闭")}
        >
          <p className={styles.accountId}>{target?.id}</p>
          <label className={styles.reason}>
            {t("Reason", "理由")}
            <textarea
              value={reason}
              minLength={8}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
            />
          </label>
          <p className={styles.hint}>
            {t(
              "Record a reason of at least 8 characters. Revocations apply to the next request.",
              "请记录至少 8 个字符的理由。撤销将在下一次请求生效。",
            )}
          </p>
          {notice && <p role="alert">{notice}</p>}
          <div className={styles.actions}>
            <Button
              disabled={saving || reason.trim().length < 8}
              onClick={changeRole}
            >
              {saving
                ? t("Saving…", "正在保存…")
                : t("Confirm change", "确认修改")}
            </Button>
            <Button
              variant="outline"
              disabled={saving}
              onClick={() => setTarget(null)}
            >
              {t("Cancel", "取消")}
            </Button>
          </div>
        </WorkspaceDialog>
      </main>
      <AppFooter />
    </>
  );
}
