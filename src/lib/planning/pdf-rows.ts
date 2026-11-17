import type { PdfLine } from "./parser.ts";

/** Rejoin wrapped report rows, retaining table columns and their source page. */
export function reportRows(lines: PdfLine[], standard: boolean): PdfLine[] {
  const rows: PdfLine[] = [];
  const balance = (text: string) =>
    (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0);
  for (const input of lines) {
    // Student-plan headings share a visual row with the advisor column.
    // Discard that private column before joining the academic program heading.
    const line = /^Programs:/.test(input.text.trim())
      ? {
          ...input,
          text: input.text
            .replace(/^Programs:\s*/, "")
            .split(/\s+Advisor:/i)[0],
          cells: undefined,
        }
      : input;
    const previous = rows.at(-1);
    const value = line.text.trim();
    const continuation =
      standard &&
      previous &&
      balance(previous.text) > 0 &&
      !/^[–—-]{2}|AUDIT REPORT|^Courses:|@|https?:|^Page \d|^\d+\s*\/\s*\d+/.test(
        value,
      );
    const lastCell = previous?.cells?.find((c) => /[A-Za-z]/.test(c.text));
    const firstCell = line.cells?.find((c) => /[A-Za-z]/.test(c.text));
    const sameHeading =
      previous &&
      lastCell &&
      firstCell &&
      lastCell.font === firstCell.font &&
      Math.abs(lastCell.x - firstCell.x) < 2 &&
      ((standard &&
        (lastCell.height ?? 0) >= 12 &&
        (firstCell.height ?? 0) >= 12 &&
        /^(?:General |Civic Literacy|Additional |Non-ASC|Courses |New General|Legacy General)/.test(
          previous.text,
        )) ||
        (!standard &&
          (lastCell.height ?? 0) === firstCell.height &&
          /^(?:\d+ )?Theme:/.test(previous.text) &&
          !/^Theme:/.test(value) &&
          /^[a-z]/.test(value)));
    const wrappedRule =
      standard &&
      previous &&
      previous.text.length > 90 &&
      /^[–—-]{2}/.test(previous.text) &&
      !/\((?:Courses:|through|\d)/.test(previous.text) &&
      /^[A-Za-z].*\((?:Courses:|through)/.test(value) &&
      !/^[A-Z][A-Z&]+ \d{4}/.test(value);
    const programCode =
      previous &&
      / -\s*$/.test(previous.text) &&
      /^(?:(?:UGRD - )?Pre Major - )?[A-Z0-9]+-(?:BA|BS|PRE|MN|CT)$/.test(
        value,
      );
    if (
      previous &&
      (continuation ||
        sameHeading ||
        wrappedRule ||
        programCode ||
        (/General Education Requirements.*-\s*$/.test(previous.text) &&
          /^AU20\d{2}$/.test(value)))
    ) {
      previous.text =
        (wrappedRule
          ? previous.text.replace(
              /\s+(?:Autumn|Spring|Summer)\s*['’]?\d{2,4}.*$/,
              "",
            )
          : previous.text) +
        " " +
        value;
      previous.cells = [...(previous.cells ?? []), ...(line.cells ?? [])];
    } else rows.push({ ...line, cells: line.cells?.slice() });
  }
  return rows;
}
