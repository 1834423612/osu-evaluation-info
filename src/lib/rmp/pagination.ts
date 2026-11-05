export const REVIEW_PAGE_SIZE = 6;
export const MAX_REVIEW_OFFSET = 100_000;

export function normalizeReviewOffset(offset: number): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > MAX_REVIEW_OFFSET)
    throw new RangeError("Invalid review offset.");
  return offset;
}

export function parseReviewOffset(value: string): number {
  if (!/^\d{1,6}$/.test(value)) throw new RangeError("Invalid review offset.");
  return normalizeReviewOffset(Number(value));
}

/** Only advertise pages whose starting offset the API accepts. */
export function reviewPagination(total: number) {
  const pageCount = Math.min(
    Math.ceil(Math.max(0, total) / REVIEW_PAGE_SIZE),
    Math.floor(MAX_REVIEW_OFFSET / REVIEW_PAGE_SIZE) + 1,
  );
  return {
    pageCount,
    reachableCount: Math.min(Math.max(0, total), pageCount * REVIEW_PAGE_SIZE),
  };
}
