import { existsSync } from "node:fs";
for (const f of [".env.local", ".env"])
  if (existsSync(f)) process.loadEnvFile(f);
if (process.argv.includes("--production")) process.env.NODE_ENV = "production";
const { maintainUserData } =
    await import("../../src/lib/user-data/maintenance.ts"),
  { getDatabasePool } = await import("../../src/lib/db.ts");
try {
  const report = await maintainUserData(process.argv.includes("--apply"));
  console.log(JSON.stringify(report, null, 2));
  if (report.apply && Object.values(report.tables).some((x) => x.remaining > 0))
    process.exitCode = 2;
} finally {
  await getDatabasePool().end();
}
