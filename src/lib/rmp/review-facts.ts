/** Preserve source values without guessing undocumented numeric textbook enums. */
export function rmpReviewFact(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw === "-1") return locale === "zh" ? "未填写" : "Not provided";
  const labels: Record<string, [string, string]> = {
    mandatory: ["Required", "要求"],
    "non mandatory": ["Not required", "不要求"],
    Y: ["Yes", "是"],
    N: ["No", "否"],
    "not sure yet": ["Not sure yet", "尚未确定"],
    "rather not say": ["Not disclosed", "不愿透露"],
    "drop/withdrawal": ["Dropped / withdrawn", "退课"],
    incomplete: ["Incomplete", "未完成"],
  };
  const label = labels[raw.replaceAll("_", " ").toLowerCase()] ?? labels[raw];
  return label ? label[locale === "zh" ? 1 : 0] : raw;
}
export function rmpTextbookFact(
  value: string | null | undefined,
  locale: "en" | "zh",
) {
  const raw = value?.trim();
  return raw && /^\d+$/.test(raw)
    ? `${raw} (RMP)`
    : rmpReviewFact(value, locale);
}
