"use client";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { authClient } from "@/lib/auth/client";
import { savedScope } from "@/lib/saved/scope";
import { SelectionCheckbox } from "@/components/saved/selection-checkbox";
import { useState } from "react";
import type { Route } from "next";
import Link from "next/link";
import { Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { text, type Locale } from "@/lib/i18n";
import {
  itemKey,
  itemKindName,
  itemTitle,
  itemContext,
  itemHref,
  type SavedSnapshot,
} from "@/lib/saved/exchange";
import { importLocalItems, readLocalItems } from "@/lib/saved/local";
import { withSavedMutation } from "@/lib/saved/mutations";
import styles from "@/components/ui/workspace.module.css";
export function CollectionImport({
  snapshot,
  locale,
  onImported,
  onOpen,
  disabled = false,
  mode = "copy",
}: {
  snapshot: SavedSnapshot;
  locale: Locale;
  onImported?: (keys: string[]) => void;
  onOpen?: (item: SavedSnapshot["items"][number]) => void;
  disabled?: boolean;
  mode?: "copy" | "sync";
}) {
  const { data: session } = authClient.useSession();
  const [selected, setSelected] = useState(
      () => new Set(snapshot.items.map(itemKey)),
    ),
    [result, setResult] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(40);
  useDraftGuard(
    !result &&
      (selected.size !== snapshot.items.length ||
        snapshot.items.some((item) => !selected.has(itemKey(item)))),
  );
  let existing = new Set<string>();
  try {
    existing = new Set(readLocalItems().map(itemKey));
  } catch {}
  async function save() {
    setBusy(true);
    try {
      const chosen = snapshot.items.filter((x) => selected.has(itemKey(x)));
      const outcome = await withSavedMutation(() =>
        importLocalItems(chosen, mode),
      );
      setResult(
        text(
          locale,
          outcome.added + " added · " + outcome.skipped + " already saved",
          outcome.added + " 项已转存 · " + outcome.skipped + " 项已收藏",
        ),
      );
      onImported?.(outcome.addedKeys);
    } catch {
      setResult(
        text(
          locale,
          "Import failed. Check available space and saved-item limits.",
          "导入失败，请检查存储空间与收藏上限。",
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={styles.panel}>
      <p className={styles.notice}>
        {text(
          locale,
          savedScope()
            ? "Save to the current account workspace."
            : session
              ? "Save in this browser workspace; cloud sync is not active here."
              : "You are signed out. These items will be saved in this browser only.",
          savedScope()
            ? "保存至当前账号的收藏空间。"
            : session
              ? "保存至当前浏览器空间，此处尚未启用账号同步。"
              : "当前未登录，所选内容只会保存在此浏览器。",
        )}
      </p>
      <div className={styles.heading}>
        <div>
          <h2>{snapshot.title}</h2>
          <small className={styles.muted}>
            {snapshot.items.length} {text(locale, "items", "项")}
          </small>
        </div>
        <div className={styles.tools}>
          <SelectionCheckbox
            keys={snapshot.items.map(itemKey)}
            selected={selected}
            onChange={setSelected}
            label={text(locale, "Select all", "全选")}
            disabled={disabled || busy}
          />
          <Button
            disabled={disabled || !selected.size || busy}
            onClick={() => void save()}
          >
            <Check size={14} />
            {text(locale, "Save selected", "转存所选")} ({selected.size})
          </Button>
        </div>
      </div>
      {result ? (
        <p className={styles.notice} role="status">
          {result}
        </p>
      ) : null}
      <ul className={styles.list}>
        {snapshot.items.slice(0, limit).map((item) => {
          const key = itemKey(item),
            href = itemHref(item);
          return (
            <li key={key} className={styles.row}>
              <label className={styles.pick}>
                <input
                  className={styles.checkbox}
                  type="checkbox"
                  disabled={disabled || busy}
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
                    {existing.has(key)
                      ? " · " + text(locale, "Already saved", "已收藏")
                      : ""}
                  </small>
                </span>
              </label>
              {onOpen && href ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={text(locale, "Open item", "打开项目")}
                  onClick={() => onOpen(item)}
                >
                  <ExternalLink size={15} />
                </Button>
              ) : href ? (
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
      {limit < snapshot.items.length ? (
        <Button variant="outline" onClick={() => setLimit((x) => x + 40)}>
          {text(locale, "Show more", "显示更多")}
        </Button>
      ) : null}
    </section>
  );
}
