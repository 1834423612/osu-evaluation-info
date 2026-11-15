export function toggleSelection(
  current: ReadonlySet<string>,
  keys: readonly string[],
) {
  const next = new Set(current),
    all = keys.length > 0 && keys.every((key) => current.has(key));
  for (const key of keys) {
    if (all) next.delete(key);
    else next.add(key);
  }
  return next;
}
