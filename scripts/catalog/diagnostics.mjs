/** Maintenance logs may contain database errors; never print connection credentials. */
export function catalogFailure(event, error, context = {}) {
  let message = String(error?.message ?? "Unknown catalog failure");
  if (process.env.DATABASE_URL)
    message = message.replaceAll(
      process.env.DATABASE_URL,
      "[REDACTED_DATABASE]",
    );
  message = message
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE]")
    .replace(
      /\b(password|passfile|sslkey)\s*=\s*(?:'[^']*'|"[^"]*"|[^\s]+)/gi,
      "$1=[REDACTED]",
    )
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 1200);
  return {
    event,
    ...context,
    code: /^[A-Z0-9_]{1,64}$/.test(String(error?.code))
      ? String(error.code)
      : "CATALOG_OPERATION_FAILED",
    message,
  };
}
