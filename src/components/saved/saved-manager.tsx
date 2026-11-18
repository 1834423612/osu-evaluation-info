"use client";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { useSavedWorkspace } from "./saved-workspace";
import { SelectionCheckbox } from "./selection-checkbox";
import { TransferSender } from "@/components/transfer/transfer-sender";
import { SharedManagement } from "@/components/sharing/shared-management";
import { ShareCollection } from "@/components/sharing/share-collection";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CollectionOrganizer } from "./collection-organizer";
import {
  readCollections,
  assignCollection,
  editCollections,
} from "@/lib/saved/collections";

import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import layout from "./collections.module.css";
import { savedScope } from "@/lib/saved/scope";
import {
  Download,
  Upload,
  SlidersHorizontal,
  Trash2,
  RotateCcw,
  ExternalLink,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { withSavedMutation } from "@/lib/saved/mutations";
import { CollectionImport } from "@/components/sharing/collection-import";
import { text, type Locale } from "@/lib/i18n";
import {
  createLocalSnapshot,
  createLocalBackup,
  restoreLocalBackup,
  readLocalItems,
  removeLocalItems,
  restoreLocalRemoval,
  type LocalRemoval,
} from "@/lib/saved/local";
import {
  itemKey,
  itemKindName,
  itemTitle,
  itemContext,
  itemHref,
  parseSnapshot,
  type ExchangeItem,
  type SavedSnapshot,
} from "@/lib/saved/exchange";
import styles from "@/components/ui/workspace.module.css";
import { parseLocalBackup, type LocalBackup } from "@/lib/saved/backup-schema";
export function SavedManager({ locale }: { locale: Locale }) {
  const scope = useSyncExternalStore(
    (callback) => {
      window.addEventListener("course-atlas:preferences", callback);
      return () =>
        window.removeEventListener("course-atlas:preferences", callback);
    },
    savedScope,
    () => null,
  );
  return <SavedManagerBody key={scope ?? "guest"} locale={locale} />;
}
function itemSubject(item: ExchangeItem, locale: Locale): string {
  return item.kind === "course"
    ? item.payload.subject
    : item.kind === "section"
      ? item.payload.courseLabel.split(" ")[0]
      : item.kind === "syllabus"
        ? item.payload.entry.subject
        : text(locale, "Instructors", "教师");
}
function SavedManagerBody({ locale }: { locale: Locale }) {
  const file = useRef<HTMLInputElement>(null);
  const {
    collections,
    setCollections,
    active,
    setActive,
    selected,
    setSelected,
    selecting,
    setSelecting,
    compact,
    setCompact,
    items,
    setItems,
    kind,
    setKind,
  } = useSavedWorkspace();
  const [exchange, setExchange] = useState<"import" | "export" | null>(null);
  const [backup, setBackup] = useState<LocalBackup | null>(null);
  const [target, setTarget] = useState(""),
    [sort, setSort] = useState("kind"),
    [managementKind, setManagementKind] = useState("all");
  useDraftGuard(selecting && selected.size > 0);
  const collection = collections.find((x) => x.id === active);
  const scopeKeys = collection ? new Set(collection.members) : undefined;
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<SavedSnapshot | null>(null),
    [undo, setUndo] = useState<LocalRemoval | null>(null),
    [limit, setLimit] = useState(40),
    [title, setTitle] = useState(""),
    [mutating, setMutating] = useState(false);
  useEffect(() => {
    if (!open) return;
    function refresh() {
      try {
        setItems(readLocalItems());
        setCollections(readCollections());
      } catch {
        setNotice(
          text(
            locale,
            "Saved data is unavailable. Original data is kept.",
            "收藏暂不可读，原数据仍保留。",
          ),
        );
      }
    }
    window.addEventListener("course-atlas:preferences", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("course-atlas:preferences", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [open, locale, setItems, setCollections]);
  function chooseCollection(id: string) {
    setActive(id);
    setSelected(new Set());
    setQuery("");
    setLimit(40);
    setTitle(readCollections().find((x) => x.id === id)?.name ?? "");
  }
  async function organize(move = false, detach = false) {
    setMutating(true);
    try {
      await withSavedMutation(() => {
        if (detach)
          editCollections((current) =>
            current.map((x) =>
              x.id === active
                ? {
                    ...x,
                    members: x.members.filter((key) => !actionKeys.has(key)),
                  }
                : x,
            ),
          );
        else
          assignCollection(
            actionKeys,
            target,
            move && active !== "all" ? active : undefined,
          );
      });
      setSelected(new Set());
      setNotice(text(locale, "Collection updated.", "分组已更新。"));
      setOpen(false);
      setSelecting(false);
    } catch {
      setNotice(
        text(
          locale,
          "Collection changed or reached its limit. Try again.",
          "分组已变化或达到上限，请重试。",
        ),
      );
    } finally {
      setMutating(false);
    }
  }
  function manage() {
    try {
      setItems(
        createLocalSnapshot(text(locale, "Saved collection", "收藏清单")).items,
      );
      setCollections(readCollections());
      if (kind === "all") {
        const current = readLocalItems();
        setKind(
          current.some((x) => x.kind === "course")
            ? "course"
            : current.some((x) => x.kind === "section")
              ? "section"
              : current.some((x) => x.kind === "instructor")
                ? "instructor"
                : "syllabus",
        );
      }
      setSelecting(true);
      setOpen(false);
      setNotice("");
    } catch {
      setNotice(
        text(
          locale,
          "Saved data needs repair. Your original data has been kept.",
          "收藏数据暂不可读，原数据已保留。",
        ),
      );
    }
  }
  const liveKeys = new Set(items.map(itemKey));
  const counts = new Map([
    ["all", items.length],
    ...collections.map(
      (x) =>
        [x.id, x.members.filter((key) => liveKeys.has(key)).length] as [
          string,
          number,
        ],
    ),
  ]);
  const filtered = items
    .filter((item) => {
      const key = itemKey(item),
        search = [
          itemTitle(item),
          itemContext(item),
          ...collections
            .filter((x) => x.members.includes(key))
            .flatMap((x) => [x.name, ...x.tags]),
        ]
          .join(" ")
          .toLocaleLowerCase();
      return (
        (!scopeKeys || scopeKeys.has(key)) &&
        ((open ? managementKind : kind) === "all" ||
          (open ? managementKind : kind) === item.kind) &&
        search.includes(query.toLocaleLowerCase().trim())
      );
    })
    .sort((a, b) =>
      sort === "saved"
        ? 0
        : sort === "kind"
          ? a.kind.localeCompare(b.kind) ||
            itemTitle(a).localeCompare(itemTitle(b))
          : (sort === "desc" ? -1 : 1) *
            itemTitle(a).localeCompare(
              itemTitle(b),
              locale === "zh" ? "zh-CN" : "en",
              { numeric: true },
            ),
    );
  function exportItems() {
    try {
      const snapshot = createLocalSnapshot(
        title.trim() || text(locale, "Saved collection", "收藏清单"),
      );
      if (scopeKeys)
        snapshot.items = snapshot.items.filter((x) =>
          scopeKeys.has(itemKey(x)),
        );
      if (selected.size)
        snapshot.items = snapshot.items.filter((x) => selected.has(itemKey(x)));
      if (!snapshot.items.length) {
        setNotice(text(locale, "No items to export.", "没有可导出的收藏。"));
        return;
      }
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(snapshot, null, 2)], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "waho-saved-" + new Date().toISOString().slice(0, 10) + ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice(
        text(
          locale,
          "Export failed. Original data is unchanged.",
          "导出失败，原数据仍保留。",
        ),
      );
    }
  }
  function exportBackup() {
    try {
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(createLocalBackup())], {
            type: "application/json",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download =
        "waho-private-backup-" +
        new Date().toISOString().slice(0, 10) +
        ".json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setNotice(
        text(
          locale,
          "Backup failed. Check storage and the 10 MiB file limit.",
          "备份失败，请检查存储及 10 MiB 文件上限。",
        ),
      );
    }
  }
  async function remove() {
    setMutating(true);
    try {
      const removed = await withSavedMutation(() =>
        removeLocalItems(actionKeys),
      );
      setUndo(removed.keys.length ? removed : null);
      setItems(createLocalSnapshot(title || "Saved collection").items);
      setSelected(new Set());
      setNotice(
        text(
          locale,
          removed.keys.length + " removed",
          removed.keys.length + " 项已移除",
        ),
      );
    } catch {
      setNotice(text(locale, "Could not remove items.", "移除失败。"));
    } finally {
      setMutating(false);
    }
  }
  const displayItems = open
    ? filtered.filter((item) => selected.has(itemKey(item)))
    : filtered;
  const actionKeys = new Set(displayItems.map(itemKey));
  const filterControls = (
    <div className={layout.filters} data-draft-ignore>
      <label>
        {text(locale, "Find saved items or tags", "查找收藏或标签")}
        <input
          className={styles.input}
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(40);
          }}
        />
      </label>
      <label>
        {text(locale, "Type", "类型")}
        <Select
          value={open ? managementKind : kind}
          onValueChange={(value) => {
            (open ? setManagementKind : setKind)(value);
            setLimit(40);
          }}
        >
          <SelectTrigger aria-label={text(locale, "Saved type", "收藏类型")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              {text(locale, "All types", "全部类型")}
            </SelectItem>
            {(["course", "section", "instructor", "syllabus"] as const).map(
              (value) => (
                <SelectItem key={value} value={value}>
                  {itemKindName(value, locale)}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </label>
      <label>
        {text(locale, "Sort", "排序")}
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger
            aria-label={text(locale, "Sort favorites", "收藏排序")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ["saved", "Saved order", "收藏顺序"],
              ["asc", "Title A–Z", "标题升序"],
              ["desc", "Title Z–A", "标题降序"],
              ["kind", "Type", "类型"],
            ].map(([value, en, zh]) => (
              <SelectItem key={value} value={value}>
                {text(locale, en, zh)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
    </div>
  );
  const itemRows = (
    <>
      <ul className={styles.list}>
        {displayItems.slice(0, limit).map((item, index) => {
          const key = itemKey(item),
            href = itemHref(item);
          const subject = itemSubject(item, locale);
          const subjectKeys = displayItems
            .filter(
              (x) =>
                x.kind === item.kind &&
                (x.kind === "course"
                  ? x.payload.subject
                  : x.kind === "section"
                    ? x.payload.courseLabel.split(" ")[0]
                    : x.kind === "syllabus"
                      ? x.payload.entry.subject
                      : text(locale, "Instructors", "教师")) === subject,
            )
            .map(itemKey);
          return (
            <li className={layout.manageItem} key={key}>
              {index === 0 ||
              displayItems[index - 1].kind !== item.kind ||
              itemSubject(displayItems[index - 1], locale) !== subject ? (
                <div className={layout.subjectHeading}>
                  <SelectionCheckbox
                    keys={subjectKeys}
                    selected={selected}
                    onChange={setSelected}
                    label={subject + " · " + subjectKeys.length}
                  />
                </div>
              ) : null}
              <div className={styles.row}>
                <label className={styles.pick}>
                  <input
                    type="checkbox"
                    className={styles.checkbox}
                    checked={selected.has(key)}
                    onChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                  <span>
                    <strong>{itemTitle(item)}</strong>
                    <small>
                      {itemKindName(item.kind, locale)} · {itemContext(item)}
                    </small>
                    <span className={layout.rowTags}>
                      {collections
                        .filter((x) => x.members.includes(key))
                        .map((x) => (
                          <span key={x.id} title={x.name}>
                            {x.name}
                          </span>
                        ))}
                    </span>
                  </span>
                </label>
                {href ? (
                  <Link
                    href={href as Route}
                    aria-label={text(locale, "Open item", "打开项目")}
                  >
                    <ExternalLink size={15} />
                  </Link>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {limit < displayItems.length ? (
        <Button variant="outline" onClick={() => setLimit((x) => x + 40)}>
          {text(locale, "Show more", "显示更多")}
        </Button>
      ) : null}
    </>
  );
  return (
    <section
      className={layout.manager}
      data-telemetry-private
      data-saved-manager
    >
      <div className={styles.tools}>
        <ShareCollection
          locale={locale}
          selected={selected}
          title={collection?.name}
          activeCollectionId={collection?.id}
        />
        <SharedManagement locale={locale} />
        <Button variant="outline" aria-pressed={selecting} onClick={manage}>
          <SlidersHorizontal size={14} />
          {text(locale, "Manage", "管理")}
        </Button>
        <Button variant="outline" onClick={() => setExchange("export")}>
          <Download size={14} />
          {text(locale, "Export", "导出")}
        </Button>
        <Button variant="outline" onClick={() => setExchange("import")}>
          <Upload size={14} />
          {text(locale, "Import", "导入")}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const value = e.target.files?.[0];
            e.target.value = "";
            if (!value) return;
            try {
              if (value.size > 10485760) throw Error();
              const raw = await value.text();
              if (JSON.parse(raw)?.format === "waho-private-backup") {
                setBackup(parseLocalBackup(raw));
                setPreview(null);
              } else {
                setPreview(parseSnapshot(raw));
                setBackup(null);
              }
              setNotice("");
            } catch {
              setNotice(
                text(
                  locale,
                  "Invalid file. Collections allow 1 MiB; private backups allow 10 MiB.",
                  "文件无效；收藏清单上限为 1 MiB，私人备份上限为 10 MiB。",
                ),
              );
            }
          }}
        />
      </div>
      {notice ? (
        <div className={styles.actions}>
          <span className={styles.notice} role="status">
            {notice}
          </span>
          {undo ? (
            <Button
              variant="outline"
              disabled={mutating}
              onClick={async () => {
                setMutating(true);
                try {
                  await withSavedMutation(() => restoreLocalRemoval(undo));
                  setUndo(null);
                  setNotice(text(locale, "Restored", "已恢复"));
                  setItems(readLocalItems());
                } catch {
                  setNotice(
                    text(
                      locale,
                      "Restore failed. Export a backup before freeing space.",
                      "恢复失败，请先导出备份再清理空间。",
                    ),
                  );
                } finally {
                  setMutating(false);
                }
              }}
            >
              <RotateCcw size={14} />
              {text(locale, "Undo", "撤销")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <CollectionOrganizer
        locale={locale}
        collections={collections}
        active={active}
        onActive={chooseCollection}
        counts={counts}
        selected={selected}
      />
      {selecting ? (
        <div className={layout.selectionBar}>
          <span>
            {selected.size} {text(locale, "selected", "项已选")}
          </span>
          <SelectionCheckbox
            keys={filtered.map(itemKey)}
            selected={selected}
            onChange={setSelected}
            label={
              text(locale, "Select this view", "全选当前分区") +
              " (" +
              displayItems.length +
              ")"
            }
          />
          <Button
            variant="outline"
            aria-pressed={compact}
            onClick={() => {
              setCompact((value) => !value);
              setQuery("");
            }}
          >
            {text(
              locale,
              compact ? "Card view" : "Compact list",
              compact ? "卡片视图" : "简略列表",
            )}
          </Button>
          <Button
            variant="default"
            disabled={!selected.size}
            onClick={() => {
              setOpen(true);
              setManagementKind("all");
              setQuery("");
            }}
          >
            {text(locale, "Organize selection", "整理选择")}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              setSelecting(false);
              setSelected(new Set());
            }}
          >
            {text(locale, "Done", "完成")}
          </Button>
        </div>
      ) : null}
      <WorkspaceDialog
        open={exchange !== null}
        onOpenChange={(value) => {
          if (!value) setExchange(null);
        }}
        title={text(
          locale,
          exchange === "export" ? "Export favorites" : "Import favorites",
          exchange === "export" ? "导出收藏" : "导入收藏",
        )}
        description={text(
          locale,
          exchange === "export"
            ? "Download a file or send directly to another device."
            : "Choose a file or receive a collection online.",
          exchange === "export"
            ? "下载文件保存，或直接在线转存。"
            : "从本地文件恢复，或在线接收收藏。",
        )}
        closeLabel={text(locale, "Close", "关闭")}
      >
        <div className={layout.exchangeOptions}>
          {exchange === "export" ? (
            <>
              <label className={layout.titleField}>
                {text(locale, "Collection title", "清单标题")}
                <input
                  className={styles.input}
                  value={title}
                  maxLength={80}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={text(locale, "Saved collection", "收藏清单")}
                />
              </label>
              <section>
                <h3>{text(locale, "Save a file", "保存到本地")}</h3>
                <p>
                  {text(
                    locale,
                    "Export this selection or keep a complete private backup.",
                    "导出当前选择，或保留包含分组的完整私人备份。",
                  )}
                </p>
                <Button variant="outline" onClick={exportItems}>
                  <Download size={14} />
                  {text(locale, "Download collection", "下载收藏清单")}
                </Button>
                <Button variant="outline" onClick={exportBackup}>
                  <Download size={14} />
                  {text(locale, "Full private backup", "完整私人备份")}
                </Button>
              </section>
              <section>
                <h3>{text(locale, "Send online", "在线转存")}</h3>
                <p>
                  {text(
                    locale,
                    "Receive on another device without downloading a file.",
                    "无需下载文件，在另一台设备接收收藏。",
                  )}
                </p>
                <TransferSender
                  title={title}
                  locale={locale}
                  selected={selected}
                  scopeKeys={scopeKeys}
                />
              </section>
            </>
          ) : (
            <>
              <section>
                <h3>{text(locale, "From a file", "从本地文件导入")}</h3>
                <p>
                  {text(
                    locale,
                    "Collection files and private backups are supported.",
                    "支持收藏清单文件与完整私人备份。",
                  )}
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    file.current?.click();
                    setExchange(null);
                  }}
                >
                  <Upload size={14} />
                  {text(locale, "Choose a file", "选择文件")}
                </Button>
              </section>
              <section>
                <h3>{text(locale, "Receive online", "在线接收")}</h3>
                <p>
                  {text(
                    locale,
                    "Open a transfer or share code to preview before saving.",
                    "输入转存码或分享码，预览后再保存。",
                  )}
                </p>
                <Button asChild variant="outline">
                  <Link href="/transfer">
                    {text(locale, "Receive a transfer", "接收转存")}
                  </Link>
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/share">
                    {text(locale, "Open share code", "打开分享码")}
                  </Link>
                </Button>
              </section>
            </>
          )}
        </div>
      </WorkspaceDialog>
      {selecting && compact ? (
        <section className={layout.compactPanel}>
          {filterControls}
          {itemRows}
        </section>
      ) : null}
      {open ? (
        <WorkspaceDialog
          open={open}
          onOpenChange={setOpen}
          wide
          title={
            text(locale, "Organize selection", "整理选择") +
            " · " +
            selected.size
          }
          description={text(
            locale,
            "Add selected items to a collection, create a collection, or refine this selection.",
            "将所选项目加入收藏夹、新建收藏夹，或进一步筛选。",
          )}
          closeLabel={text(locale, "Close", "关闭")}
        >
          <CollectionOrganizer
            creationOnly
            locale={locale}
            collections={collections}
            active={active}
            onActive={(id) => {
              chooseCollection(id);
              setOpen(false);
              setSelecting(false);
            }}
            counts={counts}
            selected={actionKeys}
          />
          {filterControls}
          <div className={layout.bulk}>
            <SelectionCheckbox
              keys={displayItems.map(itemKey)}
              selected={selected}
              onChange={setSelected}
              label={
                text(locale, "Select this view", "全选当前分区") +
                " (" +
                displayItems.length +
                ")"
              }
            />
            <Button variant="ghost" onClick={() => setSelected(new Set())}>
              {text(locale, "Clear selection", "取消选择")}
            </Button>
            {collections.length && selected.size ? (
              <>
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger
                    aria-label={text(
                      locale,
                      "Destination collection",
                      "目标分组",
                    )}
                  >
                    <SelectValue
                      placeholder={text(
                        locale,
                        "Choose collection",
                        "选择分组",
                      )}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {collections.map((x) => (
                      <SelectItem key={x.id} value={x.id}>
                        {x.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  disabled={!target || !actionKeys.size || mutating}
                  onClick={() => void organize()}
                >
                  {text(locale, "Add to collection", "加入分组")} (
                  {actionKeys.size})
                </Button>
                {active !== "all" ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={
                        !target ||
                        target === active ||
                        !actionKeys.size ||
                        mutating
                      }
                      onClick={() => void organize(true)}
                    >
                      {text(locale, "Move", "移动")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!actionKeys.size || mutating}
                      onClick={() => void organize(false, true)}
                    >
                      {text(locale, "Remove from collection", "移出分组")}
                    </Button>
                  </>
                ) : null}
              </>
            ) : null}
            {selected.size ? (
              <Button
                variant="outline"
                disabled={!actionKeys.size || mutating}
                onClick={remove}
              >
                <Trash2 size={14} />
                {text(locale, "Remove", "移除")} ({actionKeys.size})
              </Button>
            ) : null}
          </div>
          <p className={layout.summary} role="status">
            {text(locale, "Showing ", "显示 ") +
              displayItems.length +
              " / " +
              selected.size +
              text(locale, " selected", " 项已选")}
          </p>
          {!displayItems.length ? (
            <p className={styles.muted}>
              {text(locale, "No saved items match.", "没有符合条件的收藏。")}
            </p>
          ) : null}
          {itemRows}
        </WorkspaceDialog>
      ) : null}
      {backup ? (
        <section className={styles.panel}>
          <h2>{text(locale, "Restore private backup", "恢复私人备份")}</h2>
          <p className={styles.muted}>
            {text(
              locale,
              "Merge into this workspace. Existing items and collection names are kept; members and tags are combined.",
              "合并到当前收藏。保留已有项目和分组名称，合并成员与标签。",
            )}
          </p>
          <div className={styles.tools}>
            <Button
              disabled={mutating}
              onClick={async () => {
                setMutating(true);
                try {
                  const result = await withSavedMutation(() =>
                    restoreLocalBackup(backup),
                  );
                  setNotice(
                    result.added +
                      text(locale, " added · ", " 项已恢复 · ") +
                      result.collections +
                      text(locale, " collections", " 个分组"),
                  );
                  setBackup(null);
                } catch {
                  setNotice(
                    text(
                      locale,
                      "Restore failed. Check storage and collection limits. Original data is kept.",
                      "恢复失败，请检查存储和分组上限，原数据仍保留。",
                    ),
                  );
                } finally {
                  setMutating(false);
                }
              }}
            >
              {text(locale, "Merge backup", "合并备份")}
            </Button>
            <Button
              variant="ghost"
              disabled={mutating}
              onClick={() => setBackup(null)}
            >
              {text(locale, "Cancel", "取消")}
            </Button>
          </div>
        </section>
      ) : null}
      {preview ? (
        <div className={styles.actions}>
          <Button variant="ghost" onClick={() => setPreview(null)}>
            {text(locale, "Close import", "关闭导入")}
          </Button>
          <CollectionImport
            key={preview.createdAt}
            snapshot={preview}
            locale={locale}
          />
        </div>
      ) : null}
    </section>
  );
}
