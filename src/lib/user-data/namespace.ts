export function userDataSchema() {
  const name = process.env.USER_DATA_SCHEMA || "osu_user";
  if (!/^[a-z][a-z0-9_]{0,50}$/.test(name))
    throw new Error("Invalid user data namespace");
  return name;
}
export function userDataTable(name: string) {
  if (!/^[a-z][a-z0-9_]*$/.test(name)) throw new Error("Invalid table");
  return '"' + userDataSchema() + '"."' + name + '"';
}
