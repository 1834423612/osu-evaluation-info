/** Source URLs are provenance, never arbitrary fetch targets supplied by clients. */
export function verifiedOfficialProfileSource(
  value: string | undefined,
  identity: string,
) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash
    )
      return false;
    if (!(
      url.hostname.endsWith(".osu.edu") ||
      url.hostname.endsWith(".ohio-state.edu")
    ))
      return false;
    const accounts =
      url.pathname.match(/[a-z][a-z0-9_-]*\.\d+(?=\/|$)/gi) ?? [];
    if (accounts.length)
      return accounts.every(
        (account) => account.toLowerCase() === identity.toLowerCase(),
      );
    return /\/(?:people|faculty|staff|directory|staff-members|profile)(?:[/-]|$)/i.test(
      url.pathname,
    );
  } catch {
    return false;
  }
}
