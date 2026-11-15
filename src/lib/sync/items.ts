import { z } from "zod";
import {
  exchangeItemSchema,
  itemTitle,
  itemContext,
  type ExchangeItem,
} from "../saved/exchange.ts";
import { collectionSchema } from "../saved/collection-schema.ts";
export const syncItemSchema = z.union([
  exchangeItemSchema,
  z.object({ kind: z.literal("collection"), payload: collectionSchema }),
]);
export type SyncItem = z.infer<typeof syncItemSchema>;
export function syncItemKey(item: SyncItem) {
  return item.kind + ":" + item.payload.id;
}
export function syncItemTitle(item: SyncItem) {
  return item.kind === "collection" ? item.payload.name : itemTitle(item);
}
export function syncItemContext(item: SyncItem) {
  return item.kind === "collection"
    ? item.payload.tags.join(" · ") + " · " + item.payload.members.length
    : itemContext(item);
}
export function favoriteItems(items: SyncItem[]): ExchangeItem[] {
  return items.filter((x): x is ExchangeItem => x.kind !== "collection");
}
/** Bound the actual JSON request as well as operation count. */
export function syncBatch<T>(operations: T[]) {
  const batch: T[] = [];
  let bytes = 200;
  for (const operation of operations.slice(0, 100)) {
    const size =
      new TextEncoder().encode(JSON.stringify(operation)).byteLength + 1;
    if (bytes + size > 900000) break;
    batch.push(operation);
    bytes += size;
  }
  return batch;
}
