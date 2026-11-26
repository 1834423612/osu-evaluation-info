export function rmpAdminSchema(env: NodeJS.ProcessEnv = process.env) {
  const schema =
    env.RMP_ADMIN_SCHEMA ||
    (env.NODE_ENV === "production" ? "osu_rmp" : "osu_rmp_dev");
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(schema))
    throw Error("Invalid RMP administration schema");
  if (env.NODE_ENV !== "production" && schema === "osu_rmp")
    throw Error("Development decisions require an isolated RMP schema");
  return schema;
}
export function rmpAdminTable(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!/^[a-z][a-z0-9_]*$/.test(name))
    throw Error("Invalid RMP administration table");
  return '"' + rmpAdminSchema(env) + '"."' + name + '"';
}
export function rmpAdminSQL(sql: string, env: NodeJS.ProcessEnv = process.env) {
  return sql.replaceAll("__RMP_ADMIN__", '"' + rmpAdminSchema(env) + '"');
}
export function rmpServingSQL(sql: string) {
  // Production uses the upgraded view. Development can opt into its isolated
  // view after running setup_admin; ordinary development still reads the source.
  return process.env.RMP_ADMIN_SCHEMA
    ? sql.replaceAll(
        "osu_rmp.course_review_query",
        rmpAdminTable("course_review_query"),
      )
    : sql;
}
