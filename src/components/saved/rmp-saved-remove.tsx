"use client";
import type { SavedInstructor } from "@/hooks/use-preferences";
import { RmpSaveButton } from "@/components/rmp/rmp-save-button";
export function RmpSavedRemove({
  instructor,
}: {
  instructor: SavedInstructor;
}) {
  if (!instructor.rmp) return null;
  return (
    <RmpSaveButton
      profile={{
        ...instructor.rmp,
        name: instructor.name,
        storedReviewCount: instructor.rmp.reviewCount,
      }}
    />
  );
}
