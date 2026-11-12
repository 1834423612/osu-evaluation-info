/** Canvas colors do not accept CSS rgb() strings, unlike HTML conversion. */
export function syllabusPdfColor(value: string) {
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(value);
  return rgb
    ? `#${rgb
        .slice(1)
        .map((part) =>
          Math.max(0, Math.min(255, Number(part)))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")}`
    : value;
}

/** Keep annotations and underlines on visible text, never on full-width stacks. */
export function normalizeSyllabusPdfLinks(
  value: unknown,
  inheritedLink?: string,
  inheritedDecoration?: unknown,
  inheritedStyle: Record<string, unknown> = {},
) {
  if (Array.isArray(value)) {
    value.forEach((item) =>
      normalizeSyllabusPdfLinks(
        item,
        inheritedLink,
        inheritedDecoration,
        inheritedStyle,
      ),
    );
    return;
  }
  if (!value || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  // pdfmake flattens nested inline arrays and drops their parents' text styles.
  const style = { ...inheritedStyle };
  for (const key of [
    "font",
    "fontSize",
    "bold",
    "italics",
    "color",
    "background",
    "characterSpacing",
    "fontFeatures",
    "opacity",
    "decorationColor",
    "decorationStyle",
    "lineHeight",
    "noWrap",
    "sup",
    "sub",
    "style",
  ])
    if (node[key] !== undefined) style[key] = node[key];
  const link = typeof node.link === "string" ? node.link : inheritedLink;
  const rawDecoration = node.decoration ?? inheritedDecoration;
  const decoration = (
    Array.isArray(rawDecoration)
      ? rawDecoration.flat(Infinity)
      : [rawDecoration]
  ).filter(
    (item): item is string =>
      typeof item === "string" &&
      ["underline", "lineThrough", "overline"].includes(item),
  );
  if (node.decoration !== undefined) {
    if (decoration.length) node.decoration = decoration;
    else delete node.decoration;
  }
  if (link) {
    if (typeof node.image === "string") {
      node.link = link;
      delete node.decoration;
      return;
    }
    delete node.link;
    delete node.decoration;
    if (typeof node.text === "string") {
      const raw = node.text;
      const text = raw.trim();
      if (!text) return;
      const leading = raw.slice(0, raw.length - raw.trimStart().length);
      const trailing = raw.slice(raw.trimEnd().length);
      node.text = [
        ...(leading ? [{ ...style, text: leading }] : []),
        { ...style, text, link, ...(decoration.length ? { decoration } : {}) },
        ...(trailing ? [{ ...style, text: trailing }] : []),
      ];
      return;
    }
  }
  for (const [key, child] of Object.entries(node)) {
    if (["text", "stack", "columns", "ul", "ol", "table", "body"].includes(key))
      normalizeSyllabusPdfLinks(child, link, decoration, style);
  }
}
