import assert from "node:assert/strict";
import test from "node:test";
import { parseBuildInfo } from "../../src/lib/layout/build-info.ts";
import {
  buildSnapshot,
  currentBuildInfo,
  createBuildInfoReader,
  readGitRevision,
} from "../../src/lib/layout/build-info.server.ts";
import { createBuildInfoClient } from "../../src/lib/layout/build-info-client.ts";

const a = {
  sha: "a".repeat(40),
  message: "first commit",
  updatedAt: "2026-11-10T01:00:00.000Z",
  timeKind: "commit",
  environment: "production",
};
const b = {
  ...a,
  sha: "b".repeat(40),
  message: "new commit",
  updatedAt: "2026-11-10T04:00:00.000Z",
};
const revision = ({ sha, message, updatedAt }) => ({ sha, message, updatedAt });

test("version metadata validates complete SHAs, zoned dates, environment and a single commit subject", () => {
  assert.deepEqual(
    parseBuildInfo({
      ...a,
      sha: a.sha.toUpperCase(),
      message: "subject\nbody",
      updatedAt: "2026-11-09T20:00:00-05:00",
    }),
    { ...a, message: "subject" },
  );
  for (const change of [
    { sha: "abcd123" },
    { sha: "--all" },
    { updatedAt: "2026" },
    { updatedAt: "2026-11-10T01:00:00" },
    { updatedAt: "invalid" },
    { environment: "other" },
    { timeKind: "unknown" },
  ])
    assert.equal(parseBuildInfo({ ...a, ...change }), null);
  assert.equal(parseBuildInfo({ ...a, updatedAt: null }).updatedAt, null);
  assert.equal(readGitRevision("--all"), null);
  assert.match(readGitRevision().sha, /^[0-9a-f]{40,64}$/);
});

test("build capture requests the deployed SHA and never takes a date from an unrelated local HEAD", () => {
  const seen = [];
  const env = {
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: b.sha,
    VERCEL_GIT_COMMIT_MESSAGE: "new commit\nextra body",
  };
  assert.deepEqual(
    buildSnapshot(env, (ref) => {
      seen.push(ref);
      return revision(b);
    }),
    b,
  );
  assert.deepEqual(seen, [b.sha]);
  const clock = () => new Date("2026-11-10T04:05:00Z");
  const mismatched = buildSnapshot(env, () => revision(a), clock);
  assert.equal(mismatched.sha, b.sha);
  assert.equal(mismatched.updatedAt, "2026-11-10T04:05:00.000Z");
  assert.equal(mismatched.timeKind, "build");
  const local = buildSnapshot({ ...env, NODE_ENV: "development" }, (ref) => {
    assert.equal(ref, "HEAD");
    return revision(a);
  });
  assert.deepEqual(local, { ...a, environment: "development" });
  assert.equal(
    buildSnapshot(
      { NODE_ENV: "production", VERCEL_GIT_COMMIT_MESSAGE: "unpaired message" },
      () => revision(a),
    ).message,
    a.message,
  );
});

test("a running development reader discovers a new HEAD without restarting or rebuilding", () => {
  let head = a,
    time = 0,
    reads = 0;
  const read = createBuildInfoReader(
    () =>
      currentBuildInfo(
        { NODE_ENV: "development", VERCEL_GIT_COMMIT_SHA: a.sha },
        a,
        (ref) => {
          reads++;
          assert.equal(ref, "HEAD");
          return revision(head);
        },
      ),
    () => time,
  );
  assert.equal(read().sha, a.sha);
  head = b;
  assert.equal(
    read().sha,
    a.sha,
    "brief server deduplication prevents repeated Git work",
  );
  time = 2001;
  assert.deepEqual(read(), { ...b, environment: "development" });
  assert.equal(reads, 2);
});

test("production stays tied to its deployment instead of advertising an undeployed repository HEAD", () => {
  const noGit = () => {
    throw Error("should not inspect HEAD");
  };
  assert.deepEqual(
    currentBuildInfo(
      { NODE_ENV: "production", VERCEL_GIT_COMMIT_SHA: a.sha },
      a,
      noGit,
    ),
    a,
  );
  assert.deepEqual(currentBuildInfo({ NODE_ENV: "production" }, a, noGit), a);
  const env = {
    NODE_ENV: "production",
    VERCEL_GIT_COMMIT_SHA: b.sha,
    VERCEL_GIT_COMMIT_MESSAGE: b.message,
  };
  assert.deepEqual(
    currentBuildInfo(env, a, (ref) => {
      assert.equal(ref, b.sha);
      return revision(b);
    }),
    b,
  );
  assert.deepEqual(
    currentBuildInfo(env, a, () => revision(a)),
    { ...b, updatedAt: null },
  );
});

test("all version components share one uncached request and a stable hydration snapshot", async () => {
  let deliver,
    calls = 0,
    now = 1000,
    notifications = 0;
  const client = createBuildInfoClient(
    a,
    (url, init) => {
      calls++;
      assert.equal(url, "/api/build-info");
      assert.equal(init.cache, "no-store");
      return new Promise((resolve) => {
        deliver = resolve;
      });
    },
    () => now,
  );
  const unsubscribe1 = client.subscribe(() => notifications++),
    unsubscribe2 = client.subscribe(() => notifications++);
  const pending = client.refresh();
  assert.equal(client.refresh(), pending);
  await Promise.resolve();
  assert.equal(calls, 1);
  deliver(Response.json({ version: 1, build: b }));
  await pending;
  assert.deepEqual(client.getSnapshot(), b);
  assert.equal(client.getServerSnapshot(), a);
  assert.equal(notifications, 2);
  await client.refresh();
  assert.equal(calls, 1, "rapid focus or popover clicks are throttled");
  now += 5001;
  const repeated = client.refresh();
  await Promise.resolve();
  deliver(Response.json({ version: 1, build: b }));
  await repeated;
  assert.equal(notifications, 2, "unchanged results do not trigger renders");
  unsubscribe1();
  unsubscribe2();
});

test("failed requests and malformed rollouts retain the last good version and back off", async () => {
  let now = 0,
    calls = 0,
    response = Response.json({}, { status: 503 });
  const client = createBuildInfoClient(
    a,
    async () => {
      calls++;
      return response;
    },
    () => now,
  );
  await client.refresh();
  assert.equal(client.getSnapshot(), a);
  now = 6000;
  await client.refresh();
  assert.equal(calls, 1);
  now = 30001;
  response = Response.json({ version: 2, build: b });
  await client.refresh();
  assert.equal(client.getSnapshot(), a);
  now = 60002;
  response = Response.json({ version: 1, build: b });
  await client.refresh();
  assert.deepEqual(client.getSnapshot(), b);
  assert.equal(calls, 3);
});
