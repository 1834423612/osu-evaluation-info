export function formatReleaseTime(
  value: string,
  locale: "en" | "zh",
  timeZone: string,
) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  let zone = timeZone;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format(date);
  } catch {
    zone = "UTC";
  }
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: zone,
  };
  const language = locale === "zh" ? "zh-CN" : "en-US";
  const parts = new Intl.DateTimeFormat(language, {
    ...options,
    timeZoneName: "short",
  }).formatToParts(date);
  return {
    label: new Intl.DateTimeFormat(language, options).format(date),
    zone: parts.find((part) => part.type === "timeZoneName")?.value ?? zone,
    full: new Intl.DateTimeFormat(language, {
      ...options,
      year: "numeric",
      timeZoneName: "long",
    }).format(date),
  };
}
