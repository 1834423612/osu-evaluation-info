"use client";
import { Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePreferences } from "@/hooks/use-preferences";
import { text } from "@/lib/i18n";
import type { RmpBookmarkInput } from "@/lib/saved/rmp-profile";
export function RmpSaveButton({
  profile,
  compact = false,
}: {
  profile: RmpBookmarkInput;
  compact?: boolean;
}) {
  const { locale, savedInstructors, toggleRmpProfile } = usePreferences(),
    saved = savedInstructors.some(
      (x) => x.id === "rmp:" + profile.id && !!x.rmp,
    );
  return (
    <Button
      variant="outline"
      size={compact ? "icon-sm" : "sm"}
      aria-pressed={saved}
      aria-label={text(
        locale,
        `${saved ? "Unsave" : "Save"} ${profile.name}`,
        `${saved ? "取消收藏" : "收藏"} ${profile.name}`,
      )}
      onClick={() => void toggleRmpProfile(profile)}
    >
      <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
      {compact
        ? null
        : saved
          ? text(locale, "Saved", "已收藏")
          : text(locale, "Save", "收藏")}
    </Button>
  );
}
