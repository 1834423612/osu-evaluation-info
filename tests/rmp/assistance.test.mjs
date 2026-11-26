import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("AI jobs scope hashed tokens, expire/revoke access, recheck creator roles and keep immutable pending proposals", async (t) => {
  assert.ok(
    existsSync("db/schemas/rmp-assistance.sql"),
    "AI proposal schema exists",
  );
  const store = await import("../../src/lib/rmp/assistance-store.ts");
  const { rmpAdminSQL } = await import("../../src/lib/rmp/admin-namespace.ts");
  const db = new PGlite();
  t.after(() => db.close());
  const env = { NODE_ENV: "production", RMP_ADMIN_SCHEMA: "assistance_test" };
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-assistance.sql", "utf8"), env),
  );
  const query = (sql, values) => db.query(sql, values);
  const group = {
    professorId: "1",
    campus: "COL",
    token: "1131",
    name: "Public Teacher",
    department: "Math",
    username: null,
    decisionVersion: 0,
    recordFingerprint: "a".repeat(64),
    currentCourseKey: null,
    reviewCount: 1,
    reviewsSampled: false,
    candidates: [
      {
        key: "MATH1131",
        title: "Calculus",
        source: "official_catalog",
        term: "1268",
      },
    ],
    teaching: [],
    reviews: [
      { id: "10", course: "1131", comment: "Public comment", date: null },
    ],
  };
  const job = await store.createAssistanceJob(
    query,
    { groups: [group], remote: true, minutes: 5 },
    { actor: "account:owner", userId: "owner" },
    env,
    1000000,
  );
  assert.match(job.token, /^waho-rmp-ai_[A-Za-z0-9_-]{43}$/);
  const saved = (
    await db.query("SELECT token_hash FROM assistance_test.assistance_job")
  ).rows[0];
  assert.equal(saved.token_hash.includes(job.token), false);
  const authorize = (
    token = job.token,
    now = 1000001,
    isAdmin = async () => true,
  ) =>
    store.authorizeAssistanceToken(query, job.id, token, { env, now, isAdmin });
  await authorize();
  await assert.rejects(authorize("waho-rmp-ai_" + "x".repeat(43)), /token/);
  await assert.rejects(authorize(job.token, 1400000), /expired/);
  await assert.rejects(
    authorize(job.token, 1000001, async () => false),
    /revoked/,
  );
  const proposal = {
    schemaVersion: 1,
    jobId: job.id,
    snapshotFingerprint: job.snapshotFingerprint,
    sourceLabel: "Unverified AI",
    items: [
      {
        professorId: "1",
        campus: "COL",
        token: "1131",
        action: "bind",
        courseKey: "MATH1131",
        reason: "Candidate matches published catalog",
        evidenceUrls: ["https://osu.edu/course"],
        expectedVersion: 0,
        recordFingerprint: "a".repeat(64),
        confidence: 0.8,
      },
    ],
  };
  const submitted = await store.submitAssistanceProposal(
    query,
    job.id,
    proposal,
    "machine",
    env,
  );
  assert.equal(submitted.status, "pending");
  assert.equal(
    (
      await store.submitAssistanceProposal(
        query,
        job.id,
        proposal,
        "machine",
        env,
      )
    ).id,
    submitted.id,
  );
  await assert.rejects(
    store.submitAssistanceProposal(
      query,
      job.id,
      {
        ...proposal,
        items: [
          { ...proposal.items[0], reason: "Replaced while human reviews" },
        ],
      },
      "machine",
      env,
    ),
    /conflict/,
  );
  await assert.rejects(
    store.submitAssistanceProposal(
      query,
      job.id,
      { ...proposal, items: [{ ...proposal.items[0], professorId: "2" }] },
      "machine",
      env,
    ),
    /scope/,
  );
  await assert.rejects(
    store.submitAssistanceProposal(
      query,
      job.id,
      { ...proposal, trusted: true },
      "machine",
      env,
    ),
  );
  assert.equal(
    (await db.query("SELECT status FROM assistance_test.assistance_proposal"))
      .rows[0].status,
    "pending",
  );
  await store.revokeAssistanceJob(query, job.id, "account:owner", env);
  await assert.rejects(authorize(), /revoked/);
  assert(
    (
      await db.query(
        "SELECT count(*)::int n FROM assistance_test.assistance_audit",
      )
    ).rows[0].n >= 3,
  );
  await assert.rejects(
    db.exec("DELETE FROM assistance_test.assistance_audit"),
    /retained/,
  );
});

