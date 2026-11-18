"use client";
import { useId, useState } from "react";
import { ChevronDown, FolderOpen, Search, X } from "lucide-react";
import { CollectionIcon } from "@/components/saved/collection-icon";
import { SelectionCheckbox } from "@/components/saved/selection-checkbox";
import { Button } from "@/components/ui/button";
import {
  itemKey,
  itemTitle,
  itemContext,
  itemKindName,
} from "@/lib/saved/exchange";
import { text, type Locale } from "@/lib/i18n";
import type { ShareGroup, ShareSelection } from "@/lib/saved/share-selection";
import ui from "@/components/ui/workspace.module.css";
import styles from "./share-composer.module.css";

export function ShareFolderPicker({
  groups,
  selection,
  onChange,
  locale,
  activeId,
  disabled,
}: {
  groups: ShareGroup[];
  selection: ShareSelection;
  onChange: (value: ShareSelection) => void;
  locale: Locale;
  activeId?: string;
  disabled: boolean;
}) {
  const prefix = useId();
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(new Set(activeId ? [activeId] : []));
  const needle = query.trim().toLocaleLowerCase();
  const name = (group: ShareGroup) =>
    group.collection?.name ?? text(locale, "Unfiled items", "未分类收藏");
  const matches = (group: ShareGroup) =>
    group.items.filter(
      (item) =>
        !needle ||
        `${name(group)} ${group.collection?.tags.join(" ") ?? ""} ${itemTitle(item)} ${itemContext(item)} ${itemKindName(item.kind, locale)}`
          .toLocaleLowerCase()
          .includes(needle),
    );
  const visible = groups.filter((group) => matches(group).length);
  return (
    <section
      className={styles.picker}
      aria-label={text(locale, "Choose folders and items", "选择分类与内容")}
    >
      <div className={styles.pickerTop}>
        <h3>
          <FolderOpen size={17} />
          {text(locale, "Choose what to share", "选择分享内容")}
        </h3>
        <div className={styles.bulk}>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onChange(
                Object.fromEntries(
                  groups.map((group) => [group.id, group.items.map(itemKey)]),
                ),
              )
            }
          >
            {text(locale, "All folders", "全部选择")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              disabled || !Object.values(selection).some((keys) => keys.length)
            }
            onClick={() => onChange({})}
          >
            {text(locale, "Clear", "清空")}
          </Button>
        </div>
      </div>
      <label className={styles.search}>
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={text(
            locale,
            "Find a folder, course or instructor",
            "查找分类、课程或教师",
          )}
          aria-label={text(locale, "Search sharing contents", "搜索分享内容")}
        />
        {query ? (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={text(locale, "Clear search", "清除搜索")}
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
      <div className={styles.folderList}>
        {visible.map((group) => {
          const picked = new Set(selection[group.id] ?? []),
            keys = group.items.map(itemKey);
          const count = keys.filter((key) => picked.has(key)).length;
          const opened = expanded.has(group.id) || !!needle;
          const id = `${prefix}-${group.id}`;
          return (
            <section
              className={styles.folder}
              key={group.id}
              data-selected={count > 0 || undefined}
            >
              <div className={styles.folderHead}>
                <SelectionCheckbox
                  keys={keys}
                  selected={picked}
                  onChange={(next) =>
                    onChange({ ...selection, [group.id]: [...next] })
                  }
                  label={text(
                    locale,
                    `Share all of ${name(group)}`,
                    `分享整个${name(group)}`,
                  )}
                  disabled={disabled}
                />
                <span className={styles.folderIcon}>
                  <CollectionIcon icon={group.collection?.icon} size={20} />
                </span>
                <button
                  className={styles.expand}
                  type="button"
                  aria-expanded={opened}
                  aria-controls={id}
                  onClick={() =>
                    setExpanded((current) => {
                      const next = new Set(current);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                >
                  <span>
                    <strong>{name(group)}</strong>
                    <small>
                      {count
                        ? text(
                            locale,
                            `${count} of ${keys.length} selected`,
                            `已选 ${count} / ${keys.length} 项`,
                          )
                        : text(
                            locale,
                            `${keys.length} items · select folder or expand`,
                            `${keys.length} 项 · 整组选中或展开选择`,
                          )}
                      {count > 0 && count < keys.length ? (
                        <em>{text(locale, "Partial folder", "部分分享")}</em>
                      ) : null}
                    </small>
                  </span>
                  <ChevronDown size={17} data-open={opened} />
                </button>
              </div>
              {group.collection?.tags.length ? (
                <div className={styles.tags}>
                  {group.collection.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
              {opened ? (
                <ul className={styles.items} id={id}>
                  {matches(group).map((item) => {
                    const key = itemKey(item);
                    return (
                      <li key={key}>
                        <label className={styles.item}>
                          <input
                            type="checkbox"
                            className={ui.checkbox}
                            checked={picked.has(key)}
                            disabled={disabled}
                            onChange={() => {
                              const next = new Set(picked);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              onChange({ ...selection, [group.id]: [...next] });
                            }}
                          />
                          <span>
                            <strong>{itemTitle(item)}</strong>
                            <small>{itemContext(item)}</small>
                          </span>
                          <em>{itemKindName(item.kind, locale)}</em>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          );
        })}
        {!visible.length ? (
          <p className={styles.empty}>
            {text(locale, "No matching saved items.", "没有匹配的收藏内容。")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
