"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  FolderInput,
  FolderOutput,
  Share2,
  Copy,
  Check,
  Trash2,
  SlidersHorizontal,
  ChevronDown,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { Button } from "@/components/ui/button";
import { ChoiceSelect } from "@/components/ui/choice-select";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { readCollections } from "@/lib/saved/collections";
import { readLocalItems } from "@/lib/saved/local";
import { exportPlanningFavorites } from "@/lib/saved/planning-export";
import { withSavedMutation } from "@/lib/saved/mutations";
import { savedScope } from "@/lib/saved/scope";
import {
  itemKey,
  exchangeItemSchema,
  type ExchangeItem,
} from "@/lib/saved/exchange";
import type { SavedCollection } from "@/lib/saved/collection-schema";
import { copyLink, sharingDate } from "@/lib/saved/share-links";
import {
  favoritePlanCourses,
  importFavoriteCourses,
} from "@/lib/planning/favorites";
import {
  boardCourses,
  nextSemester,
  semesterLabel,
  semesterCampus,
} from "@/lib/planning/workspace";
import { termOrder } from "@/lib/planning/schedule";
import { semesterCatalogCode } from "@/lib/planning/simulation";
import { planShareSnapshot } from "@/lib/planning/share-snapshot";
import type { Plan } from "@/lib/planning/model";
import { browserUuid } from "@/lib/uuid";
import { text, type Locale } from "@/lib/i18n";
import { usePlanningCatalog } from "./course-catalog";
import styles from "./plan-tools.module.css";
type Share = {
  id: string;
  title: string;
  capability: string;
  expiresAt: string | null;
};
function subscribeFavorites(notify: () => void) {
  window.addEventListener("course-atlas:preferences", notify);
  return () => window.removeEventListener("course-atlas:preferences", notify);
}
export function PlanningExchange({
  plan,
  title,
  account,
  locale,
  update,
  disabled,
  contextTerm,
}: {
  plan: Plan;
  title: string;
  account: string | null;
  locale: Locale;
  update: (edit: (p: Plan) => Plan) => void;
  disabled: boolean;
  contextTerm?: string;
}) {
  const t = (en: string, zh: string) => text(locale, en, zh);
  const { reader } = usePlanningCatalog();
  const favoritesAccount = useSyncExternalStore(
    subscribeFavorites,
    savedScope,
    () => null,
  );
  const favoritesReady = !account || favoritesAccount === account;
  const [mode, setMode] = useState<"import" | "export" | "share" | null>(null);
  const [items, setItems] = useState<ExchangeItem[]>([]);
  const [folders, setFolders] = useState<SavedCollection[]>([]);
  const [folder, setFolder] = useState("all");
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [term, setTerm] = useState(nextSemester);
  const [newName, setNewName] = useState(title.slice(0, 60));
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shareTitle, setShareTitle] = useState(title.slice(0, 60));
  const [shareTerms, setShareTerms] = useState<string[] | null>(null);
  const [expiry, setExpiry] = useState("604800");
  const [shares, setShares] = useState<Share[]>([]);
  const [created, setCreated] = useState<Share | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const rows = boardCourses(plan).filter(
    (r) => r.course.kind === "course" && r.course.subject && r.course.number,
  );
  const terms = [
    ...new Set([
      ...plan.schedule.terms,
      ...rows.map((r) => r.term),
      ...(contextTerm ? [contextTerm] : []),
    ]),
  ]
    .filter((s) => /^(Autumn|Spring|Summer)20\d{2}$/.test(s))
    .sort(termOrder);
  const importTerms = [...new Set([...terms, nextSemester()])].sort(termOrder);
  const visibleItems =
    folder === "all"
      ? items
      : items.filter((item) =>
          folders.find((f) => f.id === folder)?.members.includes(itemKey(item)),
        );
  const importCourses = favoritePlanCourses(visibleItems);
  const selected = chosen ?? new Set(importCourses.map((c) => c.key));
  const selectedTerms = contextTerm ? [contextTerm] : (shareTerms ?? terms);
  const url = (share: Share) =>
    location.origin + "/planning/share/" + share.id + "#k=" + share.capability;
  async function loadShares(signal?: AbortSignal) {
    const response = await fetch("/api/planning/shares", { signal });
    if (!response.ok) throw Error();
    const body = await response.json();
    if (!signal?.aborted) setShares(body.shares);
  }
  function open(next: typeof mode) {
    setNewName(title.slice(0, 60));
    setShareTitle(title.slice(0, 60));
    setShareTerms(null);
    setExpiry("604800");
    setNotice("");
    setCreated(null);
    setMode(next);
    setChosen(null);
    setFolder(next === "export" ? "new" : "all");
    setTerm(contextTerm ?? (next === "import" ? nextSemester() : "all"));
    try {
      setItems(readLocalItems());
      setFolders(readCollections());
    } catch {
      setNotice(
        t(
          "Saved items could not be read. Please retry.",
          "无法读取收藏，请重试。",
        ),
      );
    }
    if (next === "share" && account) {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      void loadShares(request.signal).catch(() => {
        if (!request.signal.aborted)
          setNotice(
            t(
              "Sharing is unavailable. Please retry.",
              "暂时无法读取分享，请重试。",
            ),
          );
      });
    }
  }
  function importCoursesNow() {
    try {
      // Read again at the click, so removed favorites are not silently reintroduced.
      const live = readLocalItems().filter((item) =>
        selected.has(itemKey(item)),
      );
      let outcome = { added: 0, skipped: 0 };
      update((current) => {
        const result = importFavoriteCourses(current, live, term, browserUuid);
        outcome = result;
        return result.plan;
      });
      setNotice(
        t(
          outcome.added +
            " courses imported · " +
            outcome.skipped +
            " already planned",
          "已导入 " +
            outcome.added +
            " 门课程 · " +
            outcome.skipped +
            " 门已在规划中",
        ),
      );
    } catch {
      setNotice(
        t(
          "Import failed. Your existing plan is retained.",
          "导入失败，现有规划已保留。",
        ),
      );
    }
  }
  async function exportCourses() {
    setBusy(true);
    setNotice("");
    const scope = savedScope(),
      abort = new AbortController();
    controller.current?.abort();
    controller.current = abort;
    try {
      const target = rows.filter((r) => term === "all" || r.term === term);
      const missing: string[] = [],
        incoming: ExchangeItem[] = [];
      await Promise.all(
        target.map(async (row) => {
          try {
            const detail = await reader.read(
              {
                subject: row.course.subject!,
                number: row.course.number!,
                term: /^(Autumn|Spring|Summer)20\d{2}$/.test(row.term)
                  ? semesterCatalogCode(row.term)
                  : "",
                campus: semesterCampus(plan, row.term),
              },
              abort.signal,
            );
            if (
              (/^(Autumn|Spring|Summer)20\d{2}$/.test(row.term) &&
                detail.course.termCode !== semesterCatalogCode(row.term)) ||
              detail.course.campusCode.toUpperCase() !==
                semesterCampus(plan, row.term)
            )
              throw Error("offering_mismatch");
            incoming.push(
              exchangeItemSchema.parse({
                kind: "course",
                payload: detail.course,
              }),
            );
          } catch {
            missing.push(row.course.subject + " " + row.course.number);
          }
        }),
      );
      if (abort.signal.aborted) return;
      if (!incoming.length) throw Error();
      const unique = [
        ...new Map(incoming.map((item) => [itemKey(item), item])).values(),
      ];
      await withSavedMutation(() => {
        if (scope !== savedScope()) throw Error("account_changed");
        exportPlanningFavorites(
          unique,
          folder === "new"
            ? { id: browserUuid(), name: newName }
            : { id: folder },
        );
      });
      setFolders(readCollections());
      setNotice(
        t(
          unique.length + " courses saved to the folder.",
          "已将 " + unique.length + " 门课程转存至收藏夹。",
        ) +
          (missing.length
            ? t(
                " Unavailable in the catalog: ",
                " 以下课程目录暂不可用，尚未转存：",
              ) + missing.join(", ")
            : ""),
      );
    } catch {
      if (!abort.signal.aborted)
        setNotice(
          t(
            "Export failed. Check the course catalog, folder limit and available storage.",
            "转存失败，请检查课程目录、收藏夹数量上限和存储空间。",
          ),
        );
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/planning/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          snapshot: planShareSnapshot(plan, shareTitle, selectedTerms),
          expiresIn: Number(expiry),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setNotice(
          response.status === 401 || response.status === 403
            ? t(
                "Sign in and verify your OSU identity in Account to publish.",
                "请登录，并在账号中完成 OSU 身份验证后分享。",
              )
            : body.error === "share_capacity"
              ? t(
                  "Share limit reached. Revoke an old link first.",
                  "分享数量已达上限，请先撤销旧链接。",
                )
              : t("Sharing failed. Please retry.", "分享失败，请重试。"),
        );
        return;
      }
      const share = (await response.json()) as Share;
      setCreated(share);
      await loadShares().catch(() => {});
    } catch {
      setNotice(
        t("Sharing is unavailable. Please retry.", "分享暂不可用，请重试。"),
      );
    } finally {
      setBusy(false);
    }
  }
  async function revoke(id: string) {
    setBusy(true);
    try {
      const response = await fetch("/api/planning/shares", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!response.ok) throw Error();
      setShares((current) => current.filter((s) => s.id !== id));
      if (created?.id === id) setCreated(null);
      setNotice(t("Link revoked", "链接已撤销"));
    } catch {
      setNotice(t("Could not revoke. Please retry.", "撤销失败，请重试。"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div
        className={styles.tools}
        data-planning-tools
        data-global={!contextTerm || undefined}
        data-scoped={!!contextTerm || undefined}
        data-telemetry-private
      >
        <Button
          variant="outline"
          disabled={disabled || !favoritesReady}
          aria-label={
            t("Import favorites", "从收藏导入") +
            (contextTerm ? " · " + semesterLabel(contextTerm, locale) : "")
          }
          onClick={() => open("import")}
        >
          <FolderInput size={15} />
          <span data-scoped-action-label>
            {contextTerm
              ? t("Import favorites", "收藏导入")
              : t("Import favorites", "从收藏导入")}
          </span>
        </Button>
        <Button
          variant="outline"
          disabled={
            disabled ||
            !favoritesReady ||
            !rows.some((r) => !contextTerm || r.term === contextTerm)
          }
          aria-label={
            t("Save to a folder", "转存至收藏夹") +
            (contextTerm ? " · " + semesterLabel(contextTerm, locale) : "")
          }
          onClick={() => open("export")}
        >
          <FolderOutput size={15} />
          <span data-scoped-action-label>
            {contextTerm
              ? t("Save favorites", "转存收藏")
              : t("Save to a folder", "转存至收藏夹")}
          </span>
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          aria-label={
            t("Share semester plan", "分享学期规划") +
            (contextTerm ? " · " + semesterLabel(contextTerm, locale) : "")
          }
          onClick={() => open("share")}
        >
          <Share2 size={15} />
          <span data-scoped-action-label>
            {contextTerm
              ? t("Share semester", "分享学期")
              : t("Share semester plan", "分享学期规划")}
          </span>
        </Button>
      </div>
      {!contextTerm ? (
        <div className={styles.mobileTools} data-mobile-planning-tools>
          <DropdownMenu.Root modal>
            <DropdownMenu.Trigger asChild>
              <button
                className={`${styles.navButton} ${styles.toolsTrigger}`}
                disabled={disabled}
                aria-label={t("Planning tools", "规划工具")}
              >
                <SlidersHorizontal size={14} />
                <span>{t("Tools", "工具")}</span>
                <ChevronDown size={12} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className={styles.navMenu}
                align="end"
                sideOffset={8}
                collisionPadding={12}
                data-telemetry-private
              >
                <DropdownMenu.Item
                  className={styles.navItem}
                  disabled={!favoritesReady}
                  onSelect={() => setTimeout(() => open("import"), 0)}
                >
                  <FolderInput size={14} />
                  {t("Import favorites", "收藏导入")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.navItem}
                  disabled={!favoritesReady || !rows.length}
                  onSelect={() => setTimeout(() => open("export"), 0)}
                >
                  <FolderOutput size={14} />
                  {t("Save favorites", "转存收藏")}
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={styles.navItem}
                  onSelect={() => setTimeout(() => open("share"), 0)}
                >
                  <Share2 size={14} />
                  {t("Share semester plan", "分享学期规划")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      ) : null}
      <WorkspaceDialog
        key={mode ?? "closed"}
        open={!!mode}
        onOpenChange={(open) => {
          if (!open && !busy) {
            controller.current?.abort();
            setMode(null);
          }
        }}
        title={
          mode === "import"
            ? t("Import favorite courses", "导入收藏课程")
            : mode === "export"
              ? t("Save planned courses", "转存规划课程")
              : t("Share semester plan", "分享学期规划")
        }
        description={
          mode === "import"
            ? t(
                "Choose a folder or individual courses, then a destination semester.",
                "选择收藏夹或其中的课程，再选择目标学期。",
              )
            : mode === "export"
              ? t(
                  "Save official course listings into a new or existing folder.",
                  "将规划中的官方课程转存到新建或已有收藏夹。",
                )
              : t(
                  "Share all semesters or a selection. Recipients can save their own copy.",
                  "分享全部或指定学期，对方可以一键转存为自己的独立方案。",
                )
        }
        closeLabel={t("Close", "关闭")}
        guard={mode !== "import" && !created && !notice}
        detectFormChanges={false}
        dirty={
          mode === "share"
            ? shareTitle !== title.slice(0, 60) ||
              expiry !== "604800" ||
              shareTerms !== null
            : mode === "export"
              ? newName !== title.slice(0, 60)
              : false
        }
      >
        <div className={styles.form} data-telemetry-private>
          {contextTerm ? (
            <p>
              <strong>
                {semesterLabel(contextTerm, locale)} ·{" "}
                {semesterCampus(plan, contextTerm)}
              </strong>
              {" · "}
              {t(
                "This action applies only to this semester.",
                "本次操作仅适用于这个学期。",
              )}
            </p>
          ) : null}
          {mode === "import" ? (
            <>
              <label>
                {t("Source folder", "来源收藏夹")}
                <ChoiceSelect
                  value={folder}
                  onValueChange={(value) => {
                    setFolder(value);
                    setChosen(null);
                  }}
                >
                  <option value="all">{t("All favorites", "全部收藏")}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <label>
                {t("Destination semester", "目标学期")}
                <ChoiceSelect
                  value={term}
                  onValueChange={setTerm}
                  disabled={!!contextTerm}
                >
                  {(contextTerm ? [contextTerm] : importTerms).map((s) => (
                    <option key={s} value={s}>
                      {semesterLabel(s, locale)}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <div className={styles.actions}>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setChosen(new Set(importCourses.map((c) => c.key)))
                  }
                >
                  {t("Select entire folder", "选择整个收藏夹")}
                </Button>
                <Button variant="ghost" onClick={() => setChosen(new Set())}>
                  {t("Clear selection", "取消全选")}
                </Button>
              </div>
              <ul className={styles.checkList}>
                {importCourses.map((c) => (
                  <li key={c.key}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.has(c.key)}
                        onChange={() => {
                          const next = new Set(selected);
                          if (!next.delete(c.key)) next.add(c.key);
                          setChosen(next);
                        }}
                      />
                      <span>
                        <strong>
                          {c.subject} {c.number}
                        </strong>
                        <span>{c.title}</span>
                        <small>
                          {c.term} · {c.campus}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {!importCourses.length ? (
                <p>
                  {t(
                    "No course favorites in this folder. Save courses or sections first.",
                    "这个收藏夹中没有课程，请先收藏课程或班次。",
                  )}
                </p>
              ) : null}
              <Button
                disabled={!selected.size || disabled}
                onClick={importCoursesNow}
              >
                <Check size={15} />
                {t("Import selected courses", "导入所选课程")} · {selected.size}
              </Button>
            </>
          ) : mode === "export" ? (
            <>
              <label>
                {t("Courses from", "转存范围")}
                <ChoiceSelect
                  value={term}
                  onValueChange={setTerm}
                  disabled={!!contextTerm}
                >
                  {!contextTerm ? (
                    <option value="all">
                      {t("All courses in this plan", "当前方案的全部课程")}
                    </option>
                  ) : null}
                  {(contextTerm ? [contextTerm] : terms).map((s) => (
                    <option key={s} value={s}>
                      {semesterLabel(s, locale)}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              <label>
                {t("Destination folder", "目标收藏夹")}
                <ChoiceSelect value={folder} onValueChange={setFolder}>
                  <option value="new">
                    {t("Create a new folder", "新建收藏夹")}
                  </option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </ChoiceSelect>
              </label>
              {folder === "new" ? (
                <label>
                  {t("Folder name", "收藏夹名称")}
                  <input
                    maxLength={60}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </label>
              ) : null}
              <p>
                {rows.filter((r) => term === "all" || r.term === term).length}{" "}
                {t(
                  "courses. Existing favorites and folder contents are retained.",
                  "门课程。已有收藏与收藏夹内容会保留。",
                )}
              </p>
              <Button
                disabled={busy || (folder === "new" && !newName.trim())}
                onClick={() => void exportCourses()}
              >
                <FolderOutput size={15} />
                {busy
                  ? t("Saving…", "正在转存…")
                  : t("Save courses to folder", "转存课程至收藏夹")}
              </Button>
            </>
          ) : mode === "share" ? (
            <>
              <p>
                {t(
                  "This snapshot contains the selected semesters, campuses and courses. Anyone with its complete link can open it until it expires or you revoke it.",
                  "快照包含所选学期、校区与课程。任何持有完整链接的人，都可在到期或撤销前查看。",
                )}
              </p>
              <label>
                {t("Share title", "分享标题")}
                <input
                  maxLength={60}
                  value={shareTitle}
                  onChange={(e) => setShareTitle(e.target.value)}
                />
              </label>
              {!contextTerm ? (
                <div className={styles.actions}>
                  <Button variant="ghost" onClick={() => setShareTerms(terms)}>
                    {t("All semesters", "全部学期")}
                  </Button>
                  <Button variant="ghost" onClick={() => setShareTerms([])}>
                    {t("Clear selection", "取消全选")}
                  </Button>
                </div>
              ) : null}
              <ul className={styles.checkList}>
                {(contextTerm ? [contextTerm] : terms).map((s) => (
                  <li key={s}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selectedTerms.includes(s)}
                        disabled={!!contextTerm}
                        onChange={() =>
                          setShareTerms(
                            selectedTerms.includes(s)
                              ? selectedTerms.filter((x) => x !== s)
                              : [...selectedTerms, s],
                          )
                        }
                      />
                      <span>
                        <strong>{semesterLabel(s, locale)}</strong>
                        <small>
                          {rows.filter((r) => r.term === s).length}{" "}
                          {t("courses", "门课程")} · {semesterCampus(plan, s)}
                        </small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {!terms.length ? (
                <p>
                  {t(
                    "Add a semester and courses before sharing.",
                    "请先添加学期与课程。",
                  )}
                </p>
              ) : null}
              <label>
                {t("Link expires", "链接有效期")}
                <ChoiceSelect value={expiry} onValueChange={setExpiry}>
                  <option value="86400">{t("1 day", "1 天")}</option>
                  <option value="604800">{t("7 days", "7 天")}</option>
                  <option value="2592000">{t("30 days", "30 天")}</option>
                  <option value="0">{t("Until revoked", "直到撤销")}</option>
                </ChoiceSelect>
              </label>
              {!account ? (
                <p>
                  <a href="/account">
                    {t("Sign in to publish this plan", "登录后发布这个规划")}
                  </a>
                </p>
              ) : null}
              <Button
                disabled={
                  !account ||
                  busy ||
                  !selectedTerms.length ||
                  !shareTitle.trim()
                }
                onClick={() => void publish()}
              >
                <Share2 size={15} />
                {busy
                  ? t("Publishing…", "正在发布…")
                  : t("Create share link", "生成分享链接")}
              </Button>
              {created ? (
                <div className={styles.result}>
                  <a href={url(created)} target="_blank" rel="noreferrer">
                    {t("Open shared plan", "打开分享页")}
                  </a>
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void copyLink(url(created)).then((ok) =>
                        setNotice(
                          ok
                            ? t("Link copied", "链接已复制")
                            : t(
                                "Open the shared page to copy its URL.",
                                "请打开分享页复制地址。",
                              ),
                        ),
                      )
                    }
                  >
                    <Copy size={14} />
                    {t("Copy link", "复制链接")}
                  </Button>
                </div>
              ) : null}
              {shares.length ? (
                <div className={styles.shareList}>
                  <strong>{t("Active links", "有效分享链接")}</strong>
                  {shares.map((s) => (
                    <div key={s.id} className={styles.shareRow}>
                      <span>
                        {s.title}
                        <small>{sharingDate(s.expiresAt, locale)}</small>
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        aria-label={t("Copy link", "复制链接") + " " + s.title}
                        onClick={() =>
                          void copyLink(url(s)).then((ok) =>
                            setNotice(
                              ok
                                ? t("Link copied", "链接已复制")
                                : t("Copy unavailable", "暂时无法复制"),
                            ),
                          )
                        }
                      >
                        <Copy size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={busy}
                        aria-label={
                          t("Revoke link", "撤销链接") + " " + s.title
                        }
                        onClick={() => void revoke(s.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
          {notice ? (
            <p className={styles.result} role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </WorkspaceDialog>
    </>
  );
}
