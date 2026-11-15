"use client";
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
import type { SavedCollection } from "@/lib/saved/collection-schema";
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
  Cloud,
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
function SavedManagerBody({ locale }: { locale: Locale }) {
  const file = useRef<HTMLInputElement>(null);
  const [collections, setCollections] = useState<SavedCollection[]>([]),
    [active, setActive] = useState("all"),
    [target, setTarget] = useState(""),
    [sort, setSort] = useState("saved"),
    [kind, setKind] = useState("all");
  const collection = collections.find((x) => x.id === active);
  const scopeKeys = collection ? new Set(collection.members) : undefined;
  const [items, setItems] = useState<ExchangeItem[]>([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(new Set<string>()),
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
  }, [open, locale]);
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
                    members: x.members.filter((key) => !selected.has(key)),
                  }
                : x,
            ),
          );
        else
          assignCollection(
            selected,
            target,
            move && active !== "all" ? active : undefined,
          );
      });
      setSelected(new Set());
      setNotice(text(locale, "Collection updated.", "分组已更新。"));
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
      setOpen(!open);
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
        (kind === "all" || kind === item.kind) &&
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
  async function remove() {
    setMutating(true);
    try {
      const removed = await withSavedMutation(() => removeLocalItems(selected));
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
  return (
    <section className={styles.panel} data-telemetry-private data-saved-manager>
      <div className={styles.tools}>
        <ShareCollection
          locale={locale}
          selected={selected}
          title={title}
          scopeKeys={scopeKeys}
        />
        <SharedManagement locale={locale} />
        <TransferSender
          locale={locale}
          selected={selected}
          scopeKeys={scopeKeys}
        />
        <Button asChild variant="outline">
          <a href="/account">
            <Cloud size={14} />
            {text(locale, "Account & sync", "账号与同步")}
          </a>
        </Button>
        <Button variant="outline" aria-expanded={open} onClick={manage}>
          <SlidersHorizontal size={14} />
          {text(locale, "Manage", "管理")}
        </Button>
        <Button variant="outline" onClick={exportItems}>
          <Download size={14} />
          {text(locale, "Export", "导出")}
        </Button>
        <Button variant="outline" onClick={() => file.current?.click()}>
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
              if (value.size > 1048576) throw Error();
              setPreview(parseSnapshot(await value.text()));
              setNotice("");
            } catch {
              setNotice(
                text(
                  locale,
                  "Invalid or oversized collection file (maximum 1 MiB).",
                  "收藏文件无效或超过 1 MiB。",
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
      {open ? (
        <div>
          <CollectionOrganizer
            locale={locale}
            collections={collections}
            active={active}
            onActive={chooseCollection}
            counts={counts}
          />
          <details className={layout.exportTitle}>
            <summary>
              {text(locale, "Export / share title", "导出／分享标题")}
            </summary>
            <div className={styles.fields}>
              <label>
                {text(locale, "Title", "标题")}
                <input
                  className={styles.input}
                  maxLength={80}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={text(locale, "Saved collection", "收藏清单")}
                />
              </label>
            </div>
          </details>
          <div className={layout.filters}>
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
                value={kind}
                onValueChange={(value) => {
                  setKind(value);
                  setLimit(40);
                }}
              >
                <SelectTrigger
                  aria-label={text(locale, "Saved type", "收藏类型")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {text(locale, "All types", "全部类型")}
                  </SelectItem>
                  {(
                    ["course", "section", "instructor", "syllabus"] as const
                  ).map((value) => (
                    <SelectItem key={value} value={value}>
                      {itemKindName(value, locale)}
                    </SelectItem>
                  ))}
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
          <div className={layout.bulk}>
            <Button
              variant="outline"
              onClick={() => setSelected(new Set(filtered.map(itemKey)))}
            >
              {text(locale, "Select results", "选择筛选结果")} (
              {filtered.length})
            </Button>
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
                  disabled={!target || !selected.size || mutating}
                  onClick={() => void organize()}
                >
                  {text(locale, "Add to collection", "加入分组")}
                </Button>
                {active !== "all" ? (
                  <>
                    <Button
                      variant="outline"
                      disabled={
                        !target ||
                        target === active ||
                        !selected.size ||
                        mutating
                      }
                      onClick={() => void organize(true)}
                    >
                      {text(locale, "Move", "移动")}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={!selected.size || mutating}
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
                disabled={!selected.size || mutating}
                onClick={remove}
              >
                <Trash2 size={14} />
                {text(locale, "Remove", "移除")} ({selected.size})
              </Button>
            ) : null}
          </div>
          <p className={layout.summary} role="status">
            {text(locale, "Items · ", "项目 · ") +
              filtered.length +
              " · " +
              selected.size +
              text(locale, " selected", " 项已选")}
          </p>
          {!filtered.length ? (
            <p className={styles.muted}>
              {text(locale, "No saved items match.", "没有符合条件的收藏。")}
            </p>
          ) : null}
          <ul className={styles.list}>
            {filtered.slice(0, limit).map((item) => {
              const key = itemKey(item),
                href = itemHref(item);
              return (
                <li className={styles.row} key={key}>
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
                            <span key={x.id}>{x.name}</span>
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
                </li>
              );
            })}
          </ul>
          {limit < filtered.length ? (
            <Button variant="outline" onClick={() => setLimit((x) => x + 40)}>
              {text(locale, "Show more", "显示更多")}
            </Button>
          ) : null}
        </div>
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
