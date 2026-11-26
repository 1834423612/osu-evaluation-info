"use client";
import { SearchField } from "@/components/ui/search-field";
import { useDraftGuard } from "@/components/forms/draft-guard";
import { authClient } from "@/lib/auth/client";
import { savedScope } from "@/lib/saved/scope";
import { SelectionCheckbox } from "@/components/saved/selection-checkbox";
import { useState, type ReactNode } from "react";
import { editCollections } from "@/lib/saved/collections";
import { CollectionIcon } from "@/components/saved/collection-icon";
import { browserUuid } from "@/lib/uuid";
import gallery from "./shared-gallery.module.css";
import type { Route } from "next";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  FolderOpen,
  Search,
  BookOpen,
  Users,
  CalendarDays,
  FileText,
  Cloud,
  HardDrive,
} from "lucide-react";
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
import { groupSharedItems } from "@/lib/saved/share-groups";
import { courseAcademicCareerLabel } from "@/lib/catalog/presentation";
import styles from "@/components/ui/workspace.module.css";
export function CollectionImport({
  snapshot,
  locale,
  onImported,
  onOpen,
  disabled = false,
  mode = "copy",
  renderItem,
}: {
  snapshot: SavedSnapshot;
  locale: Locale;
  onImported?: (keys: string[]) => void;
  onOpen?: (item: SavedSnapshot["items"][number]) => void;
  disabled?: boolean;
  mode?: "copy" | "sync";
  renderItem?: (item: SavedSnapshot["items"][number]) => ReactNode;
}) {
  const { data: session } = authClient.useSession();
  const accountReady = !!session?.user && !!savedScope();
  const [kind, setKind] = useState("all"),
    [folder, setFolder] = useState("all"),
    [query, setQuery] = useState(""),
    [copyFolders, setCopyFolders] = useState(true);
  const [imported, setImported] = useState(false);
  const [folderIds] = useState(
    () =>
      new Map(
        (snapshot.collections ?? []).map((collection) => [
          collection.id,
          browserUuid(),
        ]),
      ),
  );
  const [selected, setSelected] = useState(
      () => new Set(snapshot.items.map(itemKey)),
    ),
    [result, setResult] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [limit, setLimit] = useState(40);
  useDraftGuard(
    !imported &&
      (selected.size !== snapshot.items.length ||
        snapshot.items.some((item) => !selected.has(itemKey(item))) ||
        (!!snapshot.collections?.length && !copyFolders)),
  );
  let existing = new Set<string>();
  try {
    existing = new Set(readLocalItems().map(itemKey));
  } catch {}
  async function save() {
    setBusy(true);
    try {
      const scope = savedScope();
      const chosen = snapshot.items.filter((x) => selected.has(itemKey(x)));
      const outcome = await withSavedMutation(() => {
        if (scope !== savedScope()) throw Error("account_changed");
        const result = importLocalItems(chosen, mode);
        if (copyFolders && snapshot.collections?.length) {
          const keys = new Set(readLocalItems().map(itemKey));
          const incoming = snapshot.collections
            .map((collection) => ({
              ...collection,
              id: folderIds.get(collection.id)!,
              members: collection.members.filter(
                (key) => selected.has(key) && keys.has(key),
              ),
            }))
            .filter((collection) => collection.members.length);
          editCollections((live) => [
            ...live.filter(
              (collection) =>
                !incoming.some((next) => next.id === collection.id),
            ),
            ...incoming,
          ]);
        }
        return result;
      });
      setResult(
        text(
          locale,
          outcome.added + " added · " + outcome.skipped + " already saved",
          outcome.added + " 项已转存 · " + outcome.skipped + " 项已收藏",
        ),
      );
      setImported(true);
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
  const filtered = snapshot.items.filter(
    (item) =>
      (kind === "all" || item.kind === kind) &&
      (folder === "all" ||
        snapshot.collections
          ?.find((collection) => collection.id === folder)
          ?.members.includes(itemKey(item))) &&
      `${itemTitle(item)} ${itemContext(item)}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  );
  const changeSelection = (next: Set<string>) => {
    setSelected(next);
    setImported(false);
  };
  const groups = groupSharedItems(filtered.slice(0, limit), snapshot.items);
  return (
    <section
      className={gallery.workspace}
      data-compact={!renderItem || undefined}
      data-telemetry-private
    >
      {!renderItem ? (
        <h2 className={gallery.compactTitle}>{snapshot.title}</h2>
      ) : null}
      <aside
        className={gallery.sidebar}
        aria-label={text(locale, "Shared folders", "分享的分类")}
      >
        <h2>
          <FolderOpen size={15} />
          {text(locale, "Folders", "分类目录")}
        </h2>
        <button
          className={gallery.folderButton}
          aria-pressed={folder === "all"}
          onClick={() => {
            setFolder("all");
            setLimit(40);
          }}
        >
          <FolderOpen size={17} />
          <span>{text(locale, "All contents", "全部内容")}</span>
          <small>{snapshot.items.length}</small>
        </button>
        {(snapshot.collections ?? []).map((collection) => (
          <button
            key={collection.id}
            className={gallery.folderButton}
            aria-pressed={folder === collection.id}
            onClick={() => {
              setFolder(collection.id);
              setLimit(40);
            }}
          >
            <CollectionIcon icon={collection.icon} size={17} />
            <span>
              <strong>{collection.name}</strong>
              {collection.tags.length ? (
                <em>{collection.tags.join(" · ")}</em>
              ) : null}
            </span>
            <small>{collection.members.length}</small>
          </button>
        ))}
        {!!snapshot.collections?.length ? (
          <label className={gallery.keepFolders}>
            <input
              type="checkbox"
              checked={copyFolders}
              disabled={disabled || busy}
              onChange={(event) => {
                setCopyFolders(event.target.checked);
                setImported(false);
              }}
            />
            <span>
              {text(locale, "Keep folder organization", "保留分类结构")}
              <small>
                {text(
                  locale,
                  "Copy folder names, icons and tags with your selection.",
                  "转存所选内容时保留分类名称、图标与标签。",
                )}
              </small>
            </span>
          </label>
        ) : null}
        <div className={gallery.destination}>
          {accountReady ? <Cloud size={15} /> : <HardDrive size={15} />}
          <span>
            {accountReady
              ? text(locale, "Save to your account", "转存至当前账号")
              : text(locale, "Save in this browser", "转存至此浏览器")}
            <small>
              {accountReady
                ? text(
                    locale,
                    "Cross-device updates require account sync to be enabled.",
                    "开启账号同步后可在其他设备获取。",
                  )
                : text(
                    locale,
                    "Sign in to sync across devices.",
                    "登录后可跨设备同步。",
                  )}
            </small>
          </span>
        </div>
      </aside>
      <div className={gallery.main}>
        <div className={gallery.browseHeading}>
          <div>
            <h2>
              {folder === "all"
                ? text(locale, "Shared contents", "分享内容")
                : snapshot.collections?.find(
                    (collection) => collection.id === folder,
                  )?.name}
            </h2>
            <p>
              {filtered.length} {text(locale, "items in this view", "项内容")} ·{" "}
              {text(locale, "Preview before copying", "可先预览，再转存")}
            </p>
          </div>
          <label className={gallery.search}>
            <Search size={15} />
            <SearchField
              name="shared-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setLimit(40);
              }}
              placeholder={text(
                locale,
                "Find a course or teacher…",
                "查找课程或教师…",
              )}
              aria-label={text(
                locale,
                "Search shared contents",
                "搜索分享内容",
              )}
            />
          </label>
        </div>
        <div
          className={gallery.filters}
          aria-label={text(locale, "Content types", "内容类型")}
        >
          {["all", "course", "section", "instructor", "syllabus"].map(
            (value) => {
              const Icon =
                value === "course"
                  ? BookOpen
                  : value === "section"
                    ? CalendarDays
                    : value === "instructor"
                      ? Users
                      : value === "syllabus"
                        ? FileText
                        : FolderOpen;
              return (
                <button
                  key={value}
                  aria-pressed={kind === value}
                  onClick={() => {
                    setKind(value);
                    setLimit(40);
                  }}
                >
                  <Icon size={14} />
                  {value === "all"
                    ? text(locale, "All", "全部")
                    : itemKindName(
                        value as SavedSnapshot["items"][number]["kind"],
                        locale,
                      )}
                  <small>
                    {
                      snapshot.items.filter(
                        (item) => value === "all" || item.kind === value,
                      ).length
                    }
                  </small>
                </button>
              );
            },
          )}
        </div>
        <div className={gallery.selectionBar}>
          <SelectionCheckbox
            keys={filtered.map(itemKey)}
            selected={selected}
            onChange={changeSelection}
            label={text(locale, "Select this view", "全选当前列表")}
            disabled={disabled || busy}
          />
          <span aria-live="polite">
            {selected.size} {text(locale, "selected", "项已选")}
          </span>
          <Button
            disabled={disabled || !selected.size || busy}
            onClick={() => void save()}
          >
            <Check size={14} />
            {busy
              ? text(locale, "Saving…", "正在转存…")
              : text(locale, "Save selected", "转存所选")}{" "}
            · {selected.size}
          </Button>
        </div>
        {result ? (
          <p className={gallery.result} role="status">
            {result}
          </p>
        ) : null}
        <div className={gallery.groups}>
          {groups.map((group) => (
            <section key={group.id} className={gallery.contentGroup}>
              <header className={gallery.groupHeading}>
                <div>
                  <h3>
                    {group.kind === "course" ? (
                      <BookOpen size={17} />
                    ) : (
                      <Users size={17} />
                    )}
                    {group.kind === "course"
                      ? group.label
                      : text(locale, "Teachers", "教师")}
                  </h3>
                  {group.kind === "course" && group.title ? (
                    <p>{group.title}</p>
                  ) : null}
                </div>
                {group.kind === "course" ? (
                  <div className={gallery.groupContext}>
                    <span>
                      <CalendarDays size={13} />
                      {group.term ||
                        group.termCode ||
                        text(locale, "Term unspecified", "未标明学期")}
                    </span>
                    <span>
                      {group.campus ||
                        group.campusCode ||
                        text(locale, "Campus unspecified", "未标明校区")}
                    </span>
                  </div>
                ) : null}
              </header>
              <ul className={gallery.groupItems}>
                {group.items.map((item) => {
                  const key = itemKey(item),
                    href = itemHref(item);
                  const title =
                    item.kind === "course"
                      ? text(locale, "Course overview", "课程概览")
                      : item.kind === "instructor"
                        ? item.payload.name
                        : `${item.kind === "section" ? item.payload.section.component : text(locale, "Section", "班次")} ${item.payload.section.section} · #${item.payload.section.classNumber}`;
                  const career =
                    item.kind === "course"
                      ? courseAcademicCareerLabel(item.payload, locale)
                      : "";
                  const content =
                    renderItem?.(item) ??
                    (item.kind === "instructor" ? (
                      item.payload.courses.length ? (
                        <div className={gallery.teacherContext}>
                          <strong>
                            {text(locale, "Related courses", "相关课程")}
                          </strong>
                          <ul>
                            {item.payload.courses.map((course) => (
                              <li key={course.id}>
                                <span>
                                  {course.label}
                                  <small>{course.title}</small>
                                </span>
                                <span>
                                  {[
                                    course.term || course.termCode,
                                    course.campusCode,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : item.payload.rmp ? (
                        <p>
                          {text(
                            locale,
                            "Rate My Professors profile",
                            "Rate My Professors 资料",
                          )}
                        </p>
                      ) : null
                    ) : item.kind === "syllabus" ? (
                      <p>
                        {[
                          item.payload.section.component,
                          item.payload.section.session,
                          item.payload.entry.subtitle,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    ) : item.kind === "section" ? (
                      <p>{item.payload.section.session}</p>
                    ) : null);
                  return (
                    <li
                      key={key}
                      className={gallery.item}
                      data-kind={item.kind}
                      data-selected={selected.has(key) || undefined}
                    >
                      <div className={gallery.itemHeading}>
                        <label>
                          <input
                            className={styles.checkbox}
                            type="checkbox"
                            disabled={disabled || busy}
                            checked={selected.has(key)}
                            aria-label={
                              text(locale, "Select ", "选择 ") + itemTitle(item)
                            }
                            onChange={() => {
                              const next = new Set(selected);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              changeSelection(next);
                            }}
                          />
                          <span>
                            <strong>{title}</strong>
                            {item.kind === "course" ? (
                              <small>
                                {item.payload.creditsMin}
                                {item.payload.creditsMax !==
                                item.payload.creditsMin
                                  ? `–${item.payload.creditsMax}`
                                  : ""}{" "}
                                {text(locale, "credits", "学分")}
                                {career ? ` · ${career}` : ""}
                              </small>
                            ) : null}
                          </span>
                        </label>
                        <span className={gallery.kind} data-kind={item.kind}>
                          {item.kind === "course" ? (
                            <BookOpen size={12} />
                          ) : item.kind === "section" ? (
                            <CalendarDays size={12} />
                          ) : item.kind === "instructor" ? (
                            <Users size={12} />
                          ) : (
                            <FileText size={12} />
                          )}
                          {itemKindName(item.kind, locale)}
                        </span>
                        {onOpen && href ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              text(locale, "Preview ", "预览 ") +
                              itemTitle(item)
                            }
                            onClick={() => onOpen(item)}
                          >
                            <ExternalLink size={15} />
                          </Button>
                        ) : href ? (
                          <Link
                            className={gallery.openItem}
                            href={href as Route}
                            aria-label={
                              text(locale, "Open ", "打开 ") + itemTitle(item)
                            }
                          >
                            <ExternalLink size={15} />
                          </Link>
                        ) : null}
                      </div>
                      {content ? (
                        <div className={gallery.itemBody}>{content}</div>
                      ) : null}
                      {existing.has(key) ? (
                        <span className={gallery.already}>
                          <Check size={11} />
                          {text(
                            locale,
                            "Already in your favorites",
                            "已在你的收藏中",
                          )}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
        {!filtered.length ? (
          <div className={gallery.empty}>
            <Search size={24} />
            <h3>{text(locale, "No matching items", "没有匹配的内容")}</h3>
            <p>
              {text(
                locale,
                "Try another category or search term.",
                "可切换分类或修改搜索内容。",
              )}
            </p>
          </div>
        ) : null}
        {limit < filtered.length ? (
          <Button
            variant="outline"
            onClick={() => setLimit((value) => value + 40)}
          >
            {text(locale, "Show more", "显示更多")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
