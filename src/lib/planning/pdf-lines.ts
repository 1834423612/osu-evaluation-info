import type { PdfLine } from "./parser.ts";
type Item = { str: string; transform: number[]; width?: number };
/** Preserve table cells in memory; never persist text or coordinates in a plan. */
export function planningLines(
  items: readonly unknown[],
  page: number,
): PdfLine[] {
  const rows = new Map<
    number,
    Array<{ x: number; text: string; width?: number }>
  >();
  for (const value of items) {
    if (
      !value ||
      typeof value !== "object" ||
      !("str" in value) ||
      !("transform" in value)
    )
      continue;
    const item = value as Item;
    if (!item.str.trim()) continue;
    const y = Math.round(item.transform[5] / 3) * 3;
    const row = rows.get(y) ?? [];
    row.push({ x: item.transform[4], text: item.str, width: item.width });
    rows.set(y, row);
  }
  return [...rows]
    .sort((a, b) => b[0] - a[0])
    .map(([, cells]) => {
      cells.sort((a, b) => a.x - b.x);
      return { page, cells, text: cells.map((x) => x.text).join(" ") };
    });
}
