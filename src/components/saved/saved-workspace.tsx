"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Check, Cloud, CloudOff, Folder, HardDrive } from "lucide-react";
import { readCollections } from "@/lib/saved/collections";
import { readLocalItems } from "@/lib/saved/local";
import { itemKey, type ExchangeItem } from "@/lib/saved/exchange";
import type { SavedCollection } from "@/lib/saved/collection-schema";
import { savedScope } from "@/lib/saved/scope";
import { readSyncState, SYNC_EVENT } from "@/lib/sync/client";
import type { SyncState } from "@/lib/sync/model";
import {
  cloudHasItem,
  hasPendingSavedChanges,
} from "@/lib/sync/storage-status";
import { text, type Locale } from "@/lib/i18n";
import styles from "./workspace.module.css";
type State = {
  items: ExchangeItem[];
  setItems: Dispatch<SetStateAction<ExchangeItem[]>>;
  collections: SavedCollection[];
  setCollections: Dispatch<SetStateAction<SavedCollection[]>>;
  active: string;
  setActive: Dispatch<SetStateAction<string>>;
  selected: Set<string>;
  setSelected: Dispatch<SetStateAction<Set<string>>>;
  selecting: boolean;
  setSelecting: Dispatch<SetStateAction<boolean>>;
  kind: string;
  setKind: Dispatch<SetStateAction<string>>;
  sync: SyncState | null;
  scope: string | null;
};
const Context = createContext<State | null>(null);
export function SavedWorkspace({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ExchangeItem[]>([]),
    [collections, setCollections] = useState<SavedCollection[]>([]),
    [active, setActive] = useState("all"),
    [selected, setSelected] = useState(new Set<string>()),
    [selecting, setSelecting] = useState(false),
    [kind, setKind] = useState("all"),
    [sync, setSync] = useState<SyncState | null>(null),
    [scope, setScope] = useState<string | null>(null);
  const currentScope = useRef<string | null>(null);
  useEffect(() => {
    let live = true,
      revision = 0;
    const refresh = () => {
      const stamp = ++revision,
        nextScope = savedScope();
      if (nextScope !== currentScope.current) {
        currentScope.current = nextScope;
        setSelected(new Set());
        setActive("all");
        setSelecting(false);
        setSync(null);
      }
      setScope(nextScope);
      try {
        const next = readLocalItems();
        setItems(next);
        setCollections(readCollections());
        const keys = new Set(next.map(itemKey));
        setSelected((old) => new Set([...old].filter((key) => keys.has(key))));
      } catch {}
      if (nextScope)
        void readSyncState(nextScope)
          .then((state) => {
            if (live && stamp === revision) setSync(state);
          })
          .catch(() => {
            if (live && stamp === revision) setSync(null);
          });
    };
    refresh();
    for (const name of ["course-atlas:preferences", "storage", SYNC_EVENT])
      window.addEventListener(name, refresh);
    return () => {
      live = false;
      for (const name of ["course-atlas:preferences", "storage", SYNC_EVENT])
        window.removeEventListener(name, refresh);
    };
  }, []);
  return (
    <Context.Provider
      value={{
        items,
        setItems,
        collections,
        setCollections,
        active,
        setActive,
        selected,
        setSelected,
        selecting,
        setSelecting,
        kind,
        setKind,
        sync,
        scope,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSavedWorkspace() {
  const state = useContext(Context);
  if (!state) throw Error("Saved workspace is missing");
  return state;
}
export function SavedStorageSummary({ locale }: { locale: Locale }) {
  const { sync, scope, items, collections } = useSavedWorkspace();
  const pending =
    !!sync &&
    hasPendingSavedChanges(sync, [
      ...items,
      ...collections.map((payload) => ({
        kind: "collection" as const,
        payload,
      })),
    ]);
  const message = !scope
    ? text(
        locale,
        "Saved in this browser · Cloud sync is off",
        "保存在此浏览器 · 云同步未开启",
      )
    : !sync
      ? text(
          locale,
          "Saved in this browser · Checking cloud status",
          "保存在此浏览器 · 正在核对云端状态",
        )
      : !sync.enabled
        ? text(
            locale,
            "Saved in this browser · Sync paused",
            "保存在此浏览器 · 同步已暂停",
          )
        : sync.problem || pending
          ? text(
              locale,
              "Saved in this browser · Changes waiting to sync",
              "保存在此浏览器 · 部分改动待同步",
            )
          : text(
              locale,
              "Saved in this browser and synced to your account",
              "保存在此浏览器，并已同步至账号",
            );
  return (
    <span className={styles.storage}>
      <Cloud size={14} />
      {message}
    </span>
  );
}
export function SavedCardFrame({
  id,
  title,
  locale,
  children,
}: {
  id: string;
  title: string;
  locale: Locale;
  children: ReactNode;
}) {
  const { items, collections, active, selected, setSelected, selecting, sync } =
    useSavedWorkspace();
  const collection = collections.find((x) => x.id === active);
  if (collection && !collection.members.includes(id)) return null;
  const item = items.find((x) => itemKey(x) === id);
  const cloud = !!item && cloudHasItem(sync, item);
  const groups = collections.filter((x) => x.members.includes(id));
  return (
    <div
      className={styles.cardFrame}
      data-selected={selecting && selected.has(id)}
    >
      {selecting ? (
        <label className={styles.cardPick}>
          <input
            type="checkbox"
            checked={selected.has(id)}
            onChange={() =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
          />
          {text(locale, "Select ", "选择 ")}
          {title}
        </label>
      ) : null}
      {children}
      <div className={styles.cardMeta}>
        <span>
          <HardDrive size={12} />
          {text(locale, "Local", "本地保存")}
          <Check size={12} />
        </span>
        <span data-cloud={cloud}>
          {cloud ? <Cloud size={12} /> : <CloudOff size={12} />}{" "}
          {text(
            locale,
            cloud
              ? "Cloud saved"
              : sync?.enabled
                ? "Pending sync"
                : "Cloud off",
            cloud ? "云端保存" : sync?.enabled ? "待同步" : "云同步未开启",
          )}
          {cloud ? <Check size={12} /> : null}
        </span>
        {groups.length ? (
          <span className={styles.groupMeta}>
            <Folder size={12} />
            {groups.map((x) => x.name).join(" · ")}
          </span>
        ) : null}
      </div>
    </div>
  );
}
