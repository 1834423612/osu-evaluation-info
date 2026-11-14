"use client";
import { useRef, useState } from "react";
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
import { CollectionImport } from "@/components/sharing/collection-import";
import { text, type Locale } from "@/lib/i18n";
import {
  createLocalSnapshot,
  readLocalItems,
  replaceLocalItems,
  importLocalItems,
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
  const file = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ExchangeItem[]>([]),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(new Set<string>()),
    [query, setQuery] = useState(""),
    [notice, setNotice] = useState(""),
    [preview, setPreview] = useState<SavedSnapshot | null>(null),
    [undo, setUndo] = useState<ExchangeItem[]>([]),
    [limit, setLimit] = useState(40),
    [title, setTitle] = useState("");
  function manage() {
    try {
      setItems(
        createLocalSnapshot(text(locale, "Saved collection", "收藏清单")).items,
      );
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
  const filtered = items.filter((x) =>
    (itemTitle(x) + " " + itemContext(x))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  function exportItems() {
    try {
      const snapshot = createLocalSnapshot(
        title.trim() || text(locale, "Saved collection", "收藏清单"),
      );
      if (selected.size)
        snapshot.items = snapshot.items.filter((x) => selected.has(itemKey(x)));
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
  function remove() {
    try {
      const latest = readLocalItems(),
        removed = latest.filter((x) => selected.has(itemKey(x)));
      replaceLocalItems(latest.filter((x) => !selected.has(itemKey(x))));
      setUndo(removed);
      setItems(createLocalSnapshot(title || "Saved collection").items);
      setSelected(new Set());
      setNotice(
        text(locale, removed.length + " removed", removed.length + " 项已移除"),
      );
    } catch {
      setNotice(text(locale, "Could not remove items.", "移除失败。"));
    }
  }
  return (
    <section className={styles.panel} data-telemetry-private>
      <div className={styles.tools}>
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
          {undo.length ? (
            <Button
              variant="outline"
              onClick={() => {
                try {
                  importLocalItems(undo, "sync");
                  setUndo([]);
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
          <div className={styles.fields}>
            <label>
              {text(locale, "Collection name", "清单名称")}
              <input
                className={styles.input}
                maxLength={80}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={text(locale, "Saved collection", "收藏清单")}
              />
            </label>
            <label>
              {text(locale, "Find saved items", "查找收藏")}
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
          </div>
          <div className={styles.tools}>
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
            <Button
              variant="outline"
              disabled={!selected.size}
              onClick={remove}
            >
              <Trash2 size={14} />
              {text(locale, "Remove", "移除")} ({selected.size})
            </Button>
          </div>
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
