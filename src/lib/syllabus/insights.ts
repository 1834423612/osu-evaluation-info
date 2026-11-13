import { Parser } from "htmlparser2";
import type { SyllabusSection } from "./content.ts";

export type SchedulePart = { text: string; href?: string };
export type ScheduleBlock = { parts: SchedulePart[]; reading: boolean };
export type ScheduleSession = { label: string; blocks: ScheduleBlock[] };
export type SyllabusScheduleItem = {
  label: string;
  topic: string;
  topicParts?: SchedulePart[];
  weekStart: number | null;
  weekEnd: number | null;
  blocks: ScheduleBlock[];
  sessions: ScheduleSession[];
};
export type SyllabusSchedule = { items: SyllabusScheduleItem[]; note: string };
const compact = (value: string) => value.replace(/\s+/g, " ").trim();
export const scheduleBlockText = (block: ScheduleBlock) =>
  compact(block.parts.map((part) => part.text).join(""));
const plainBlock = (value: string): ScheduleBlock => ({
  parts: [{ text: value }],
  reading: false,
});
const safeLink = (value: string) =>
  /^(?:https?:\/\/|mailto:)/i.test(value) ? value : undefined;

function withoutHeading(value: string, title: string) {
  const lines = value.trim().replace(/^Syllabus\s*[-–:]\s*/i, "");
  return lines.toLowerCase().startsWith(title.trim().toLowerCase())
    ? lines.slice(title.trim().length).trim()
    : lines;
}

function weeks(label: string, allowBare = false) {
  const match =
    /^(?:weeks?\s*|wk\.?\s*|w\s*|第\s*)?(\d{1,2})(?:\s*[-–—~至到]\s*(\d{1,2}))?\s*(?:周)?$/i.exec(
      label.trim(),
    );
  if (!match || (!allowBare && !/^(?:week|wk|w|第)/i.test(label)))
    return { weekStart: null, weekEnd: null };
  const start = Number(match[1]),
    end = Number(match[2] ?? match[1]);
  return start >= 1 && end >= start && end <= 52
    ? { weekStart: start, weekEnd: end }
    : { weekStart: null, weekEnd: null };
}

const weekHeading =
  /^(?:Weeks?|Wk\.?|W|第)\s*\d{1,2}(?:\s*[-–—~至到]\s*\d{1,2})?\s*(?:周)?(?=[:：.\s–—-]|$)/iu;
const moduleHeading =
  /^(?:Modules?|Units?|Lessons?|Sessions?)\s*\d{1,3}(?:\s*[-–—]\s*\d{1,3})?(?=[:：.\s–—-]|$)/iu;
const bareHeading = /^\d{1,2}(?:\s*[-–—~至到]\s*\d{1,2})?(?=[:：.\s]|$)/u;
const months =
  "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\.?";
const day = "(?:0?[1-9]|[12]\\d|3[01])(?:st|nd|rd|th)?";
const weekday =
  "(?:(?:Mon(?:day)?|Tue(?:s(?:day)?)?|Wed(?:nesday)?|Thu(?:rs(?:day)?)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?)\\.?[, \\t]+)?";
const dateHeading = new RegExp(
  `^${weekday}(?:${months}\\s+${day}(?:,?\\s+20\\d{2})?|${day}\\s+${months}(?:,?\\s+20\\d{2})?|20\\d{2}-\\d{1,2}-\\d{1,2}|(?:0?[1-9]|1[0-2])\\/${day}(?:\\/(?:20)?\\d{2})?|\\d{1,2}月\\d{1,2}日)(?=[:：., \\t–—-]|$)`,
  "iu",
);

function heading(block: ScheduleBlock, allowBare = false) {
  const value = scheduleBlockText(block);
  const week =
    weekHeading.exec(value) ?? (allowBare ? bareHeading.exec(value) : null);
  const unitMatch = moduleHeading.exec(value);
  const match = week ?? unitMatch ?? dateHeading.exec(value);
  if (
    !match ||
    (block.reading &&
      !week &&
      !unitMatch &&
      !/^\s*[:：]/.test(value.slice(match[0].length)))
  )
    return null;
  const rest = value
    .slice(match[0].length)
    .replace(/^\s*[:：.–—-]\s*/, "")
    .trim();
  const raw = block.parts.map((part) => part.text).join("");
  const start = rest ? raw.indexOf(rest, match[0].length) : -1;
  let cursor = 0;
  const restParts =
    start >= 0
      ? block.parts.flatMap((part) => {
          const end = cursor + part.text.length;
          const text = part.text.slice(Math.max(0, start - cursor));
          cursor = end;
          return end > start && text ? [{ ...part, text }] : [];
        })
      : [{ text: rest }];
  return {
    label: match[0].trim(),
    rest,
    restParts,
    week: weeks(match[0], allowBare),
    kind: week ? "week" : unitMatch ? "module" : "date",
  };
}

