import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function parseAdminRoleOptions(args) {
  const options = {
    command: args[0],
    production: false,
    apply: false,
    search: "",
    page: 1,
    userId: "",
    actor: "",
    reason: "",
  };
  if (!["list", "audit", "grant", "revoke"].includes(options.command))
    throw Error("Use list, audit, grant or revoke");
  const names = {
    "--search": "search",
    "--page": "page",
    "--user-id": "userId",
    "--actor": "actor",
    "--reason": "reason",
  };
  const seen = new Set();
  for (let index = 1; index < args.length; index++) {
    const flag = args[index];
    if (seen.has(flag)) throw Error("Duplicate option: " + flag);
    seen.add(flag);
    if (flag === "--production") options.production = true;
    else if (flag === "--apply") options.apply = true;
    else if (
      names[flag] &&
      args[index + 1] &&
      !args[index + 1].startsWith("--")
    )
      options[names[flag]] =
        flag === "--page" ? Number(args[++index]) : args[++index];
    else throw Error("Invalid option: " + flag);
  }
  if (
    !Number.isInteger(options.page) ||
    options.page < 1 ||
    options.page > 10000 ||
    options.search.length > 100
  )
    throw Error("Invalid search or page");
  if (
    ["grant", "revoke"].includes(options.command) &&
    (!options.userId ||
      options.actor.trim().length < 3 ||
      options.actor.length > 180 ||
      options.reason.trim().length < 8 ||
      options.reason.length > 500)
  )
    throw Error(
      "Role changes require --user-id, --actor and --reason (8-500 characters)",
    );
  if (["list", "audit"].includes(options.command) && options.apply)
    throw Error("Read-only commands do not accept --apply");
  return options;
}

export async function runAdminRoleCommand(args) {
  const options = parseAdminRoleOptions(args);
  for (const path of [".env.local", ".env"])
    if (existsSync(path)) process.loadEnvFile(path);
  process.env.NODE_ENV = options.production ? "production" : "development";
  const { getAuthPool } = await import("../../src/lib/auth/database.ts");
  const {
    adminRoleSchema,
    listAdminUsers,
    listAdminRoleAudit,
    changeAdminRole,
    adminRoleInput,
  } = await import("../../src/lib/auth/admin-roles.ts");
  const schema = adminRoleSchema();
  const pool = getAuthPool();
  const query = (sql, values) => pool.query(sql, values);
  try {
    if (options.command === "list")
      return { schema, ...(await listAdminUsers(query, options)) };
    if (options.command === "audit")
      return { schema, items: await listAdminRoleAudit(query, options.page) };
    const input = adminRoleInput.parse({
      userId: options.userId,
      action: options.command,
      reason: options.reason,
    });
    const target = (
      await listAdminUsers(query, { search: options.userId })
    ).items.find((user) => user.id === options.userId);
    if (!target) throw Error("Existing account ID was not found");
    const actor = "operator:" + options.actor.trim();
    if (!options.apply)
      return {
        mode: "plan",
        schema,
        target,
        action: options.command,
        actor,
        reason: input.reason,
      };
    return {
      mode: "applied",
      schema,
      target,
      action: options.command,
      ...(await changeAdminRole(query, input, { actor, userId: null })),
    };
  } finally {
    await pool.end();
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    console.log(
      JSON.stringify(await runAdminRoleCommand(process.argv.slice(2)), null, 2),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Administrator role command failed";
    console.error(
      /LAST_ADMIN/.test(message)
        ? "The final administrator cannot be revoked"
        : /foreign key/.test(message)
          ? "Account does not exist"
          : /^(Use |Duplicate option:|Invalid option:|Invalid search|Role changes require|Read-only commands|Existing account|Development admin)/.test(
                message,
              )
            ? message
            : "Administrator role command failed; verify identity migrations and command input",
    );
    process.exitCode = 1;
  }
}
