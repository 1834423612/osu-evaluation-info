import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { it } from "node:test";

it("catalog automation only accepts the four-hour scheduled event", async () => {
  const source = await readFile(
    new URL("../../.github/workflows/osu-catalog-sync.yml", import.meta.url),
    "utf8",
  );
  const events = source.match(/^on:\n((?:[ \t].*\n|\n)*)/m)?.[1];
  assert.ok(events, "explicit workflow trigger block required");
  assert.deepEqual(
    [...events.matchAll(/^  ([a-z_]+):/gm)].map((match) => match[1]),
    ["schedule"],
  );
  assert.match(events, /cron: ["']17 \*\/4 \* \* \*["']/);
  assert.match(events, /timezone: ["']America\/New_York["']/);
  assert.doesNotMatch(
    source,
    /^\s*(?:push|pull_request|workflow_dispatch|repository_dispatch|workflow_call):/m,
  );
  assert.match(source, /if: github\.event_name == 'schedule'/);
  assert.match(source, /cancel-in-progress: false/);
  assert.doesNotMatch(source, /run:.*catalog:migrate/);
  assert.doesNotMatch(
    source,
    /^\s*uses:/m,
    "owner-only policy rejects external Actions",
  );
  assert.ok(
    source.indexOf("Validate database configuration") <
      source.indexOf("git init"),
  );
  assert.match(source, /fetch --no-tags --depth=1 origin "\$GITHUB_SHA"/);
  assert.match(source, /test "\$\(git rev-parse HEAD\)" = "\$GITHUB_SHA"/);
  assert.match(source, /run: bash scripts\/ci\/setup-catalog-runtime.sh/);
  const sync = source.indexOf("run: pnpm catalog:sync");
  assert.ok(sync >= 0);
  assert.doesNotMatch(
    source,
    /catalog:prune/,
    "scheduled synchronization must retain every archived generation",
  );
});
