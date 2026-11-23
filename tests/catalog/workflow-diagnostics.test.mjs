import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const execute = promisify(execFile);
const reporter = new URL(
  "../../scripts/catalog/workflow-diagnostics.mjs",
  import.meta.url,
);

async function report(logs, outcomes) {
  const directory = await mkdtemp(join(tmpdir(), "catalog-report-"));
  const summary = join(directory, "summary.md");
  try {
    for (const [name, value] of Object.entries(logs))
      await writeFile(join(directory, `${name}.log`), value);
    const result = await execute(process.execPath, [fileURLToPath(reporter)], {
      env: {
        ...process.env,
        DATABASE_URL: "postgresql://worker:private@db.example/catalog",
        RUNNER_TEMP: directory,
        GITHUB_STEP_SUMMARY: summary,
        GITHUB_SERVER_URL: "https://github.com",
        GITHUB_REPOSITORY: "owner/catalog",
        GITHUB_RUN_ID: "123",
        ...outcomes,
      },
    });
    return { ...result, summary: await readFile(summary, "utf8") };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

it("surfaces a refused snapshot with the failed stage and readable coverage differences", async () => {
  const rejected = {
    event: "catalog.publication_rejected",
    affected: 41,
    regressions: [
      {
        term_code: "1268",
        campus_code: "COL",
        subject: "CHINESE",
        previous_sections: "107",
        candidate_sections: "0",
      },
    ],
  };
  const failure = {
    event: "catalog.sync_failed",
    stage: "coverage-validation",
    code: "CATALOG_COVERAGE_REGRESSION",
    message: "Official coverage collapsed; keeping the last accepted catalog.",
  };
  const result = await report(
    {
      "catalog-sync": `${JSON.stringify(rejected)}\n${JSON.stringify(failure)}\n`,
    },
    { CATALOG_OUTCOME: "failure", INDEX_OUTCOME: "success" },
  );
  assert.match(result.stdout, /::error title=Catalog refresh rejected::/);
  assert.match(result.stdout, /coverage-validation/);
  assert.match(result.stdout, /CATALOG_COVERAGE_REGRESSION/);
  assert.match(result.summary, /41/);
  assert.match(result.summary, /\| 1268 \| COL \| CHINESE \| 107 \| 0 \|/);
  assert.match(result.summary, /last accepted catalog/);
  assert.match(result.summary, /Search indexes \| success/);
  assert.match(
    result.summary,
    /https:\/\/github.com\/owner\/catalog\/actions\/runs\/123/,
  );
});

it("reports unstructured step failures and missing logs without inventing success", async () => {
  const result = await report(
    { "rmp-mapping": "Collecting dependency\nERROR: installation failed\n" },
    {
      MAPPING_OUTCOME: "failure",
      CATALOG_OUTCOME: "success",
      INDEX_OUTCOME: "failure",
    },
  );
  assert.match(result.stdout, /::error title=RMP evidence failed::/);
  assert.match(result.stdout, /::error title=Search indexes failed::/);
  assert.match(result.summary, /ERROR: installation failed/);
  assert.match(result.summary, /No captured log/);
  assert.doesNotMatch(result.summary, /Catalog refresh rejected/);
});

it("redacts secrets and bounds logs while escaping workflow commands and Markdown", async () => {
  const message =
    "database postgresql://worker:private@db.example/catalog password='another-secret'\n::warning::injected";
  const result = await report(
    {
      "catalog-sync": [
        JSON.stringify({
          event: "catalog.sync_failed",
          code: "ECONNRESET",
          stage: "discovery",
          message,
        }),
        "start " + "x".repeat(20_000),
        ...Array.from({ length: 200 }, (_, i) => `log ${i}`),
        "```\n::error::untrusted log\npassword=tail-secret\n",
      ].join("\n"),
    },
    { CATALOG_OUTCOME: "failure" },
  );
  for (const secret of ["private", "another-secret", "tail-secret"])
    assert.ok(!`${result.stdout}${result.summary}`.includes(secret));
  assert.ok(result.summary.length < 20_000);
  assert.ok(!result.stdout.includes("\n::warning::injected"));
  assert.match(result.summary, /log 199/);
  assert.match(result.summary, /\[REDACTED/);
  assert.ok(result.summary.includes("    ::error::untrusted log"));
});

it("does not annotate a successful refresh as a failure", async () => {
  const result = await report(
    { "catalog-sync": "Complete: 88000 distinct sections\n" },
    { CATALOG_OUTCOME: "success", INDEX_OUTCOME: "success" },
  );
  assert.doesNotMatch(result.stdout, /::error/);
  assert.match(result.summary, /Catalog \| success/);
  assert.match(result.summary, /88000/);
});

it("removes package-download credentials and token fields from captured setup errors", async () => {
  const result = await report(
    {
      "catalog-runtime":
        'Fetch failed https://worker:package-secret@registry.example/package\n{"token":"json-secret","password":"json-password"}\nAuthorization: Bearer header-secret\n',
    },
    { RUNTIME_OUTCOME: "failure" },
  );
  for (const secret of [
    "package-secret",
    "json-secret",
    "json-password",
    "header-secret",
  ])
    assert.ok(!`${result.stdout}${result.summary}`.includes(secret), secret);
  assert.match(result.summary, /\[REDACTED/);
});
