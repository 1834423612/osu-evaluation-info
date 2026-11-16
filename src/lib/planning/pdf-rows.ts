import type { PdfLine } from "./parser.ts";

/** Rejoin wrapped report rows, retaining table columns and their source page. */
export function reportRows(lines: PdfLine[], standard: boolean): PdfLine[] {
  if (!standard) return lines;
  const rows: PdfLine[] = [];
  const balance = (text: string) =>
    (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0);
  for (const line of lines) {
    const previous = rows.at(-1);
    const value = line.text.trim();
    const continuation =
      previous &&
      balance(previous.text) > 0 &&
      !/^[–—-]{2}|AUDIT REPORT|^Courses:|@|https?:|^Page \d|^\d+\s*\/\s*\d+/.test(
        value,
      );
    const programCode =
      previous &&
      / -\s*$/.test(previous.text) &&
      /^[A-Z0-9]+-(?:BA|BS|PRE|MN|CT)$/.test(value);
    if (previous && (continuation || programCode)) {
      previous.text += " " + value;
      previous.cells = [...(previous.cells ?? []), ...(line.cells ?? [])];
    } else rows.push({ ...line, cells: line.cells?.slice() });
  }
  return rows;
}
