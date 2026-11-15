export function userDataSchema(env: NodeJS.ProcessEnv = process.env) {
  const name =
    env.USER_DATA_SCHEMA ||
    (env.NODE_ENV === "production" ? "osu_identity" : "osu_identity_dev");
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(name))
    throw new Error("Invalid user data namespace");
  return name;
}
export function userDataTable(name: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid table");
  return '"' + domainSchema(name) + '"."' + name + '"';
}

export function domainSchema(
  table: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  // Explicit namespaces support isolated, disposable integration databases.
  if (env.USER_DATA_SCHEMA) return userDataSchema(env);
  const domain = /^(product_|visitor_context)/.test(table)
    ? "analytics"
    : /^diagnostic_/.test(table)
      ? "diagnostics"
      : "identity";
  return "osu_" + domain + (env.NODE_ENV === "production" ? "" : "_dev");
}
export function domainSchemas() {
  return [
    ...new Set(
      [
        "principal",
        "sync_item",
        "shared_collection",
        "transfer",
        "product_event",
        "diagnostic_report",
      ].map((name) => domainSchema(name)),
    ),
  ];
}
export function domainSQL(sql: string) {
  return sql
    .replace(
      /osu_(?:identity|analytics|diagnostics)\.(?:"([a-z_]+)"|([a-z_]+))/g,
      (_, quoted: string, plain: string) => userDataTable(quoted ?? plain),
    )
    .replace(
      /CREATE SCHEMA IF NOT EXISTS osu_identity;/g,
      domainSchemas()
        .map((name) => 'CREATE SCHEMA IF NOT EXISTS "' + name + '";')
        .join("\n"),
    );
}
