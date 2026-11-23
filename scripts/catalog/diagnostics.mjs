/** Maintenance logs may contain database errors; never print connection credentials. */
export function redactCatalogText(value, limit = 1200) {
  let message = String(value);
  if (process.env.DATABASE_URL)
    message = message.replaceAll(
      process.env.DATABASE_URL,
      "[REDACTED_DATABASE]",
    );
  return message
    .replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE]")
    .replace(/\b(https?):\/\/[^/\s"'<>]+@/gi, "$1://[REDACTED]@")
    .replace(
      /(["']?\b(?:password|passfile|sslkey|authorization|token|api[_-]?key)["']?\s*[:=]\s*)(?:Bearer\s+)?(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}]+)/gi,
      "$1[REDACTED]",
    )
    .replace(
      /\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+)/g,
      "[REDACTED_TOKEN]",
    )
    .slice(0, limit);
}

export function catalogFailure(event, error, context = {}) {
  const message = redactCatalogText(
    error?.message ?? "Unknown catalog failure",
  ).replace(/[\r\n\t]+/g, " ");
  return {
    event,
    ...context,
    code: /^[A-Z0-9_]{1,64}$/.test(String(error?.code))
      ? String(error.code)
      : "CATALOG_OPERATION_FAILED",
    message,
  };
}
