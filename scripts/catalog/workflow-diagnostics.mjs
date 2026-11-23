#!/usr/bin/env node
/** Local-only Actions report. Never connects to the database or changes step outcomes. */
import { appendFile, open } from "node:fs/promises";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { redactCatalogText } from "./diagnostics.mjs";

const stages = [
  ["Database configuration", "CONFIGURATION_OUTCOME", null],
  ["Repository checkout", "CHECKOUT_OUTCOME", "catalog-checkout"],
  ["Node.js and pnpm", "RUNTIME_OUTCOME", "catalog-runtime"],
  ["Dependencies", "DEPENDENCIES_OUTCOME", "catalog-dependencies"],
  ["Catalog", "CATALOG_OUTCOME", "catalog-sync"],
  ["RMP evidence", "MAPPING_OUTCOME", "rmp-mapping"],
  ["Change history", "CHANGES_OUTCOME", "change-backfill"],
  ["Search indexes", "INDEX_OUTCOME", "search-prepare"],
  ["Calendar", "CALENDAR_OUTCOME", "calendar-sync"],
];

function text(value, length = 1200) {
  return redactCatalogText(
    stripVTControlCharacters(String(value)),
    length,
  ).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

function cell(value) {
  return text(value ?? "—", 160)
    .replace(/[\r\n]+/g, " ")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;");
}

function annotation(title, message) {
  // Every message occupies one command line, even when an upstream error contains commands.
  const escaped = text(message, 800)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  console.log(`::error title=${title}::${escaped}`);
}

async function readLog(name) {
  if (!name) return "";
  let file;
  try {
    file = await open(join(process.env.RUNNER_TEMP ?? ".", `${name}.log`), "r");
    const { size } = await file.stat();
    const bytes = Buffer.alloc(Math.min(size, 256 * 1024));
    await file.read(bytes, 0, bytes.length, Math.max(0, size - bytes.length));
    return bytes.toString("utf8");
  } catch (error) {
    if (error.code === "ENOENT") return "";
    return `Could not read captured log: ${text(error.message, 200)}`;
  } finally {
    await file?.close();
  }
}

function events(log) {
  return log.split(/\r?\n/).flatMap((line) => {
    // tee logs have no prefix; also accept a downloaded Actions log's timestamp.
    const clean = stripVTControlCharacters(line).replace(
      /^\d{4}-\d{2}-\d{2}T\S+\s+/,
      "",
    );
    try {
      const value = JSON.parse(clean);
      return typeof value?.event === "string" ? [value] : [];
    } catch {
      return [];
    }
  });
}

async function main() {
  const logs = new Map();
  for (const [, , name] of stages)
    if (name) logs.set(name, await readLog(name));
  const catalogEvents = events(logs.get("catalog-sync") ?? "");
  const failed = catalogEvents.findLast(
    (entry) => entry.event === "catalog.sync_failed",
  );
  const rejected = catalogEvents.findLast(
    (entry) => entry.event === "catalog.publication_rejected",
  );
  const coverageRejected =
    process.env.CATALOG_OUTCOME === "failure" &&
    (failed?.code === "CATALOG_COVERAGE_REGRESSION" || rejected);
  const output = [
    "## Catalog maintenance",
    "",
    "| Stage | Outcome |",
    "| --- | --- |",
  ];
  for (const [label, variable] of stages) {
    const outcome = process.env[variable] || "not run";
    output.push(`| ${label} | ${cell(outcome)} |`);
    if (outcome !== "failure") continue;
    if (label === "Catalog") {
      const cause = coverageRejected
        ? "Official coverage regressed. Publication was refused; the last accepted catalog remains selected."
        : failed?.message ||
          "No structured error was captured. Open this run's failed step for its complete log.";
      annotation(
        coverageRejected
          ? "Catalog refresh rejected"
          : "Catalog refresh failed",
        `${failed?.stage || "catalog"}: ${failed?.code || "CATALOG_OPERATION_FAILED"}. ${cause}`,
      );
    } else
      annotation(
        `${label} failed`,
        `The ${label.toLowerCase()} step failed. See its captured log below and open the failed step for complete output.`,
      );
  }
  output.push("");
  if (coverageRejected) {
    output.push(
      "### Catalog refresh rejected",
      "",
      "The official response lost previously verified coverage. Publication was refused; the last accepted catalog remains selected. This run remains failed so the rejected refresh stays visible.",
      "",
    );
    if (Number.isSafeInteger(rejected?.affected))
      output.push(
        `Affected coverage comparisons: **${rejected.affected}**. Showing up to 20 differences.`,
        "",
      );
    if (Array.isArray(rejected?.regressions) && rejected.regressions.length) {
      output.push(
        "| Term | Campus | Subject | Accepted sections | Candidate sections |",
        "| --- | --- | --- | ---: | ---: |",
      );
      for (const row of rejected.regressions.slice(0, 20))
        output.push(
          `| ${[row.term_code, row.campus_code, row.subject, row.previous_sections, row.candidate_sections].map(cell).join(" | ")} |`,
        );
      output.push("");
    }
  }
  if (failed)
    output.push(
      `Failure stage: **${cell(failed.stage)}**. Code: **${cell(failed.code)}**.`,
      "",
      cell(failed.message),
      "",
    );
  const server = process.env.GITHUB_SERVER_URL || "https://github.com";
  const repository = process.env.GITHUB_REPOSITORY;
  const run = process.env.GITHUB_RUN_ID;
  if (
    /^https:\/\/[a-z0-9.-]+$/i.test(server) &&
    /^[\w.-]+\/[\w.-]+$/.test(repository ?? "") &&
    /^\d+$/.test(run ?? "")
  )
    output.push(
      `[Open this workflow run and its complete step logs](${server}/${repository}/actions/runs/${run})`,
      "",
    );
  output.push(
    "### Captured diagnostic output",
    "",
    "Expand a stage below for its last 40 lines (up to 1,000 characters per line). Complete output remains in the Actions step log. Connection credentials are redacted here.",
    "",
  );
  for (const [label, variable, name] of stages) {
    if (!name || !process.env[variable]) continue;
    output.push(
      `<details><summary>${label}: ${cell(process.env[variable])}</summary>`,
      "",
    );
    const log = logs.get(name);
    if (log) {
      // Indented code cannot terminate a fence or inject Markdown/Actions commands.
      const lines = redactCatalogText(stripVTControlCharacters(log), 512 * 1024)
        .trimEnd()
        .split(/\r?\n/)
        .slice(-40);
      output.push(...lines.map((line) => `    ${text(line, 1000)}`));
    } else
      output.push(
        "No captured log. Open the step log; the step may have failed before its command started or was skipped.",
      );
    output.push("", "</details>", "");
  }
  if (!process.env.GITHUB_STEP_SUMMARY)
    throw new Error("GITHUB_STEP_SUMMARY is required.");
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${output.join("\n")}\n`);
}

main().catch((error) => {
  annotation("Catalog diagnostic report failed", error.message);
  process.exitCode = 1;
});
