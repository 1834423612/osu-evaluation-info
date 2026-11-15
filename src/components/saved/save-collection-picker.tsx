"use client";
import { useEffect, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { FolderPlus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { browserUuid } from "@/lib/uuid";
import { savedScope } from "@/lib/saved/scope";
import { readCollections, editCollections } from "@/lib/saved/collections";
import { readLocalItems } from "@/lib/saved/local";
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
      setItem(null);
    } catch {
      setNotice(
        text(
          locale,
          "Could not save collection choices.",
          "未能保存分组选择。",
        ),
      );
    } finally {
      setBusy(false);
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
        )
          setItem(null);
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
          className={styles.picker}
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <strong>
            <Check size={15} />
            {text(locale, "Saved to favorites", "已加入收藏")}
          </strong>
          <p>{item?.title}</p>
          <label className={styles.option}>
            <input type="checkbox" checked disabled />
            {text(locale, "All favorites", "全部收藏")}
          </label>
          <div className={styles.groups}>
            {groups.map((group) => (
              <label className={styles.option} key={group.id}>
                <input
                  type="checkbox"
                  checked={chosen.has(group.id)}
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
                <span title={group.name}>{group.name}</span>
                <small>{group.members.length}</small>
              </label>
            ))}
          </div>
          <label className={styles.newGroup}>
            <FolderPlus size={15} />
            <input
              value={name}
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
            {text(locale, "Done", "完成")}
          </Button>
          {notice ? <small role="status">{notice}</small> : null}
          <Popover.Arrow className={styles.arrow} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
