export function planningSchema(env: NodeJS.ProcessEnv = process.env) {
  const value =
    env.PLANNING_SCHEMA ||
    (env.NODE_ENV === "production" ? "osu_planning" : "osu_planning_dev");
  if (!/^osu_planning(?:_[a-z0-9_]+)?$/.test(value))
    throw Error("Invalid planning schema");
  return value;
}
export function planningTable(table: "source_document" | "curriculum_version") {
  return `"${planningSchema()}"."${table}"`;
}
