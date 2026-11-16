export type AccountStatus = {
  enabled: boolean;
  email: boolean;
  passkey: boolean;
  profile: boolean;
};

/** Keep new sign-ins fail-closed until every required policy table is ready. */
export function accountStatus(
  tables: readonly boolean[],
  mail: boolean,
): AccountStatus {
  const enabled = tables.length === 4 && tables.every(Boolean);
  return {
    enabled,
    email: enabled && mail,
    passkey: enabled,
    profile: !!tables[0] && !!tables[2] && !!tables[3],
  };
}

export function accountView(
  hasSession: boolean,
  pending: boolean,
  status: AccountStatus | null,
) {
  if (pending) return "loading";
  // A successful session lookup remains useful when the optional readiness
  // request fails or an unrelated account extension has not been migrated.
  if (hasSession) return "account";
  if (!status) return "loading";
  return status.enabled ? "sign-in" : "unavailable";
}
