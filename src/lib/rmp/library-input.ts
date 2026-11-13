export type RmpLibraryInput = {
  query: string;
  campus: string;
  identity: "all" | "verified" | "unverified";
  offset: number;
};
export const RMP_LIBRARY_PAGE_SIZE = 24;
export function rmpProfessorId(value: string) {
  if (!/^[1-9]\d{0,17}$/.test(value))
    throw new RangeError("Invalid RMP professor ID.");
  return value;
}
export function parseRmpLibraryInput(params: URLSearchParams): RmpLibraryInput {
  const query = (params.get("q") ?? "").trim();
  const campus = (params.get("campus") ?? "all").toUpperCase();
  const identity = params.get("identity") ?? "all";
  const rawOffset = params.get("offset") ?? "0";
  if (
    query.length > 100 ||
    /[\x00-\x1f]/.test(query) ||
    !/^(ALL|COL|LMA|MNS|MRN|NWK|WST)$/.test(campus) ||
    !["all", "verified", "unverified"].includes(identity) ||
    !/^\d{1,6}$/.test(rawOffset) ||
    Number(rawOffset) > 100000
  )
    throw new RangeError("Invalid RMP library filters.");
  return {
    query,
    campus,
    identity: identity as RmpLibraryInput["identity"],
    offset: Number(rawOffset),
  };
}
export function rmpSearchTokens(query: string) {
  return query
    .toLocaleLowerCase("en-US")
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 10)
    .map((token) => token.replace(/[%_\\]/g, "\\$&"));
}
