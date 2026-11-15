export function userDataSchema(env: NodeJS.ProcessEnv = process.env) {
  const name =
    env.USER_DATA_SCHEMA ||
    (env.NODE_ENV === "production" ? "osu_user" : "osu_user_dev");
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
  const domain = /^(sync_)/.test(table)
    ? "saved"
    : /^(shared_collection|share_|page_link)/.test(table)
      ? "sharing"
      : /^transfer/.test(table)
        ? "transfer"
        : /^(product_|visitor_context)/.test(table)
          ? "analytics"
          : /^diagnostic_/.test(table)
            ? "diagnostics"
            : "user";
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
      /osu_(?:user|saved|sharing|transfer|analytics|diagnostics)\.([a-z_]+)/g,
      (_, name: string) => userDataTable(name),
    )
    .replace(
      /CREATE SCHEMA IF NOT EXISTS osu_user;/g,
      domainSchemas()
        .map((name) => 'CREATE SCHEMA IF NOT EXISTS "' + name + '";')
        .join("\n"),
    );
}
