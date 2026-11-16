"use client";
import { Icon } from "@iconify/react";
import { collectionIconData } from "@/lib/saved/collection-icon-catalog";
export function CollectionIcon({
  icon,
  size = 16,
}: {
  icon?: string;
  size?: number;
}) {
  return (
    <Icon
      icon={collectionIconData(icon)}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
