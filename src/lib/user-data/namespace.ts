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
  return '"' + userDataSchema() + '"."' + name + '"';
}
