import { DomUtils, parseDocument } from "htmlparser2";
import { cleanSyllabusHtml, syllabusText } from "./content.ts";
import { cleanOfficialSyllabusHtml } from "./official-render.ts";
import type { SyllabusDocument } from "./types.ts";
export type SyllabusDiffLine = {
  kind: "added" | "removed" | "same";
  text: string;
  before: number | null;
  after: number | null;
};

export type SyllabusDiffBlock = {
  kind: SyllabusDiffLine["kind"];
  html: string;
};
export type SyllabusRevisionChanges = {
  text: boolean;
  links: boolean;
  media: boolean;
  presentation: boolean;
  metadata: boolean;
  archiveRepresentation: boolean;
};
type HtmlNode = ReturnType<typeof parseDocument>["children"][number];

const ordered = (document: SyllabusDocument) =>
  [...document.components].sort((a, b) => a.order - b.order);
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

/** Keep marks inside semantic elements, including table cells and list items. */
function markedHtml(node: HtmlNode, mark: "del" | "ins"): string {
  if (node.type === "text")
    return node.data.trim()
      ? `<${mark}>${escapeHtml(node.data)}</${mark}>`
      : escapeHtml(node.data);
  if (node.type !== "tag") return "";
  const attributes = Object.entries(node.attribs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join("");
  return (
    `<${node.name}${attributes}>` +
    (node.name === "br" || node.name === "hr"
      ? ""
      : node.children.map((child) => markedHtml(child, mark)).join("") +
        `</${node.name}>`)
  );
}

function documentBlocks(document: SyllabusDocument) {
  const blocks: string[] = [];
  const collect = (node: HtmlNode) => {
    if (node.type === "text") {
      if (node.data.trim()) blocks.push(`<p>${escapeHtml(node.data)}</p>`);
    } else if (node.type === "tag") {
      if (node.name === "div") node.children.forEach(collect);
      else blocks.push(DomUtils.getOuterHTML(node));
    }
  };
  ordered(document).forEach((component) =>
    parseDocument(cleanSyllabusHtml(component.html)).children.forEach(collect),
  );
  return blocks;
}

function documentRepresentation(document: SyllabusDocument) {
  const components = ordered(document);
  return {
    ids: components.map((component) => component.id),
    semantic: components.map((component) => cleanSyllabusHtml(component.html)),
    official: components.map((component) =>
      cleanOfficialSyllabusHtml(component.officialHtml ?? component.html),
    ),
    known: components.map(
      (component) => typeof component.officialHtml === "string",
    ),
  };
}

function attributes(html: string[], tag: string, names: string[]) {
  const values: string[][] = [];
  const visit = (node: HtmlNode) => {
    if (node.type !== "tag") return;
    if (node.name === tag)
      values.push(names.map((name) => node.attribs[name] ?? ""));
    node.children.forEach(visit);
  };
  html.forEach((value) => parseDocument(value).children.forEach(visit));
  return JSON.stringify(values);
}

/** Compare structure and styling independently from words and resource destinations. */
function presentationSignature(html: string[]) {
  const ignored = new Set([
    "href",
    "title",
    "src",
    "alt",
    "target",
    "rel",
    "loading",
    "decoding",
    "referrerpolicy",
  ]);
  const shape = (node: HtmlNode): unknown =>
    node.type === "tag"
      ? [
          node.name,
          Object.entries(node.attribs).filter(([name]) => !ignored.has(name)),
          node.children.filter((child) => child.type === "tag").map(shape),
        ]
      : null;
  return JSON.stringify(
    html.map((value) =>
      parseDocument(value)
        .children.filter((node) => node.type === "tag")
        .map(shape),
    ),
  );
}

export function compareSyllabusRevisions(
  before: SyllabusDocument,
  after: SyllabusDocument,
) {
  const left = documentRepresentation(before),
    right = documentRepresentation(after);
  const lines = syllabusDiff(syllabusLines(before), syllabusLines(after));
  const knownLeft: string[] = [],
    knownRight: string[] = [];
  let archiveRepresentation = false;
  left.ids.forEach((id, index) => {
    const other = right.ids.indexOf(id);
    if (other >= 0) {
      if (left.known[index] !== right.known[other])
        archiveRepresentation = true;
      if (!left.known[index] || !right.known[other]) return;
      knownLeft.push(left.official[index]);
      knownRight.push(right.official[other]);
    } else if (left.known[index]) {
      knownLeft.push(left.official[index]);
      knownRight.push("");
    }
  });
  right.ids.forEach((id, index) => {
    if (!left.ids.includes(id) && right.known[index]) {
      knownLeft.push("");
      knownRight.push(right.official[index]);
    }
  });
  const changes: SyllabusRevisionChanges = {
    text: lines.some((line) => line.kind !== "same"),
    links:
      attributes(left.semantic, "a", ["href"]) !==
      attributes(right.semantic, "a", ["href"]),
    media:
      attributes(knownLeft, "img", ["src", "alt"]) !==
      attributes(knownRight, "img", ["src", "alt"]),
    presentation:
      presentationSignature(left.semantic) !==
        presentationSignature(right.semantic) ||
      presentationSignature(knownLeft) !== presentationSignature(knownRight),
    metadata:
      JSON.stringify([before.entry, before.modifiedAt, before.snapshotId]) !==
      JSON.stringify([after.entry, after.modifiedAt, after.snapshotId]),
    archiveRepresentation,
  };
  const blocks: SyllabusDiffBlock[] = syllabusDiff(
    documentBlocks(before),
    documentBlocks(after),
  ).map((block) => ({
    kind: block.kind,
    html:
      block.kind === "same"
        ? block.text
        : parseDocument(block.text)
            .children.map((node) =>
              markedHtml(node, block.kind === "removed" ? "del" : "ins"),
            )
            .join(""),
  }));
  return { lines, blocks, changes };
}

export type SyllabusArchiveRevision = {
  id: string;
  document: SyllabusDocument;
  fetchedAt: string;
};

/** Fold repeat fetches and legacy layout enrichment; retain distinct source and content revisions. */
export function distinctSyllabusRevisions<T extends SyllabusArchiveRevision>(
  rows: T[],
) {
  const groups: {
    row: T;
    key: string;
    official: string[];
    known: boolean[];
    signature: string;
    archivedCopies: number;
    index: number;
  }[] = [];
  const prepared = rows
    .map((row, index) => {
      const representation = documentRepresentation(row.document);
      const key = JSON.stringify([
        row.document.entry,
        row.document.snapshotId,
        row.document.modifiedAt,
        ordered(row.document).map(({ id, type, order, locale }, index) => [
          id,
          type,
          order,
          locale,
          representation.semantic[index],
        ]),
      ]);
      return {
        row,
        index,
        key,
        official: representation.official,
        known: representation.known,
        signature: JSON.stringify(
          representation.official.map((html, componentIndex) =>
            representation.known[componentIndex] ? html : null,
          ),
        ),
      };
    })
    .sort(
      (a, b) =>
        b.known.filter(Boolean).length - a.known.filter(Boolean).length ||
        a.index - b.index,
    );
  // Prefer the richest archived evidence; unknown components cannot bridge known differences.
  for (const item of prepared) {
    const exact = groups.find(
      (candidate) =>
        candidate.key === item.key && candidate.signature === item.signature,
    );
    const compatible = exact
      ? []
      : groups.filter(
          (candidate) =>
            candidate.key === item.key &&
            item.known.every(
              (known, index) =>
                !known ||
                (candidate.known[index] &&
                  candidate.official[index] === item.official[index]),
            ),
        );
    const group =
      exact ?? (compatible.length === 1 ? compatible[0] : undefined);
    if (group) {
      group.archivedCopies++;
      group.index = Math.min(group.index, item.index);
    } else groups.push({ ...item, archivedCopies: 1 });
  }
  return groups
    .sort((a, b) => a.index - b.index)
    .map(({ row, archivedCopies }) => ({ ...row, archivedCopies }));
}
export function syllabusLines(document: SyllabusDocument) {
  return [...document.components]
    .sort((a, b) => a.order - b.order)
    .flatMap((component) => syllabusText(component.html).split("\n"))
    .filter((line) => line.trim());
}
/** Line diff with bounded matrix memory; large changes stay exact as a replacement block. */
export function syllabusDiff(
  before: string[],
  after: string[],
): SyllabusDiffLine[] {
  const rows: SyllabusDiffLine[] = [];
  let prefix = 0,
    suffix = 0;
  while (
    prefix < before.length &&
    prefix < after.length &&
    before[prefix] === after[prefix]
  ) {
    rows.push({
      kind: "same",
      text: before[prefix],
      before: prefix + 1,
      after: prefix + 1,
    });
    prefix++;
  }
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const left = before.slice(prefix, before.length - suffix),
    right = after.slice(prefix, after.length - suffix);
  let i = 0,
    j = 0;
  const add = (kind: SyllabusDiffLine["kind"]) => {
    rows.push({
      kind,
      text: kind === "added" ? right[j] : left[i],
      before: kind === "added" ? null : prefix + i + 1,
      after: kind === "removed" ? null : prefix + j + 1,
    });
    if (kind !== "added") i++;
    if (kind !== "removed") j++;
  };
  if ((left.length + 1) * (right.length + 1) <= 2_000_000) {
    const width = right.length + 1,
      matrix = new Uint32Array((left.length + 1) * width);
    for (let a = left.length - 1; a >= 0; a--)
      for (let b = right.length - 1; b >= 0; b--)
        matrix[a * width + b] =
          left[a] === right[b]
            ? matrix[(a + 1) * width + b + 1] + 1
            : Math.max(matrix[(a + 1) * width + b], matrix[a * width + b + 1]);
    while (i < left.length || j < right.length) {
      if (i < left.length && j < right.length && left[i] === right[j])
        add("same");
      else if (
        j < right.length &&
        (i === left.length ||
          matrix[i * width + j + 1] > matrix[(i + 1) * width + j])
      )
        add("added");
      else add("removed");
    }
  } else {
    while (i < left.length) add("removed");
    while (j < right.length) add("added");
  }
  for (let k = suffix; k > 0; k--)
    rows.push({
      kind: "same",
      text: before[before.length - k],
      before: before.length - k + 1,
      after: after.length - k + 1,
    });
  return rows;
}
