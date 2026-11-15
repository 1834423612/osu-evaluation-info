"use client";
import { Icon } from "@iconify/react";
import { collectionIcons } from "@/lib/saved/collection-icons";
export function CollectionIcon({
  icon,
  size = 16,
}: {
  icon?: string;
  size?: number;
}) {
  const asset =
    collectionIcons.find((x) => x.id === icon) ?? collectionIcons[0];
  return (
    <Icon
      icon={{ body: asset.body, width: 24, height: 24 }}
      width={size}
      height={size}
      aria-hidden="true"
    />
  );
}
