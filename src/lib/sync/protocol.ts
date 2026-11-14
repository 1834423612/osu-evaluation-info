import { z } from "zod";
import {
  exchangeItemSchema,
  itemKey,
  type ExchangeItem,
} from "../saved/exchange.ts";
export const syncOperationSchema = z
  .object({
    id: z.uuid(),
    key: z.string().min(1).max(320),
    base: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    item: exchangeItemSchema.nullable(),
  })
  .superRefine((op, ctx) => {
    if (
      !/^(course|section|instructor|syllabus):[^\u0000-\u001f]+$/.test(
        op.key,
      ) ||
      (op.item && itemKey(op.item) !== op.key) ||
      JSON.stringify(op.item).length > 32000
    )
      ctx.addIssue({
        code: "custom",
        message: "Invalid sync identity or size",
      });
  });
export const syncRequestSchema = z.object({
  cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  operations: z.array(syncOperationSchema).max(100),
});
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncRecord = {
  key: string;
  version: number;
  item: ExchangeItem | null;
};
export type SyncReceipt = {
  id: string;
  status: "applied" | "conflict";
  record: SyncRecord;
};
export type SyncResponse = {
  accountId: string;
  cursor: number;
  floor: number;
  reset: boolean;
  records: SyncRecord[];
  receipts: SyncReceipt[];
};
const recordSchema = z.object({
  key: z.string().max(320),
  version: z.number().int().min(0),
  item: exchangeItemSchema.nullable(),
});
export const syncResponseSchema = z.object({
  accountId: z.string(),
  cursor: z.number().int().min(0),
  floor: z.number().int().min(0),
  reset: z.boolean(),
  records: z.array(recordSchema).max(10000),
  receipts: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.enum(["applied", "conflict"]),
        record: recordSchema,
      }),
    )
    .max(100),
});
// Stable comparison ignores object property order, never uses device clocks.
export function sameItem(a: unknown, b: unknown): boolean {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => [k, canonical(x)]),
      );
    return v;
  }
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
