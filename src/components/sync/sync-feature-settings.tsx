"use client";
import { useState } from "react";
import { Bookmark, CalendarDays, Route, Check, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { syncFeatures, type SyncFeature } from "@/lib/sync/features";
import { setFeatureSync } from "@/lib/sync/client";
import type { SyncState } from "@/lib/sync/model";
import { text, type Locale } from "@/lib/i18n";
import { notify } from "@/lib/notify";
import styles from "./sync-feature-settings.module.css";
export function SyncFeatureSettings({
  state,
  account,
  locale,
}: {
  state: SyncState | null;
  account: string;
  locale: Locale;
}) {
  const [busy, setBusy] = useState(false);
  const settings = syncFeatures(state ?? {});
  const features: {
    key: SyncFeature;
    en: string;
    zh: string;
    Icon: typeof Bookmark;
  }[] = [
    {
      key: "favorites",
      en: "Favorites & folders",
      zh: "收藏与分类",
      Icon: Bookmark,
    },
    { key: "planning", en: "Academic plans", zh: "学期规划", Icon: Route },
    {
      key: "calendars",
      en: "Calendars & subscriptions",
      zh: "日历与订阅",
      Icon: CalendarDays,
    },
  ];
  return (
    <div className={styles.root}>
      <p>
        {text(
          locale,
          "Choose what this device syncs. Pausing keeps existing data on both sides.",
          "选择此设备需要同步的功能。暂停会保留本机与云端的现有数据。",
        )}
      </p>
      {features.map(({ key, en, zh, Icon }) => (
        <div className={styles.row} key={key}>
          <Icon size={17} />
          <span>{text(locale, en, zh)}</span>
          <Button
            role="switch"
            aria-checked={settings[key]}
            aria-label={text(locale, en, zh)}
            variant="outline"
            size="sm"
            disabled={!state?.enabled || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await setFeatureSync(account, key, !settings[key]);
              } catch {
                notify(
                  text(
                    locale,
                    "Could not save sync settings.",
                    "未能保存同步设置。",
                  ),
                  "error",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            {settings[key] ? <Check size={13} /> : <Pause size={13} />}{" "}
            {settings[key]
              ? text(locale, "On", "已开启")
              : text(locale, "Paused", "已暂停")}
          </Button>
        </div>
      ))}
    </div>
  );
}
