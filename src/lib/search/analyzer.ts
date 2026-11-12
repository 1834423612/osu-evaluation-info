import { editDistance } from "../catalog/search-query.ts";

const STOP = new Set(
  "a an and are as at be been being but by can could do does for from had has have how if in into is it its may more of on or our should so some than that the their these they this those through to under using was were what when where which who will with would you your".split(
    " ",
  ),
);
export function fold(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/[’']/g, "");
}
export function tokenize(value: string) {
  return fold(value).match(/[\p{L}]+|\d+(?:\.\d+)?[a-z]{0,2}/gu) ?? [];
}
export function processTerm(value: string) {
  const term = fold(value);
  if (STOP.has(term)) return null;
  return term.length > 4 && term.endsWith("ies")
    ? `${term.slice(0, -3)}y`
    : term.length > 4 && term.endsWith("s") && !term.endsWith("ss")
      ? term.slice(0, -1)
      : term;
}
export function terms(value: string) {
  return tokenize(value)
    .map(processTerm)
    .filter((term): term is string => Boolean(term));
}
export const compact = (value: string) => terms(value).join("");
export { editDistance };
export function typoBudget(value: string) {
  return /^\d/.test(value)
    ? 0
    : value.length >= 7
      ? 2
      : value.length >= 4
        ? 1
        : 0;
}
export function prose(value: string) {
  return value
    .split(
      /\b(?:prereq(?:uisite)?s?|concur(?:rent)?|not open to|cross[- ]listed)\s*[:.]/i,
    )[0]
    .trim();
}

// Prefixes of content words, in order, with an omission penalty. This generates
// abbreviations from every official subject name instead of enumerating aliases.
export function abbreviationCost(input: string, words: string[]) {
  if (input.length < 2 || input.length > 20 || words.length > 10)
    return Infinity;
  const cache = new Map<string, number>();
  function visit(index: number, offset: number, used: number): number {
    if (offset === input.length)
      return used ? (words.length - used) * 0.12 : Infinity;
    if (index === words.length) return Infinity;
    const key = `${index}:${offset}:${used}`;
    if (cache.has(key)) return cache.get(key)!;
    let best = visit(index + 1, offset, used);
    for (
      let length = 1;
      length <= words[index].length && offset + length <= input.length;
      length++
    ) {
      if (!words[index].startsWith(input.slice(offset, offset + length))) break;
      best = Math.min(best, visit(index + 1, offset + length, used + 1));
    }
    cache.set(key, best);
    return best;
  }
  return visit(0, 0, 0);
}
