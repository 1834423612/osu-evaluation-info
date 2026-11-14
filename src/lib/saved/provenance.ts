let applying = 0;
export function syncApplicationActive() {
  return applying > 0;
}
export function applySyncedItems<T>(change: () => T) {
  applying++;
  try {
    return change();
  } finally {
    applying--;
  }
}
