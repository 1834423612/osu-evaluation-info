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
    ...(error?.details ? { details: safeDetails(error.details) } : {}),
    ...(sourceLocation(error) ? { location: sourceLocation(error) } : {}),
  };
}

/** Only diagnostic fields, never response bodies, SQL parameters or arbitrary error properties. */
function safeDetails(details) {
  return Object.fromEntries(
    [
      "path",
      "expected",
      "actual",
      "courseId",
      "classNumber",
      "status",
      "attempt",
      "cause",
      "requestUrl",
    ]
      .filter((name) => Object.hasOwn(details, name))
      .map((name) => [
        name,
        details[name] == null
          ? null
          : typeof details[name] === "number"
            ? details[name]
            : redactCatalogText(details[name], 800).replace(/[\r\n\t]+/g, " "),
      ]),
  );
}

function sourceLocation(error) {
  for (const frame of String(error?.stack ?? "")
    .split("\n")
    .slice(1)) {
    const match = frame.match(
      /\/(scripts\/[^\s():]+|src\/[^\s():]+):(\d+):(\d+)/,
    );
    if (!match || /\bat catalogError\b/.test(frame)) continue;
    return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
  }
  return null;
}

/** Compare only stable identity fields, excluding source bodies and live seats. */
export function compareSectionIdentities(official, archived) {
  const fields = [
    "course_id",
    "offering_number",
    "campus_code",
    "subject",
    "catalog_number",
  ];
  const identity = (row) =>
    Object.fromEntries(
      ["term_code", "class_number", ...fields].map((field) => [
        field,
        row[field],
      ]),
    );
  const key = (row) => `${row.term_code}:${row.class_number}`;
  const old = new Map(archived.map((row) => [key(row), identity(row)]));
  const result = { added: [], removed: [], changed: [], unchanged: 0 };
  for (const row of official) {
    const previous = old.get(key(row));
    if (!previous) result.added.push(identity(row));
    else {
      const differences = fields
        .filter((field) => previous[field] !== row[field])
        .map((field) => ({
          field,
          archived: previous[field],
          official: row[field],
        }));
      if (differences.length)
        result.changed.push({
          term: row.term_code,
          classNumber: row.class_number,
          differences,
        });
      else result.unchanged++;
    }
    old.delete(key(row));
  }
  result.removed = [...old.values()];
  return result;
}
