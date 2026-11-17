import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const { values } = parseArgs({
  options: {
    apply: { type: "boolean" },
    discovery: { type: "boolean" },
    refresh: { type: "boolean" },
    retry: { type: "boolean" },
    cache: { type: "string" },
    limit: { type: "string", default: "100" },
    delay: { type: "string", default: "2" },
    "archive-local": { type: "string" },
  },
});
if (
  !/^\d+$/.test(values.limit) ||
  Number(values.limit) < 1 ||
  Number(values.limit) > 2000 ||
  !Number.isFinite(Number(values.delay)) ||
  Number(values.delay) < 1
)
  throw Error("limit must be 1..2000 and delay at least 1 second");
values.cache ??= values.discovery
  ? ".planning-cache"
  : ".planning-cache/samples";
const root = fileURLToPath(new URL("../../", import.meta.url));
const commands = values.discovery
  ? [
      [
        "python3",
        "scripts/planning/sync.py",
        "--output",
        values.cache,
        "--limit",
        values.limit,
        "--delay",
        values.delay,
        ...(values.refresh ? ["--refresh"] : []),
        ...(values.retry ? ["--retry"] : []),
      ],
      [process.execPath, "scripts/planning/extract-public.mjs", values.cache],
      ["python3", "scripts/planning/inventory.py", "--cache", values.cache],
      [
        "python3",
        "scripts/planning/structure.py",
        "--cache",
        values.cache,
        "--output",
        `${values.cache}/discovery-curricula.json`,
      ],
    ]
  : [
      [
        "python3",
        "scripts/planning/samples.py",
        "fetch",
        "--cache",
        values.cache,
        "--delay",
        values.delay,
        ...(values.refresh ? ["--refresh"] : []),
      ],
      [process.execPath, "scripts/planning/extract-public.mjs", values.cache],
      [
        "python3",
        "scripts/planning/samples.py",
        "structure",
        "--cache",
        values.cache,
      ],
    ];
if (values["archive-local"])
  for (const [action, ...files] of [
    ["init"],
    [
      "archive",
      values.discovery
        ? "data/planning/directory.json"
        : "data/planning/sample-directory.json",
    ],
    [
      "curricula",
      values.discovery
        ? `${values.cache}/discovery-curricula.json`
        : "data/planning/curricula.json",
    ],
  ])
    commands.push([
      process.execPath,
      "scripts/planning/archive.mjs",
      action,
      ...files,
      "--cache",
      values.cache,
      "--local",
      values["archive-local"],
      "--apply",
    ]);
if (!values.apply)
  console.log(
    JSON.stringify({ apply: false, publicNetwork: true, commands }, null, 2),
  );
else
  for (const [command, ...args] of commands)
    await new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        cwd: root,
        stdio: "inherit",
        shell: false,
      });
      child.on("error", reject);
      child.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(Error("Public refresh stopped; checkpoint retained")),
      );
    });