/** Read block boundaries and inline links once, without flattening readings into a heading. */
function readBlocks(html: string) {
  const outside: ScheduleBlock[] = [];
  const rows: ScheduleBlock[][][] = [];
  const stack: { cells: ScheduleBlock[][]; current: ScheduleBlock[] | null }[] =
    [];
  let tableDepth = 0,
    parts: SchedulePart[] = [],
    reading = false,
    href: string | undefined;
  const destination = () =>
    stack.at(-1)?.current ?? (tableDepth ? null : outside);
  function flush() {
    const target = destination();
    const normalized = parts.map((part) => ({
      ...part,
      text: part.text.replace(/\s+/g, " "),
    }));
    if (normalized.length) {
      normalized[0].text = normalized[0].text.trimStart();
      normalized[normalized.length - 1].text = normalized
        .at(-1)!
        .text.trimEnd();
    }
    if (target && normalized.some((part) => part.text.trim()))
      target.push({ parts: normalized, reading });
    parts = [];
  }
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (tag === "table") {
          flush();
          tableDepth++;
        }
        if (tag === "tr") {
          flush();
          stack.push({ cells: [], current: null });
        }
        if (tag === "td" || tag === "th") {
          flush();
          const row = stack.at(-1);
          if (row) row.current = [];
        }
        if (/^(?:p|li|h[1-6])$/.test(tag)) {
          flush();
          reading = tag === "li";
        }
        if (tag === "br") flush();
        if (tag === "a") href = safeLink(attrs.href ?? "");
      },
      ontext(value) {
        if (!destination()) return;
        const last = parts.at(-1);
        if (last && last.href === href) last.text += value;
        else parts.push({ text: value, ...(href ? { href } : {}) });
      },
      onclosetag(tag) {
        if (tag === "a") href = undefined;
        if (/^(?:p|div|li|h[1-6])$/.test(tag)) {
          flush();
          reading = false;
        }
        if (tag === "td" || tag === "th") {
          flush();
          const row = stack.at(-1);
          if (row?.current) {
            row.cells.push(row.current);
            row.current = null;
          }
        }
        if (tag === "tr") {
          flush();
          const row = stack.pop();
          if (row && row.cells.length >= 2) rows.push(row.cells);
        }
        if (tag === "table") {
          flush();
          tableDepth = Math.max(0, tableDepth - 1);
        }
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();
  flush();
  return { outside, rows };
}

function append(item: SyllabusScheduleItem, block: ScheduleBlock) {
  const h = heading(block);
  if (h?.kind === "date") {
    item.sessions.push({
      label: h.label,
      blocks: h.rest ? [{ parts: h.restParts, reading: false }] : [],
    });
  } else if (item.sessions.length) item.sessions.at(-1)!.blocks.push(block);
  else item.blocks.push(block);
}
function item(
  label: string,
  topic = "",
  allowBare = false,
): SyllabusScheduleItem {
  return { label, topic, ...weeks(label, allowBare), blocks: [], sessions: [] };
}

function splitInlineHeadings(block: ScheduleBlock): ScheduleBlock[] {
  if (
    block.reading ||
    !/^(?:weeks?|wk\.?|modules?|units?)\s*\d/i.test(scheduleBlockText(block))
  )
    return [block];
  const raw = block.parts.map((part) => part.text).join("");
  const pattern =
    /(?:^|[;\s]+)((?:weeks?|wk\.?|modules?|units?)\s*\d{1,2}(?:\s*[-–—~至到]\s*\d{1,2})?)(?=[:：.\s–—-]|$)/giu;
  const matches = [...raw.matchAll(pattern)];
  if (matches.length < 2) return [block];
  return matches.map((match, index) => {
    const start = match.index + match[0].indexOf(match[1]);
    const end = matches[index + 1]?.index ?? raw.length;
    let cursor = 0;
    const parts = block.parts.flatMap((part) => {
      const from = Math.max(0, start - cursor),
        to = Math.min(part.text.length, end - cursor);
      cursor += part.text.length;
      return to > from ? [{ ...part, text: part.text.slice(from, to) }] : [];
    });
    return { ...block, parts };
  });
}

/** Preserve source order, dates, ranges, readings and links. Unknown formats use the source HTML. */
export function extractSyllabusSchedule(
  section: Pick<SyllabusSection, "html" | "text" | "title">,
): SyllabusSchedule {
  const { outside, rows } = readBlocks(section.html);
  if (rows.length) {
    const first = rows[0].map((cell) => cell.map(scheduleBlockText).join(" "));
    const weekHeader = /^(weeks?|wk\.?|周次|周|week\s*\/\s*date)$/i.test(
      first[0],
    );
    const items = rows.flatMap((cells) => {
      const label = compact(cells[0].map(scheduleBlockText).join(" "));
      const body = cells.slice(1).flat();
      if (
        !label ||
        !body.length ||
        /^(weeks?|wk\.?|date|日期|周次|周|week\s*\/\s*date)$/i.test(label)
      )
        return [];
      const result = item(label, "", weekHeader);
      for (const block of body) {
        if (
          !block.reading &&
          !result.topic &&
          !result.blocks.length &&
          !result.sessions.length &&
          !heading(block)
        ) {
          result.topic = scheduleBlockText(block);
          result.topicParts = block.parts;
        } else append(result, block);
      }
      return [result];
    });
    if (items.length)
      return {
        items,
        note: withoutHeading(
          outside.map(scheduleBlockText).join("\n"),
          section.title,
        ),
      };
  }
  const blocks = (
    outside.length
      ? outside
      : section.text.split(/\n+/).filter(Boolean).map(plainBlock)
  ).flatMap(splitInlineHeadings);
  const allowBare = blocks.some((block) =>
    /^(?:week\s*(?:and|[|/])?\s*topic|周次\s*主题)$/i.test(
      scheduleBlockText(block),
    ),
  );
  const items: SyllabusScheduleItem[] = [];
  const notes: string[] = [];
  const hasWeeks = blocks.some((block) => {
    const kind = heading(block, allowBare)?.kind;
    return kind === "week" || kind === "module";
  });
  for (const block of blocks) {
    const h = heading(block, allowBare);
    if (h && (h.kind !== "date" || !hasWeeks)) {
      items.push({
        ...item(h.label, h.rest, allowBare),
        topicParts: h.restParts,
      });
    } else if (items.length) append(items.at(-1)!, block);
    else notes.push(scheduleBlockText(block));
  }
  return {
    items,
    note: items.length ? withoutHeading(notes.join("\n"), section.title) : "",
  };
}

export function syllabusSectionBody(html: string) {
  return html.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/i, "");
}
