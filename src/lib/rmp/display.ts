export const formatRmpRating = (value: number | null) =>
  typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5
    ? "—"
    : value.toFixed(1);
export const formatRmpPercent = (value: number | null) =>
  typeof value !== "number" ||
  !Number.isFinite(value) ||
  value < 0 ||
  value > 100
    ? "—"
    : `${Math.round(value)}%`;
export const profileInitials = (name: string) => {
  const words = name.match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) ?? [];
  return (
    [words[0], ...(words.length > 1 ? [words.at(-1)!] : [])]
      .filter((word): word is string => Boolean(word))
      .map((word) => Array.from(word)[0])
      .join("")
      .toUpperCase() || "?"
  );
};
export const ratingTone = (value: number | null, inverse = false) =>
  typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 5
    ? "none"
    : inverse
      ? value >= 4
        ? "caution"
        : value < 2.5
          ? "positive"
          : "mixed"
      : value >= 4
        ? "positive"
        : value < 3
          ? "caution"
          : "mixed";
