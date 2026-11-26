"use client";
import { SearchField } from "@/components/ui/search-field";
import { useState } from "react";
import { Check } from "lucide-react";
import { CollectionIcon } from "./collection-icon";
import {
  collectionIconCatalog,
  collectionIconCategories,
  findCollectionIcons,
} from "@/lib/saved/collection-icon-catalog";
import { text, type Locale } from "@/lib/i18n";
import styles from "./collections.module.css";
import shared from "@/components/ui/workspace.module.css";

export function CollectionIconPicker({
  locale,
  value,
  onChange,
  disabled = false,
}: {
  locale: Locale;
  value?: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const selected =
    collectionIconCatalog.find((icon) => icon.id === value) ??
    collectionIconCatalog[0];
  const icons = findCollectionIcons(query, category);
  return (
    <section className={styles.iconPicker}>
      <h3>{text(locale, "Collection icon", "分组图标")}</h3>
      <div className={styles.iconPreview}>
        <span className={styles.iconPreviewGlyph}>
          <CollectionIcon icon={selected.id} size={24} />
        </span>
        <span>
          <strong>{text(locale, selected.label, selected.zh)}</strong>
          <small>{text(locale, "Selected icon", "当前图标")}</small>
        </span>
      </div>
      <SearchField
        className={shared.input}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        placeholder={text(
          locale,
          "Search icons, e.g. book, lab, music",
          "搜索图标，例如：书、实验、音乐",
        )}
        aria-label={text(locale, "Find collection icon", "查找分组图标")}
      />
      <div
        className={styles.iconCategories}
        role="group"
        aria-label={text(locale, "Icon category", "图标类别")}
      >
        {[
          { id: "all", en: "All", zh: "全部" },
          ...collectionIconCategories,
        ].map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={category === item.id}
            onClick={() => setCategory(item.id)}
          >
            {text(locale, item.en, item.zh)}
          </button>
        ))}
      </div>
      <p className={styles.iconResultCount} role="status">
        {text(
          locale,
          `${icons.length} icons · available offline`,
          `${icons.length} 个图标 · 可离线使用`,
        )}
      </p>
      <div
        className={styles.iconGrid}
        role="group"
        aria-label={text(locale, "Choose icon", "选择图标")}
      >
        {icons.map((icon) => (
          <button
            type="button"
            key={icon.id}
            title={text(locale, icon.label, icon.zh)}
            aria-label={text(locale, icon.label, icon.zh)}
            aria-pressed={selected.id === icon.id}
            disabled={disabled}
            onClick={() => onChange(icon.id)}
          >
            <CollectionIcon icon={icon.id} size={22} />
            {selected.id === icon.id ? (
              <Check
                className={styles.iconCheck}
                size={10}
                aria-hidden="true"
              />
            ) : null}
          </button>
        ))}
      </div>
      {!icons.length ? (
        <p className={styles.iconEmpty}>
          {text(
            locale,
            "No matching icons. Try another word or category.",
            "没有匹配的图标，请尝试其他关键词或类别。",
          )}
        </p>
      ) : null}
    </section>
  );
}