test("human subset approval leaves other records pending and prevents replay", async (t) => {
  const store = await import("../../src/lib/rmp/assistance-store.ts");
  const { rmpRecordFingerprint } =
    await import("../../src/lib/rmp/admin-fingerprint.ts");
  const { rmpAdminSQL } = await import("../../src/lib/rmp/admin-namespace.ts");
  const db = new PGlite();
  t.after(() => db.close());
  const env = { NODE_ENV: "test", RMP_ADMIN_SCHEMA: "assistance_subset" };
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-assistance.sql", "utf8"), env),
  );
  const query = (sql, values) => db.query(sql, values);
  const rows = ["1", "2"].map((id) => ({
    professorId: id,
    campus: "COL",
    token: "1131",
    name: "Public Teacher",
    department: "Math",
    courseKey: null,
    state: "unresolved",
    reason: "no_match",
    candidates: [],
    evidence: {},
    version: 0,
    manualReason: null,
    evidenceUrls: [],
    updatedAt: "2026-11-26T12:00:00Z",
    username: null,
    identityState: "missing",
    reviewCount: 1,
    sourceFingerprint: "source-" + id,
  }));
  const groups = rows.map((row) => ({
    professorId: row.professorId,
    campus: row.campus,
    token: row.token,
    name: row.name,
    department: row.department,
    username: null,
    decisionVersion: 0,
    recordFingerprint: rmpRecordFingerprint(row),
    currentCourseKey: null,
    reviewCount: row.reviewCount,
    reviewsSampled: true,
    candidates: [],
    teaching: [],
    reviews: [],
  }));
  const job = await store.createAssistanceJob(
    query,
    { groups, remote: false, minutes: 60 },
    { actor: "developer:test", userId: null },
    env,
  );
  const items = groups.map((group) => ({
    professorId: group.professorId,
    campus: "COL",
    token: group.token,
    action: "bind",
    courseKey: "MATH1131",
    expectedVersion: 0,
    recordFingerprint: group.recordFingerprint,
    reason: "Public evidence reviewed",
    evidenceUrls: [],
    confidence: 0.5,
  }));
  const proposal = await store.submitAssistanceProposal(
    query,
    job.id,
    {
      schemaVersion: 1,
      jobId: job.id,
      snapshotFingerprint: job.snapshotFingerprint,
      sourceLabel: "Unverified AI",
      items,
    },
    "human-import",
    env,
  );
  const first = { ...items[0] };
  delete first.confidence;
  await store.validateAssistanceApproval(
    query,
    proposal.id,
    "developer:test",
    [first],
    proposal.proposalSnapshot,
    { env, loadRows: async () => [rows[0]] },
  );
  await store.markAssistanceApproved(
    query,
    proposal.id,
    "developer:test",
    [first],
    env,
  );
  const partial = (await store.readAssistanceJob(query, job.id, env)).proposal;
  assert.equal(partial.status, "pending");
  assert.deepEqual(partial.approvedKeys, ["1:COL:1131"]);
  await db.exec(
    "CREATE TABLE assistance_subset.course_decision_audit(id bigint PRIMARY KEY,professor_id bigint,campus_code text,raw_course_token text,decision jsonb,recorded_at timestamptz DEFAULT now())",
  );
  await db.query(
    "INSERT INTO assistance_subset.course_decision_audit(id,professor_id,campus_code,raw_course_token,decision) VALUES(1,1,'COL','1131',$1::jsonb)",
    [
      JSON.stringify({
        proposal_id: proposal.id,
        action: "bind",
        course_key: "STAT1131",
        reason: "Human verified a different official target",
        version: 1,
      }),
    ],
  );
  const reviewed = await store.readAssistanceJob(query, job.id, env);
  assert.equal(reviewed.outcomes[0].courseKey, "STAT1131");
  assert.equal(reviewed.proposal.data.items[0].courseKey, "MATH1131");
  await assert.rejects(
    store.validateAssistanceApproval(
      query,
      proposal.id,
      "developer:test",
      [first],
      proposal.proposalSnapshot,
      { env, loadRows: async () => [rows[0]] },
    ),
    /conflict/,
  );
  const second = { ...items[1] };
  delete second.confidence;
  await store.validateAssistanceApproval(
    query,
    proposal.id,
    "developer:test",
    [second],
    proposal.proposalSnapshot,
    { env, loadRows: async () => [rows[1]] },
  );
  await store.markAssistanceApproved(
    query,
    proposal.id,
    "developer:test",
    [second],
    env,
  );
  assert.equal(
    (await store.readAssistanceJob(query, job.id, env)).proposal.status,
    "approved",
  );
});
