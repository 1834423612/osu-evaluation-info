"use client";
import { notify } from "@/lib/notify";
import { ShareFolderPicker } from "./share-folder-picker";
import { useState } from "react";
import {
  Share2,
  Copy,
  ExternalLink,
  Link2,
  FolderOpen,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLocalSnapshot } from "@/lib/saved/local";
import { readCollections } from "@/lib/saved/collections";
import {
  shareGroups,
  initialShareSelection,
  projectShareSelection,
  shareSelectionFingerprint,
  type ShareGroup,
  type ShareSelection,
} from "@/lib/saved/share-selection";
import { itemKey, type SavedSnapshot } from "@/lib/saved/exchange";
import {
  rememberShare,
  shareLink,
  copyLink,
  ensureActorSession,
  browserRequestId,
  sharingDate,
} from "@/lib/saved/share-links";
import { text, type Locale } from "@/lib/i18n";
import styles from "@/components/ui/workspace.module.css";
import layout from "./share-composer.module.css";
type Created = {
  id: string;
  capability: string | null;
  management: string;
  code: string | null;
  expiresAt: string | null;
};
export function ShareCollection({
  locale,
  selected,
  activeCollectionId,
  title,
}: {
  locale: Locale;
  selected?: Set<string>;
  activeCollectionId?: string;
  title?: string;
}) {
  const [groups, setGroups] = useState<ShareGroup[]>([]);
  const [selection, setSelection] = useState<ShareSelection>({});
  const [baseline, setBaseline] = useState("");
  const [includeFolders, setIncludeFolders] = useState(true),
    [showAuthor, setShowAuthor] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [attempted, setAttempted] = useState(false);
  const [open, setOpen] = useState(false),
    [snapshot, setSnapshot] = useState<SavedSnapshot | null>(null),
    [visibility, setVisibility] = useState<"link" | "public">("link"),
    [expiry, setExpiry] = useState("604800"),
    [created, setCreated] = useState<Created | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  function begin() {
    try {
      const next = createLocalSnapshot(
        title?.trim() || text(locale, "Shared collection", "分享的收藏"),
      );
      if (!next.items.length) throw Error();
      const folders = shareGroups(next.items, readCollections());
      folders.sort(
        (a, b) =>
          Number(b.id === activeCollectionId) -
          Number(a.id === activeCollectionId),
      );
      const choices = initialShareSelection(
        folders,
        selected ?? new Set(),
        activeCollectionId,
      );
      setGroups(folders);
      setSelection(choices);
      setSnapshot(next);
      setBaseline(
        JSON.stringify([
          next.title,
          shareSelectionFingerprint(choices),
          true,
          false,
          "link",
          "604800",
        ]),
      );
      setRequestId(browserRequestId());
      setAttempted(false);
      setIncludeFolders(true);
      setShowAuthor(false);
      setVisibility("link");
      setCreated(null);
      setNotice("");
      setOpen(true);
    } catch {
      setNotice(
        text(
          locale,
          "Select at least one readable saved item.",
          "请先选择可读取的收藏项目。",
        ),
      );
    }
  }
  const projected = projectShareSelection(groups, selection);
  const picked = projected.keys;
  const dirty =
    !!snapshot &&
    baseline !==
      JSON.stringify([
        snapshot.title,
        shareSelectionFingerprint(selection),
        includeFolders,
        showAuthor,
        visibility,
        expiry,
      ]);
  async function create() {
    setBusy(true);
    setAttempted(true);
    setNotice("");
    try {
      await ensureActorSession();
      const response = await fetch("/api/shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          showAuthor,
          snapshot: snapshot
            ? {
                ...snapshot,
                items: snapshot.items.filter((x) => picked.has(itemKey(x))),
                ...(includeFolders
                  ? {
                      collections: projected.collections,
                    }
                  : {}),
              }
            : null,
          requestId,
          visibility,
          expiresIn: Number(expiry),
        }),
      });
      if (!response.ok)
        throw Error((await response.json()).error ?? "unavailable");
      const data: Created = await response.json();
      setCreated(data);
      rememberShare({
        id: data.id,
        url: shareLink(location.origin, data.id, data.capability),
        management: data.management,
        title: snapshot!.title,
        expiresAt: data.expiresAt,
      });
      const copied = await copyLink(
        shareLink(location.origin, data.id, data.capability),
      );
      notify(
        copied
          ? text(locale, "Link copied", "链接已复制")
          : text(
              locale,
              "Select and copy the link below.",
              "请选择下方链接后复制。",
            ),
        copied ? "success" : "info",
      );
    } catch (error) {
      setNotice(
        text(
          locale,
          error instanceof Error &&
            ["institution_required", "unauthorized"].includes(error.message)
            ? "Sign in and verify your school email to share permanent links, folders or your nickname."
            : "Sharing is unavailable or the limit was reached. Local export remains available.",
          error instanceof Error &&
            ["institution_required", "unauthorized"].includes(error.message)
            ? "分享长期链接、文件夹或昵称前，请先登录并验证学校邮箱。"
            : "分享服务暂不可用或已达上限，仍可导出本地文件。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const url = created
    ? shareLink(
        typeof location === "undefined" ? "" : location.origin,
        created.id,
        created.capability,
      )
    : "";
  return (
    <>
      <Button variant="outline" onClick={begin}>
        <Share2 size={14} />
        {activeCollectionId
          ? text(locale, "Share this folder", "分享此分类")
          : text(locale, "Choose sharing contents", "选择分享内容")}
        {selected?.size ? " (" + selected.size + ")" : ""}
      </Button>
      {notice && !open ? (
        <span className={styles.muted} role="status">
          {notice}
        </span>
      ) : null}
      <WorkspaceDialog
        wide={!created}
        guard={!created}
        dirty={dirty}
        detectFormChanges={false}
        open={open}
        onOpenChange={(value) => {
          setOpen(value);
          if (!value) setNotice("");
        }}
        title={text(locale, "Share your collections", "分享收藏分类")}
        description={text(
          locale,
          "Select whole folders or expand them to choose individual items.",
          "整组选中分类，也可展开后只分享其中部分内容。",
        )}
        closeLabel={text(locale, "Close", "关闭")}
      >
        {notice ? (
          <p role="status" className={styles.notice}>
            {notice}
          </p>
        ) : null}
        {!created ? (
          <div className={layout.composer}>
            <ShareFolderPicker
              groups={groups}
              selection={selection}
              onChange={setSelection}
              locale={locale}
              activeId={activeCollectionId}
              disabled={attempted}
            />
            <aside
              className={layout.settings}
              aria-label={text(
                locale,
                "Sharing settings and preview",
                "分享设置与预览",
              )}
            >
              <h3>
                <Settings2 size={16} />
                {text(locale, "Link settings", "链接设置")}
              </h3>
              <label className={styles.fields}>
                {text(locale, "Share title", "分享标题")}
                <input
                  className={styles.input}
                  disabled={attempted}
                  maxLength={80}
                  value={snapshot?.title ?? ""}
                  onChange={(event) =>
                    setSnapshot((current) =>
                      current
                        ? { ...current, title: event.target.value }
                        : current,
                    )
                  }
                />
              </label>
              <div className={layout.switches}>
                <Button
                  variant="outline"
                  disabled={attempted}
                  aria-pressed={visibility === "link"}
                  onClick={() => setVisibility("link")}
                >
                  <Link2 size={14} />
                  {text(locale, "Link", "分享链接")}
                </Button>
                <Button
                  variant="outline"
                  disabled={attempted}
                  aria-pressed={visibility === "public"}
                  onClick={() => setVisibility("public")}
                >
                  <Share2 size={14} />
                  {text(locale, "Link + code", "链接与分享码")}
                </Button>
              </div>
              {visibility === "public" ? (
                <small>
                  {text(
                    locale,
                    "Anyone can look up the code for 24 hours. The link uses the expiry below.",
                    "公开码可被任何人查询，24 小时后失效；链接按下方有效期保留。",
                  )}
                </small>
              ) : null}
              <div className={styles.fields}>
                <span>{text(locale, "Link expires after", "链接有效期")}</span>
                <Select
                  value={expiry}
                  onValueChange={setExpiry}
                  disabled={attempted}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={styles.floatingChoice}>
                    {[
                      ["3600", "1 hour", "1 小时"],
                      ["86400", "24 hours", "24 小时"],
                      ["604800", "7 days", "7 天"],
                      ["2592000", "30 days", "30 天"],
                      ["0", "Until revoked", "长期有效，直到撤销"],
                    ].map(([value, en, zh]) => (
                      <SelectItem key={value} value={value}>
                        {text(locale, en, zh)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <label className={layout.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={includeFolders}
                  disabled={attempted}
                  onChange={(event) => setIncludeFolders(event.target.checked)}
                />
                <span>
                  {text(
                    locale,
                    "Keep selected folder structure",
                    "保留所选分类结构",
                  )}
                  <small>
                    {text(
                      locale,
                      "Shares their names, icons and tags. Other folders stay private.",
                      "分享所选分类的名称、图标与标签，其他分类不会公开。",
                    )}
                  </small>
                </span>
              </label>
              <label className={layout.option}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={showAuthor}
                  disabled={attempted}
                  onChange={(event) => setShowAuthor(event.target.checked)}
                />
                <span>
                  {text(locale, "Show my account nickname", "显示我的账号昵称")}
                </span>
              </label>
              <section className={layout.summary} aria-live="polite">
                <strong>
                  <FolderOpen
                    size={15}
                    style={{ display: "inline", marginRight: 6 }}
                  />
                  {includeFolders
                    ? text(
                        locale,
                        `${projected.collections.length} folders · ${picked.size} items`,
                        `${projected.collections.length} 个分类 · ${picked.size} 项内容`,
                      )
                    : text(
                        locale,
                        `${picked.size} items`,
                        `${picked.size} 项内容`,
                      )}
                </strong>
                <p>
                  {text(
                    locale,
                    "Recipients can preview and copy their own selection.",
                    "接收者可预览分类，再勾选需要的内容转存。",
                  )}
                  {projected.duplicates
                    ? text(
                        locale,
                        " Items in multiple folders are copied once.",
                        " 重复归类的项目只转存一次。",
                      )
                    : ""}
                </p>
                {includeFolders && projected.collections.length ? (
                  <ul>
                    {projected.collections.map((folder) => (
                      <li key={folder.id}>
                        {folder.name} · {folder.members.length}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {(includeFolders && projected.collections.length > 0) ||
                showAuthor ||
                expiry === "0" ? (
                  <p>
                    {text(
                      locale,
                      "Requires a verified school email.",
                      "此分享需要登录并验证学校邮箱。",
                    )}
                  </p>
                ) : null}
              </section>
              <Button
                className={layout.submit}
                disabled={busy || !snapshot?.title.trim() || !picked.size}
                onClick={() => void create()}
              >
                <Share2 size={15} />
                {busy
                  ? text(locale, "Creating…", "正在创建…")
                  : attempted
                    ? text(locale, "Retry same share", "重试这份分享")
                    : text(
                        locale,
                        `Create share · ${picked.size} items`,
                        `创建分享 · ${picked.size} 项`,
                      )}
              </Button>
              {attempted && !busy ? (
                <div className={layout.retry}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRequestId(browserRequestId());
                      setAttempted(false);
                      setNotice("");
                    }}
                  >
                    {text(locale, "Edit selection", "修改分享内容")}
                  </Button>
                  <small>
                    {text(
                      locale,
                      "Starts a new request; the previous attempt may have created a link.",
                      "修改后作为新请求提交；上次请求可能已生成链接。",
                    )}
                  </small>
                </div>
              ) : null}
            </aside>
          </div>
        ) : (
          <>
            <label className={styles.fields}>
              {text(locale, "Share link", "分享链接")}
              <input
                className={styles.input}
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
              />
            </label>
            {created.code ? (
              <div className={styles.notice}>
                <strong className={styles.code}>{created.code}</strong>
                <small>
                  {text(
                    locale,
                    "Public code · up to 24 hours",
                    "公开分享码 · 最长 24 小时",
                  )}
                </small>
              </div>
            ) : null}
            <p className={styles.muted}>
              {text(locale, "Expires", "到期")} ·{" "}
              {sharingDate(created.expiresAt, locale)}
            </p>
            <div className={styles.tools}>
              <Button
                onClick={() =>
                  void copyLink(url).then((ok) =>
                    setNotice(
                      ok
                        ? text(locale, "Link copied", "链接已复制")
                        : text(
                            locale,
                            "Select and copy the link above.",
                            "请选择上方链接并复制。",
                          ),
                    ),
                  )
                }
              >
                <Copy size={14} />
                {text(locale, "Copy link", "复制链接")}
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  window.open(url, "_blank", "noopener,noreferrer")
                }
              >
                <ExternalLink size={14} />
                {text(locale, "Open", "打开")}
              </Button>
            </div>
          </>
        )}
      </WorkspaceDialog>
    </>
  );
}
