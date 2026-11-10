import { Parser } from "htmlparser2";
import type { SyllabusSection } from "./content.ts";

export type SyllabusScheduleItem = {
  label: string;
  topic: string;
  weekStart: number | null;
  weekEnd: number | null;
};
export type SyllabusSchedule = { items: SyllabusScheduleItem[]; note: string };
const compact = (value: string) => value.replace(/\s+/g, " ").trim();

function withoutHeading(value: string, title: string) {
  return value
    .trim()
    .replace(/^Syllabus\s*[-–:]\s*/i, "")
    .replace(
      new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i"),
      "",
    )
    .trim();
}

function weeks(label: string, allowBare = false) {
  const match =
    /^(?:weeks?\s*|wk\.?\s*|第\s*)?(\d{1,2})(?:\s*[-–—~至到]\s*(\d{1,2}))?\s*(?:周)?$/i.exec(
      label.trim(),
    );
  if (!match || (!allowBare && !/^(?:week|wk|第)/i.test(label)))
    return { weekStart: null, weekEnd: null };
  const start = Number(match[1]),
    end = Number(match[2] ?? match[1]);
  return start >= 1 && end >= start && end <= 52
    ? { weekStart: start, weekEnd: end }
    : { weekStart: null, weekEnd: null };
}

/** Preserve source order and ranges; do not invent dates or merge overlapping weeks. */
export function extractSyllabusSchedule(
  section: Pick<SyllabusSection, "html" | "text" | "title">,
): SyllabusSchedule {
  const rows: string[][] = [];
  const stack: { cells: string[]; cell: string | null }[] = [];
  let tableDepth = 0,
    outside = "";
  const parser = new Parser(
    {
      onopentag(tag) {
        if (tag === "table") tableDepth++;
        if (tag === "tr") stack.push({ cells: [], cell: null });
        if ((tag === "td" || tag === "th") && stack.length)
          stack[stack.length - 1].cell = "";
        if (tag === "br") {
          if (stack.length && stack[stack.length - 1].cell !== null)
            stack[stack.length - 1].cell += "\n";
          else if (!tableDepth) outside += "\n";
        }
      },
      ontext(value) {
        const row = stack[stack.length - 1];
        if (row && row.cell !== null) row.cell += value;
        else if (!tableDepth) outside += value;
      },
      onclosetag(tag) {
        const row = stack[stack.length - 1];
        if ((tag === "td" || tag === "th") && row && row.cell !== null) {
          row.cells.push(compact(row.cell));
          row.cell = null;
        }
        if (tag === "tr") {
          const completed = stack.pop();
          if (
            completed &&
            completed.cells.length >= 2 &&
            completed.cells.some(Boolean)
          )
            rows.push(completed.cells);
        }
        if (tag === "table") tableDepth--;
        if (!tableDepth && /^(p|div|li|h[1-6])$/.test(tag)) outside += "\n";
      },
    },
    { decodeEntities: true },
  );
  parser.write(section.html);
  parser.end();
  if (rows.length) {
    const weekHeader = /^(weeks?|wk\.?|周次|周|week\s*\/\s*date)$/i.test(
      rows[0][0],
    );
    const items = rows
      .filter(
        (cells) =>
          !(
            /^(weeks?|wk\.?|date|日期|周次|周)$/i.test(cells[0]) &&
            /topic|content|subject|reading|主题|内容|安排/i.test(
              cells.slice(1).join(" "),
            )
          ),
      )
      .filter((cells) => cells[0] && cells.slice(1).some(Boolean))
      .map((cells) => ({
        label: cells[0],
        topic: cells.slice(1).filter(Boolean).join(" · "),
        ...weeks(cells[0], weekHeader),
      }));
    if (items.length)
      return { items, note: withoutHeading(outside, section.title) };
  }
  const plain = withoutHeading(section.text, section.title);
  const pattern =
    /(?:^|[\s;•])((?:Weeks?|Wk\.?|第)\s*(\d{1,2})(?:\s*[-–—~至到]\s*(\d{1,2}))?\s*(?:周)?)(?:\s*[-–—.:：]\s*|\s+)/giu;
  const matches = [...plain.matchAll(pattern)];
  if (matches.length < 2) return { items: [], note: "" };
  const items = matches.flatMap((match, index) => {
    const topic = compact(
      plain.slice(
        match.index + match[0].length,
        matches[index + 1]?.index ?? plain.length,
      ),
    );
    const range = weeks(match[1]);
    return topic && range.weekStart !== null
      ? [{ label: compact(match[1]), topic, ...range }]
      : [];
  });
  return { items, note: plain.slice(0, matches[0].index).trim() };
}

export function syllabusSectionBody(html: string) {
  return html.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i, "");
}
