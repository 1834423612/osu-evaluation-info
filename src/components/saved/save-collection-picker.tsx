"use client";
import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { FolderPlus, Check, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { browserUuid } from "@/lib/uuid";
import { savedScope } from "@/lib/saved/scope";
import { readCollections, editCollections } from "@/lib/saved/collections";
import { readLocalItems, removeLocalItems } from "@/lib/saved/local";
import { itemKey } from "@/lib/saved/exchange";
import { withSavedMutation } from "@/lib/saved/mutations";
import type { SavedCollection } from "@/lib/saved/collection-schema";
import { text } from "@/lib/i18n";
import { CollectionIcon } from "./collection-icon";
import styles from "./save-collection-picker.module.css";
type Item = { key: string; title: string; scope: string | null };
export function SaveCollectionPicker() {
  const { locale } = usePreferences();
  const [item, setItem] = useState<Item | null>(null),
    [groups, setGroups] = useState<SavedCollection[]>([]),
    [chosen, setChosen] = useState(new Set<string>()),
    [initial, setInitial] = useState(new Set<string>()),
    [name, setName] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [anchor, setAnchor] = useState({ left: 20, top: 90 }),
    [container, setContainer] = useState<HTMLElement | null>(null);
  const dirty =
    !!item &&
    (name.trim().length > 0 ||
      [...chosen].sort().join() !== [...initial].sort().join());
  useDraftGuard(dirty);
  const dirtyRef = useRef(dirty);
  const generation = useRef(0);
  const lastScope = useRef<string | null>(null);
  const pointer = useRef<{ x: number; y: number; time: number } | null>(null);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);
  useEffect(() => {
    const added = (event: Event) => {
      if (
        dirtyRef.current &&
        !window.confirm(
          document.documentElement.lang.startsWith("zh")
            ? "放弃尚未保存的分组选择？"
            : "Discard unsaved collection choices?",
        )
      )
        return;
      const value = (event as CustomEvent<Item>).detail;
      if (value.scope !== savedScope()) return;
      generation.current++;
      lastScope.current = value.scope;
      setBusy(false);
      const all = readCollections();
      setGroups(all);
      const ids = new Set(
        all.filter((x) => x.members.includes(value.key)).map((x) => x.id),
      );
      setChosen(ids);
      setInitial(ids);
      setName("");
      setNotice("");
      setItem(value);
      const point =
        pointer.current && Date.now() - pointer.current.time < 5000
          ? pointer.current
          : null;
      const active = point
        ? document.elementFromPoint(point.x, point.y)
        : document.activeElement;
      const rect = active?.getBoundingClientRect();
      const left = point?.x ?? rect?.left ?? 20,
        top = point?.y ?? rect?.bottom ?? 90;
      setAnchor({
        left: Math.max(12, Math.min(innerWidth - 12, left)),
        top: Math.max(12, Math.min(innerHeight - 12, top)),
      });
      setContainer(active?.closest('[role="dialog"]') as HTMLElement | null);
    };
    const scope = () => {
      if (lastScope.current !== savedScope()) {
        generation.current++;
        lastScope.current = savedScope();
      }
      setItem((old) => (old && old.scope !== savedScope() ? null : old));
    };
    const position = (event: PointerEvent) => {
      pointer.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
    };
    document.addEventListener("pointerdown", position, true);
    window.addEventListener("course-atlas:favorite-added", added);
    window.addEventListener("course-atlas:preferences", scope);
    return () => {
      document.removeEventListener("pointerdown", position, true);
      window.removeEventListener("course-atlas:favorite-added", added);
      window.removeEventListener("course-atlas:preferences", scope);
    };
  }, []);
  async function save() {
    if (!item) return;
    const session = generation.current;
    setBusy(true);
    try {
      await withSavedMutation(() => {
        if (
          item.scope !== savedScope() ||
          !readLocalItems().some((x) => itemKey(x) === item.key)
        )
          throw Error();
        editCollections((current) => {
          const next = current.map((group) => ({
            ...group,
            members: chosen.has(group.id)
              ? [...new Set([...group.members, item.key])]
              : group.members.filter((key) => key !== item.key),
          }));
          if (name.trim())
            next.push({
              id: browserUuid(),
              name: name.trim(),
              icon: "lucide:folder",
              tags: [],
              members: [item.key],
            });
          return next;
        });
      });
      if (session === generation.current) setItem(null);
    } catch {
      if (session !== generation.current) return;
      setNotice(
        text(
          locale,
          "Could not save collection choices.",
          "未能保存分组选择。",
        ),
      );
    } finally {
      if (session === generation.current) setBusy(false);
    }
  }
  return (
    <Popover.Root
      open={!!item}
      onOpenChange={(open) => {
        if (
          !open &&
          !busy &&
          (!dirty ||
            window.confirm(
              text(
                locale,
                "Discard collection changes?",
                "放弃尚未保存的分组选择？",
              ),
            ))
        ) {
          generation.current++;
          setItem(null);
        }
      }}
    >
      <Popover.Anchor asChild>
        <span
          aria-hidden="true"
          style={{
            position: "fixed",
            left: anchor.left,
            top: anchor.top,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
        />
      </Popover.Anchor>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Content
          className={`${styles.picker} rr-block`}
          data-telemetry-private
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <strong>
            <Check size={15} />
            {text(locale, "Saved to favorites", "已加入收藏")}
          </strong>
          <p>{item?.title}</p>
          <div className={styles.heading}>
            <span>
              <FolderOpen size={14} />
              {text(locale, "Save in folders", "添加到分类")}
            </span>
            <small>
              {text(
                locale,
                `${chosen.size} selected`,
                `已选 ${chosen.size} 个`,
              )}
            </small>
          </div>
          <div className={styles.groups}>
            {groups.map((group) => (
              <label
                className={styles.option}
                key={group.id}
                data-selected={chosen.has(group.id) || undefined}
              >
                <input
                  type="checkbox"
                  checked={chosen.has(group.id)}
                  disabled={busy}
                  onChange={() =>
                    setChosen((old) => {
                      const next = new Set(old);
                      if (next.has(group.id)) next.delete(group.id);
                      else next.add(group.id);
                      return next;
                    })
                  }
                />
                <CollectionIcon icon={group.icon} />
                <span title={group.name}>
                  <b>{group.name}</b>
                  {group.tags.length ? <em>{group.tags.join(" · ")}</em> : null}
                </span>
                <small>
                  {group.members.length} {text(locale, "items", "项")}
                </small>
              </label>
            ))}
            {!groups.length ? (
              <small className={styles.empty}>
                {text(
                  locale,
                  "Create a folder below to organize this item.",
                  "在下方新建分类，整理这条收藏。",
                )}
              </small>
            ) : null}
          </div>
          <label className={styles.newGroup}>
            <FolderPlus size={15} />
            <input
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              placeholder={text(
                locale,
                "New collection name",
                "新建收藏夹名称",
              )}
              aria-label={text(locale, "New collection name", "新建收藏夹名称")}
            />
          </label>
          <Button size="sm" disabled={busy} onClick={() => void save()}>
            {chosen.size || name.trim()
              ? text(locale, "Save folders", "保存分类")
              : text(locale, "Keep unfiled", "暂不分类")}
          </Button>
          {notice ? <small role="status">{notice}</small> : null}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={async () => {
              if (!item) return;
              const session = generation.current;
              setBusy(true);
              try {
                const result = await withSavedMutation(() => {
                  if (item.scope !== savedScope()) throw Error();
                  return removeLocalItems(new Set([item.key]));
                });
                if (!result) throw Error();
                if (session === generation.current) setItem(null);
              } catch {
                if (session === generation.current)
                  setNotice(
                    text(
                      locale,
                      "Could not remove this favorite. Try again.",
                      "未能取消收藏，请重试。",
                    ),
                  );
              } finally {
                if (session === generation.current) setBusy(false);
              }
            }}
          >
            {text(locale, "Remove from favorites", "取消此项收藏")}
          </Button>
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
