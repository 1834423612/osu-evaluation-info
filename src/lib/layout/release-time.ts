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
  const compact = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      ...options,
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map(({ type, value }) => [type, value]),
  );
  return {
    label: new Intl.DateTimeFormat(language, options).format(date),
    compact: `${compact.month}/${compact.day} ${compact.hour}:${compact.minute}`,
    zone: parts.find((part) => part.type === "timeZoneName")?.value ?? zone,
    full: new Intl.DateTimeFormat(language, {
      ...options,
      year: "numeric",
      timeZoneName: "long",
    }).format(date),
  };
}
