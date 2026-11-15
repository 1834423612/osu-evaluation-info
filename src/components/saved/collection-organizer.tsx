"use client";
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
}: {
  locale: Locale;
  collections: SavedCollection[];
  active: string;
  onActive: (id: string) => void;
  counts: Map<string, number>;
}) {
  const [draft, setDraft] = useState<SavedCollection | null>(null),
    [base, setBase] = useState<SavedCollection | null>(null),
    [tags, setTags] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false),
    [removed, setRemoved] = useState<SavedCollection | null>(null);
  const current = collections.find((x) => x.id === active);
  function begin(value?: SavedCollection) {
    setBase(value ?? null);
    setDraft(
      value
        ? structuredClone(value)
        : { id: crypto.randomUUID(), name: "", tags: [], members: [] },
    );
    setTags(value?.tags.join(", ") ?? "");
    setConfirmDelete(false);
    setNotice("");
  }
  async function run(action: () => void) {
    setBusy(true);
    setNotice("");
    try {
      await withSavedMutation(action);
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
    <div className={styles.organizer}>
      <div className={styles.heading}>
        <label className={styles.selectLabel}>
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
          {current ? (
            <Button variant="ghost" onClick={() => begin(current)}>
              <Pencil size={14} />
              {text(locale, "Edit collection", "编辑分组")}
            </Button>
          ) : null}
        </div>
      </div>
      {current?.tags.length ? (
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
              void run(() => {
                saveCollection(removed, null);
                setRemoved(null);
                onActive(removed.id);
              })
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
              void run(() => {
                const next = {
                  ...draft,
                  tags: [
                    ...new Set(
                      tags
                        .split(/[,，]/)
                        .map((x) => x.trim())
                        .filter(Boolean),
                    ),
                  ],
                };
                saveCollection(next, base);
                onActive(next.id);
                setDraft(null);
              });
            }}
          >
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
                {text(locale, "Tags · comma separated", "标签 · 逗号分隔")}
                <input
                  className={shared.input}
                  maxLength={310}
                  value={tags}
                  placeholder={text(locale, "Degree, Autumn", "学位要求，秋季")}
                  onChange={(e) => setTags(e.target.value)}
                />
                <small className={shared.muted}>
                  {text(
                    locale,
                    "Up to 12 tags, 24 characters each.",
                    "最多 12 个标签，每个不超过 24 字符。",
                  )}
                </small>
              </label>
            </div>
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
                    void run(() => {
                      const live = readCollections().find(
                        (x) => x.id === base.id,
                      );
                      if (JSON.stringify(live) !== JSON.stringify(base))
                        throw Error("collection_changed");
                      editCollections((all) =>
                        all.filter((x) => x.id !== base.id),
                      );
                      setRemoved(base);
                      onActive("all");
                      setDraft(null);
                    })
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
