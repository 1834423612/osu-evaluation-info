"use client";
import { CollectionIcon } from "./collection-icon";
import { collectionIcons } from "@/lib/saved/collection-icons";
import { collectionTagGroups } from "@/lib/saved/tag-presets";
import { browserUuid } from "@/lib/uuid";
import { useState } from "react";
import { Folder, FolderPlus, Pencil, Trash2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { WorkspaceDialog } from "@/components/ui/workspace-dialog";
import { withSavedMutation } from "@/lib/saved/mutations";
import {
  readCollections,
  editCollections,
  saveCollection,
} from "@/lib/saved/collections";
import type { SavedCollection } from "@/lib/saved/collection-schema";
import { text, type Locale } from "@/lib/i18n";
import styles from "./collections.module.css";
import shared from "@/components/ui/workspace.module.css";

export function CollectionOrganizer({
  locale,
  collections,
  active,
  onActive,
  counts,
  selected,
  creationOnly = false,
}: {
  locale: Locale;
  collections: SavedCollection[];
  active: string;
  onActive: (id: string) => void;
  counts: Map<string, number>;
  selected?: Set<string>;
  creationOnly?: boolean;
}) {
  const [draft, setDraft] = useState<SavedCollection | null>(null),
    [base, setBase] = useState<SavedCollection | null>(null),
    [tags, setTags] = useState(""),
    [customTag, setCustomTag] = useState(""),
    [iconQuery, setIconQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [removed, setRemoved] = useState<SavedCollection | null>(null);
  const chosenTags = tags
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
  function addTag() {
    const value = customTag.trim();
    if (!value || chosenTags.includes(value) || chosenTags.length >= 12) return;
    setTags([...chosenTags, value].join(", "));
    setCustomTag("");
  }
  const current = collections.find((x) => x.id === active);
  function begin(value?: SavedCollection) {
    setBase(value ?? null);
    setCustomTag("");
    setIconQuery("");
    setDraft(
      value
        ? structuredClone(value)
        : {
            id: browserUuid(),
            name: "",
            icon: "lucide:folder",
            tags: [],
            members: [...(selected ?? [])],
          },
    );
    setTags(value?.tags.join(", ") ?? "");
    setConfirmDelete(false);
    setNotice("");
  }
  async function run(action: () => void, after?: () => void) {
    setBusy(true);
    setNotice("");
    try {
      await withSavedMutation(action);
      after?.();
    } catch (error) {
      setNotice(
        error instanceof Error && error.message === "collection_changed"
          ? text(
              locale,
              "This collection changed. Reopen it before editing.",
              "分组已发生变化，请重新打开后编辑。",
            )
          : text(
              locale,
              "Could not save. Check the name, tags and 30-collection limit.",
              "保存失败，请检查名称、标签及 30 个分组的上限。",
            ),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.organizer} data-creation={creationOnly || undefined}>
      {!creationOnly ? (
        <div className={styles.collectionChips}>
          <button
            type="button"
            aria-pressed={active === "all"}
            onClick={() => onActive("all")}
          >
            <Folder size={13} />
            {text(locale, "All favorites", "全部收藏")}
            <span>{counts.get("all") ?? 0}</span>
          </button>
          {collections.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={group.id === active}
              onClick={() => onActive(group.id)}
            >
              <CollectionIcon icon={group.icon} size={14} />
              <span className={styles.collectionName} title={group.name}>
                {group.name}
              </span>
              <span>{counts.get(group.id) ?? 0}</span>
            </button>
          ))}
        </div>
      ) : null}
      <div className={styles.heading}>
        <label className={styles.selectLabel} hidden>
          <Folder size={16} />
          <span>{text(locale, "Collection", "收藏分组")}</span>
          <Select value={current?.id ?? "all"} onValueChange={onActive}>
            <SelectTrigger aria-label={text(locale, "Collection", "收藏分组")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[
                <SelectItem key="all" value="all">
                  {text(locale, "All favorites", "全部收藏")} ·{" "}
                  {counts.get("all") ?? 0}
                </SelectItem>,
                ...collections.map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} · {counts.get(x.id) ?? 0}
                  </SelectItem>
                )),
              ]}
            </SelectContent>
          </Select>
        </label>
        <div className={shared.tools}>
          <Button variant="outline" onClick={() => begin()}>
            <FolderPlus size={15} />
            {text(locale, "New collection", "新建分组")}
          </Button>
          {current && !creationOnly ? (
            <Button variant="ghost" onClick={() => begin(current)}>
              <Pencil size={14} />
              {text(locale, "Edit collection", "编辑分组")}
            </Button>
          ) : null}
        </div>
      </div>
      {!creationOnly && current?.tags.length ? (
        <div className={styles.tags}>
          {current.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      ) : null}
      {removed ? (
        <div className={shared.actions}>
          <span className={shared.muted}>
            {text(
              locale,
              "Collection removed; favorites kept.",
              "分组已移除，收藏仍保留。",
            )}
          </span>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(
                () => {
                  saveCollection(removed, null);
                },
                () => {
                  setRemoved(null);
                  onActive(removed.id);
                },
              )
            }
          >
            <RotateCcw size={14} />
            {text(locale, "Undo", "撤销")}
          </Button>
        </div>
      ) : null}
      {!draft && notice ? (
        <p role="status" className={shared.notice}>
          {notice}
        </p>
      ) : null}
      <WorkspaceDialog
        dirty={
          !!draft &&
          (draft.name !== (base?.name ?? "") ||
            tags !== (base?.tags.join(", ") ?? "") ||
            customTag.trim().length > 0 ||
            (draft.icon ?? "lucide:folder") !== (base?.icon ?? "lucide:folder"))
        }
        open={!!draft}
        onOpenChange={(open) => {
          if (!open && !busy) setDraft(null);
        }}
        title={
          base
            ? text(locale, "Edit collection", "编辑分组")
            : text(locale, "New collection", "新建分组")
        }
        description={text(
          locale,
          "Group favorites without duplicating them.",
          "分组整理收藏，无需重复保存。",
        )}
        closeLabel={text(locale, "Close", "关闭")}
      >
        {draft ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                () => {
                  const next = {
                    ...draft,
                    tags: [
                      ...new Set(
                        (
                          tags +
                          (customTag.trim() ? "," + customTag.trim() : "")
                        )
                          .split(/[,，]/)
                          .map((x) => x.trim())
                          .filter(Boolean),
                      ),
                    ],
                  };
                  saveCollection(next, base);
                },
                () => {
                  onActive(draft.id);
                  setDraft(null);
                },
              );
            }}
          >
            {!base && draft.members.length ? (
              <p className={shared.notice}>
                {text(
                  locale,
                  `Add ${draft.members.length} selected items to this collection.`,
                  `将 ${draft.members.length} 项所选收藏加入新分组。`,
                )}
              </p>
            ) : null}
            <div className={shared.fields}>
              <label>
                {text(locale, "Name", "名称")}
                <input
                  autoFocus
                  required
                  className={shared.input}
                  maxLength={60}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <label>
                {text(locale, "Your tags", "自定义标签")}
                <div className={styles.customTagRow}>
                  <input
                    className={shared.input}
                    maxLength={24}
                    value={customTag}
                    disabled={busy || chosenTags.length >= 12}
                    placeholder={text(
                      locale,
                      "e.g. Career prep",
                      "例如：专业必修",
                    )}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      busy || !customTag.trim() || chosenTags.length >= 12
                    }
                    onClick={addTag}
                  >
                    {text(locale, "Add", "添加")}
                  </Button>
                </div>
                <div className={styles.selectedTags}>
                  {chosenTags.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      aria-label={
                        text(locale, "Remove tag ", "移除标签 ") + tag
                      }
                      onClick={() =>
                        setTags(
                          chosenTags
                            .filter((value) => value !== tag)
                            .join(", "),
                        )
                      }
                    >
                      #{tag}
                      <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
                <small className={shared.muted}>
                  {text(
                    locale,
                    "Up to 12 tags, 24 characters each.",
                    "最多 12 个标签，每个不超过 24 字符。",
                  )}
                </small>
              </label>
            </div>
            <div className={styles.tagSuggestions}>
              <p>
                {text(
                  locale,
                  "Choose a few labels, or type your own above.",
                  "点击预选标签，也可在上方自行输入。",
                )}
              </p>
              {collectionTagGroups.map((group) => (
                <section key={group.en}>
                  <h3>{text(locale, group.en, group.zh)}</h3>
                  <div>
                    {group.tags.map((tag) => {
                      const chosen = tags
                        .split(/[,，]/)
                        .map((x) => x.trim())
                        .filter(Boolean);
                      const checked = chosen.includes(tag);
                      return (
                        <button
                          type="button"
                          key={tag}
                          aria-pressed={checked}
                          disabled={busy || (!checked && chosen.length >= 12)}
                          onClick={() =>
                            setTags(
                              (checked
                                ? chosen.filter((x) => x !== tag)
                                : [...chosen, tag]
                              ).join(", "),
                            )
                          }
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
              <a
                href="https://registrar.osu.edu/academic-calendar/"
                target="_blank"
                rel="noreferrer"
              >
                {text(
                  locale,
                  "Session terminology · Registrar",
                  "学期名称参考 · Registrar",
                )}
              </a>
            </div>
            <section className={styles.iconPicker}>
              <h3>{text(locale, "Collection icon", "分组图标")}</h3>
              <input
                className={shared.input}
                type="search"
                value={iconQuery}
                onChange={(e) => setIconQuery(e.target.value)}
                placeholder={text(
                  locale,
                  "Find icons (book, star, lab…)",
                  "搜索图标（book、star、lab…）",
                )}
                aria-label={text(
                  locale,
                  "Find collection icon",
                  "查找分组图标",
                )}
              />
              <div
                role="group"
                aria-label={text(locale, "Choose icon", "选择图标")}
              >
                {collectionIcons
                  .filter((icon) =>
                    icon.label.toLowerCase().includes(iconQuery.toLowerCase()),
                  )
                  .map((icon) => (
                    <button
                      type="button"
                      key={icon.id}
                      title={icon.label}
                      aria-label={icon.label}
                      aria-pressed={(draft.icon ?? "lucide:folder") === icon.id}
                      onClick={() => setDraft({ ...draft, icon: icon.id })}
                    >
                      <CollectionIcon icon={icon.id} size={19} />
                    </button>
                  ))}
              </div>
            </section>
            {notice ? (
              <p role="status" className={shared.notice}>
                {notice}
              </p>
            ) : null}
            <div className={shared.actions}>
              <Button type="submit" disabled={busy || !draft.name.trim()}>
                {text(locale, "Save collection", "保存分组")}
              </Button>
              {base ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={14} />
                  {text(locale, "Delete collection", "删除分组")}
                </Button>
              ) : null}
            </div>
            {confirmDelete && base ? (
              <div className={shared.notice}>
                <p>
                  {text(
                    locale,
                    "Delete this collection? Its favorites will stay saved.",
                    "删除此分组？其中的收藏仍会保留。",
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => {
                        const live = readCollections().find(
                          (x) => x.id === base.id,
                        );
                        if (JSON.stringify(live) !== JSON.stringify(base))
                          throw Error("collection_changed");
                        editCollections((all) =>
                          all.filter((x) => x.id !== base.id),
                        );
                      },
                      () => {
                        setRemoved(base);
                        onActive("all");
                        setDraft(null);
                      },
                    )
                  }
                >
                  {text(locale, "Confirm deletion", "确认删除")}
                </Button>
              </div>
            ) : null}
          </form>
        ) : null}
      </WorkspaceDialog>
    </div>
  );
}
