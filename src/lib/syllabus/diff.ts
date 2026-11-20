import { syllabusText } from "./content.ts";
import type { SyllabusDocument } from "./types.ts";
export type SyllabusDiffLine = {
  kind: "added" | "removed" | "same";
  text: string;
  before: number | null;
  after: number | null;
};
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
