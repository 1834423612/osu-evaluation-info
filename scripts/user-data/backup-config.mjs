export function authBackupTables(prefix) {
  if (prefix && !/^[a-z][a-z0-9_]{0,35}_$/.test(prefix))
    throw Error("Invalid auth prefix");
  return [
    "user",
    "session",
    "account",
    "verification",
    "rate_limit",
    "passkey",
  ].map((name) => prefix + name);
}
/** Credentials go into child environment variables, never process arguments or output. */
export function backupConnectionEnv(raw) {
  const u = new URL(raw);
  if (
    !["postgres:", "postgresql:"].includes(u.protocol) ||
    !u.hostname ||
    u.pathname.length < 2
  )
    throw Error("Invalid database URL");
  for (const key of u.searchParams.keys())
    if (
      ![
        "sslmode",
        "sslrootcert",
        "sslcert",
        "sslkey",
        "application_name",
        "connect_timeout",
      ].includes(key)
    )
      throw Error("Unsupported database connection option");
  return {
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGSSLMODE: u.searchParams.get("sslmode") || "prefer",
    PGAPPNAME: "waho-user-data-backup",
    PGCONNECT_TIMEOUT: "10",
    ...(u.searchParams.get("sslrootcert")
      ? { PGSSLROOTCERT: u.searchParams.get("sslrootcert") }
      : {}),
    ...(u.searchParams.get("sslcert")
      ? { PGSSLCERT: u.searchParams.get("sslcert") }
      : {}),
    ...(u.searchParams.get("sslkey")
      ? { PGSSLKEY: u.searchParams.get("sslkey") }
      : {}),
  };
}
