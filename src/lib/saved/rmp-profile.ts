import { z } from "zod";
import type { RmpProfile } from "../rmp/library-types.ts";
export const savedRmpProfileSchema = z.object({
  id: z.string().regex(/^[1-9][0-9]{0,14}$/),
  username: z.string().max(100).nullable(),
  department: z.string().max(500),
  campuses: z.array(z.string().max(100)).max(20),
  quality: z.number().min(0).max(5).nullable(),
  difficulty: z.number().min(0).max(5).nullable(),
  reviewCount: z.number().int().min(0),
});
export type SavedRmpProfile = z.infer<typeof savedRmpProfileSchema>;
export type RmpBookmarkInput = Pick<
  RmpProfile,
  | "id"
  | "name"
  | "username"
  | "department"
  | "campuses"
  | "quality"
  | "difficulty"
  | "storedReviewCount"
>;
export function rmpFavorite(profile: RmpBookmarkInput) {
  const rmp = savedRmpProfileSchema.parse({
    id: profile.id,
    username: profile.username,
    department: profile.department,
    campuses: profile.campuses,
    quality: profile.quality,
    difficulty: profile.difficulty,
    reviewCount: profile.storedReviewCount,
  });
  return {
    id: "rmp:" + rmp.id,
    name: profile.name,
    email: null,
    courses: [],
    rmp,
  };
}
