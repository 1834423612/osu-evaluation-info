import { z } from "zod";
import { popularFavorites } from "@/lib/user-data/statistics";
import {
  recommendedItems,
  recommendationSubjects,
} from "@/lib/catalog/recommendations";
import { userJson, userRoute } from "@/lib/user-data/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return userRoute(async () => {
    const params = new URL(request.url).searchParams,
      kind = z
        .enum(["course", "section", "instructor"])
        .parse(params.get("kind") ?? "course"),
      subject = z
        .string()
        .max(20)
        .regex(/^[A-Z0-9 &-]*$/)
        .parse(params.get("subject") ?? ""),
      seed =
        new Date().toISOString().slice(0, 10) +
        ":" +
        z
          .string()
          .max(32)
          .parse(params.get("seed") ?? "0");
    const [popular, recommended, subjects] = await Promise.all([
      popularFavorites(kind).catch(() => ({
        asOf: new Date().toISOString(),
        items: [],
      })),
      recommendedItems(kind, subject, seed),
      recommendationSubjects(),
    ]);
    const seen = new Set<string>();
    const items = [
      ...recommended,
      ...popular.items.filter((x) => !subject || x.course?.subject === subject),
    ]
      .filter((item) => {
        if (seen.has(item.key)) return false;
        seen.add(item.key);
        return true;
      })
      .slice(0, 24);
    return userJson({ asOf: new Date().toISOString(), items, subjects });
  });
}
