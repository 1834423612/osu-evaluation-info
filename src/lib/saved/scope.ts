let account: string | null = null;
export function savedScope() {
  return account;
}
export function setSavedScope(value: string | null) {
  if (value !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(value))
    throw new Error("Invalid account scope");
  if (account === value) return;
  account = value;
  if (typeof window !== "undefined")
    window.dispatchEvent(new Event("course-atlas:preferences"));
}
export function scopedSavedKey(key: string, scope: string | null = account) {
  return scope && key === "course-atlas:saved-workspace:v1"
    ? key + ":account:" + scope
    : key;
}
