import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { rmpAdminSQL } from "../../src/lib/rmp/admin-namespace.ts";
import {
  applyRmpDecisionBatch,
  currentRmpAdminRows,
} from "../../src/lib/rmp/admin-batch.ts";
import { writeCourseDecision } from "../../src/lib/rmp/admin-store.ts";
import { rmpRecordFingerprint } from "../../src/lib/rmp/admin-fingerprint.ts";
import {
  createAssistanceJob,
  submitAssistanceProposal,
  validateAssistanceApproval,
  markAssistanceApproved,
} from "../../src/lib/rmp/assistance-store.ts";

const env = { NODE_ENV: "test", RMP_ADMIN_SCHEMA: "rmp_batch_test" };
const item = (
  professorId = "1",
  token = "1131",
  courseKey = "MATH1131",
  expectedVersion = 0,
) => ({
  professorId,
  campus: "COL",
  token,
  courseKey,
  expectedVersion,
  action: "bind",
  reason: "Reviewed source evidence",
  evidenceUrls: [],
  recordFingerprint: "a".repeat(64),
});
async function fingerprinted(query, base) {
  return {
    ...base,
    recordFingerprint: rmpRecordFingerprint(
      (await currentRmpAdminRows(query, [base], env))[0],
    ),
  };
}
async function fixture(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`CREATE SCHEMA osu_rmp; CREATE SCHEMA osu_catalog;
    CREATE TABLE osu_rmp.professor(legacy_id bigint PRIMARY KEY,first_name text,last_name text,department text,course_codes jsonb DEFAULT '[]',active boolean DEFAULT true,updated_at timestamptz DEFAULT now());
    INSERT INTO osu_rmp.professor(legacy_id,first_name,last_name,department) VALUES(1,'Sam','Field','Mathematics'),(2,'Nia','Tide','Biology');
    CREATE TABLE osu_rmp.professor_identity_map(professor_id bigint,name_dot_number text,state text);
    INSERT INTO osu_rmp.professor_identity_map VALUES(1,'field.1','accepted');
    CREATE TABLE osu_rmp.school(legacy_id bigint,campus_code text); INSERT INTO osu_rmp.school VALUES(1,'COL');
    CREATE TABLE osu_rmp.professor_school(professor_id bigint,school_id bigint); INSERT INTO osu_rmp.professor_school VALUES(1,1),(2,1);
    CREATE TABLE osu_rmp.review(legacy_id bigint,professor_id bigint,class_name text,course_key text,comment text,active boolean,updated_at timestamptz);
    INSERT INTO osu_rmp.review VALUES(10,1,'1131',NULL,'Proofs',true,now()),(11,2,'1100',NULL,'Field work',true,now());
    CREATE VIEW osu_rmp.review_query AS SELECT * FROM osu_rmp.review;
    CREATE TABLE osu_rmp.course_identity_match(professor_id bigint,campus_code text,raw_course_token text,course_key text,state text,reason text,candidates jsonb,evidence jsonb,updated_at timestamptz);
    INSERT INTO osu_rmp.course_identity_match VALUES(1,'COL','1131',NULL,'ambiguous','ambiguous_subject','["MATH1131","STAT1131"]','{}',now()),(2,'COL','1100','BIOLOGY1100','accepted','exact','["BIOLOGY1100"]','{}',now());
    CREATE FUNCTION osu_rmp.review_course_token(value text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT regexp_replace(upper(value),'[^A-Z0-9.]','','g')$$;
    CREATE TABLE osu_catalog.course_snapshots(last_seen_run text,campus_code text,subject text,catalog_number text,data jsonb,term_code text DEFAULT '1272',title text DEFAULT 'Course');
    CREATE TABLE osu_catalog.snapshot_versions(run_id text,published_at timestamptz); INSERT INTO osu_catalog.snapshot_versions VALUES('run',now());
    CREATE TABLE osu_catalog.sync_runs(id text,status text,terms jsonb); INSERT INTO osu_catalog.sync_runs VALUES('run','complete','["1272"]');
    INSERT INTO osu_catalog.course_snapshots(last_seen_run,campus_code,subject,catalog_number,data) VALUES('run','COL','MATH','1131','{}'),('run','COL','STAT','1131','{}'),('run','COL','BIOLOGY','1100','{}');
    CREATE TABLE osu_rmp.instructor_course(name_dot_number text,source text,source_record_key text,campus_code text,course_key text,subject text,catalog_number text,latest_term text,active boolean,last_seen_at timestamptz DEFAULT now());`);
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-admin.sql", "utf8"), env),
  );
  return { db, query: (sql, values = []) => db.query(sql, values) };
}
test("batch checks every version before writing and reports each stale group without partial writes", async (t) => {
  const { db, query } = await fixture(t);
  await writeCourseDecision(query, item(), "account:first", env);
  const items = await Promise.all(
    [item("1", "1131", "STAT1131", 0), item("2", "1100", "BIOLOGY1100", 3)].map(
      (base) => fingerprinted(query, base),
    ),
  );
  await assert.rejects(
    applyRmpDecisionBatch(
      { query },
      { items, confirmed: true },
      "account:reviewer",
      { env },
    ),
    (error) => {
      assert.equal(error.code, "batch_conflict");
      assert.equal(error.issues.length, 2);
      return true;
    },
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision_audit",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (await db.query("SELECT course_key FROM rmp_batch_test.course_decision"))
      .rows[0].course_key,
    "MATH1131",
  );
});
test("valid batch supports different course targets and atomic proposal provenance", async (t) => {
  const { db, query } = await fixture(t),
    proposalId = "d321ec1f-739e-4f57-b71b-c1c5674976c5";
  await db.exec(
    "CREATE TABLE rmp_batch_test.proposal(id text PRIMARY KEY,state text); INSERT INTO rmp_batch_test.proposal VALUES('proposal','pending')",
  );
  const result = await applyRmpDecisionBatch(
    { query },
    {
      items: await Promise.all(
        [item(), item("2", "1100", "BIOLOGY1100")].map((base) =>
          fingerprinted(query, base),
        ),
      ),
      confirmed: true,
      proposalId,
      proposalSnapshot: "a".repeat(64),
    },
    "account:reviewer",
    {
      env,
      beforeApply: async (_query, items) => {
        assert.equal(items.length, 2);
      },
      afterApply: async (transaction) => {
        await transaction(
          "UPDATE rmp_batch_test.proposal SET state='approved'",
          [],
        );
      },
    },
  );
  assert.equal(result.items.length, 2);
  assert.deepEqual(
    (
      await db.query(
        "SELECT course_key,proposal_id FROM rmp_batch_test.course_decision ORDER BY professor_id",
      )
    ).rows.map((row) => [row.course_key, row.proposal_id]),
    [
      ["MATH1131", proposalId],
      ["BIOLOGY1100", proposalId],
    ],
  );
  assert.equal(
    (await db.query("SELECT state FROM rmp_batch_test.proposal")).rows[0].state,
    "approved",
  );
});
test("unknown targets, stale evidence and approval failure roll back all decisions and audit rows", async (t) => {
  const { db, query } = await fixture(t);
  for (const items of [
    [
      await fingerprinted(query, item()),
      await fingerprinted(query, item("2", "1100", "CSE9999")),
    ],
    [
      { ...item(), recordFingerprint: "f".repeat(64) },
      await fingerprinted(query, item("2", "1100", "BIOLOGY1100")),
    ],
  ]) {
    await assert.rejects(
      applyRmpDecisionBatch(
        { query },
        { items, confirmed: true },
        "account:reviewer",
        { env },
      ),
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int n FROM rmp_batch_test.course_decision",
        )
      ).rows[0].n,
      0,
    );
  }
  await assert.rejects(
    applyRmpDecisionBatch(
      { query },
      {
        items: await Promise.all(
          [item(), item("2", "1100", "BIOLOGY1100")].map((base) =>
            fingerprinted(query, base),
          ),
        ),
        confirmed: true,
      },
      "account:reviewer",
      {
        env,
        afterApply: async () => {
          throw Error("approval failure");
        },
      },
    ),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision_audit",
      )
    ).rows[0].n,
    0,
  );
});
test("batch rejects missing confirmation, duplicate groups and oversized payloads before transaction", async () => {
  const connection = {
    query: async () => {
      throw Error("database must not be reached");
    },
  };
  for (const raw of [
    { items: [item()], confirmed: false },
    { items: [{ ...item(), recordFingerprint: undefined }], confirmed: true },
    { items: [item(), item()], confirmed: true },
    { items: Array.from({ length: 101 }, () => item()), confirmed: true },
  ])
    await assert.rejects(
      applyRmpDecisionBatch(connection, raw, "account:reviewer", { env }),
      (error) => error.name === "ZodError",
    );
});
test("a late CAS race rolls back earlier batch writes and mixed unbind/reject stay course scoped", async (t) => {
  const { db, query } = await fixture(t);
  const inputs = await Promise.all(
    [item(), item("2", "1100", "BIOLOGY1100")].map((base) =>
      fingerprinted(query, base),
    ),
  );
  await assert.rejects(
    applyRmpDecisionBatch(
      { query },
      { items: inputs, confirmed: true },
      "account:reviewer",
      {
        env,
        beforeApply: async (q) => {
          // Inject a competing version after preflight. The first batch item then
          // succeeds, the second CAS fails, and neither the first write nor audit may
          // survive the failed transaction.
          await writeCourseDecision(q, inputs[1], "account:competing", env);
        },
      },
    ),
    (error) => error.code === "batch_conflict",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision_audit",
      )
    ).rows[0].n,
    0,
  );
  const mixed = [
    { ...inputs[0], action: "unbind", courseKey: null },
    { ...inputs[1], action: "reject", courseKey: null },
  ];
  await applyRmpDecisionBatch(
    { query },
    { items: mixed, confirmed: true },
    "account:reviewer",
    { env },
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT action FROM rmp_batch_test.course_decision ORDER BY professor_id",
      )
    ).rows.map((row) => row.action),
    ["unbind", "reject"],
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_review_query",
      )
    ).rows[0].n,
    0,
  );
});
test("real AI proposal approval is atomic, rejects stale source snapshots and cannot apply twice", async (t) => {
  const { db, query } = await fixture(t),
    actor = "account:reviewer";
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-assistance.sql", "utf8"), env),
  );
  async function proposalFor(decision) {
    const row = (await currentRmpAdminRows(query, [decision], env))[0],
      fingerprint = rmpRecordFingerprint(row);
    const group = {
      professorId: row.professorId,
      campus: row.campus,
      token: row.token,
      name: row.name,
      department: row.department,
      username: row.username,
      decisionVersion: row.version,
      recordFingerprint: fingerprint,
      currentCourseKey: row.courseKey,
      candidates: row.candidates.map((key) => ({
        key,
        title: "",
        source: "official_catalog",
        term: "1268",
      })),
      teaching: [],
      reviews: [],
      reviewCount: row.reviewCount,
      reviewsSampled: row.reviewCount > 0,
    };
    const job = await createAssistanceJob(
      query,
      { groups: [group], remote: false, minutes: 60 },
      { actor, userId: null },
      env,
    );
    const input = {
      ...decision,
      expectedVersion: row.version,
      recordFingerprint: fingerprint,
      confidence: 0.7,
    };
    const proposal = await submitAssistanceProposal(
      query,
      job.id,
      {
        schemaVersion: 1,
        jobId: job.id,
        snapshotFingerprint: job.snapshotFingerprint,
        sourceLabel: "Test AI",
        items: [input],
      },
      "human-import",
      env,
    );
    return {
      items: [input],
      confirmed: true,
      proposalId: proposal.id,
      proposalSnapshot: proposal.proposalSnapshot,
    };
  }
  const hooks = (body, fail = false) => ({
    env,
    beforeApply: (q, items) =>
      validateAssistanceApproval(
        q,
        body.proposalId,
        actor,
        items,
        body.proposalSnapshot,
        { env, loadRows: (q, items) => currentRmpAdminRows(q, items, env) },
      ),
    afterApply: async (q) => {
      await markAssistanceApproved(q, body.proposalId, actor, env);
      if (fail) throw Error("approval receipt failed");
    },
  });
  const stale = await proposalFor(item());
  await db.exec(
    "UPDATE osu_rmp.review SET updated_at=now()+interval '1 second' WHERE professor_id=1",
  );
  await assert.rejects(
    applyRmpDecisionBatch({ query }, stale, actor, hooks(stale)),
    (error) => error.code === "batch_conflict",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision",
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT status FROM rmp_batch_test.assistance_proposal WHERE id=$1",
        [stale.proposalId],
      )
    ).rows[0].status,
    "pending",
  );
  const approved = await proposalFor(item());
  await applyRmpDecisionBatch({ query }, approved, actor, hooks(approved));
  assert.equal(
    (
      await db.query(
        "SELECT status FROM rmp_batch_test.assistance_proposal WHERE id=$1",
        [approved.proposalId],
      )
    ).rows[0].status,
    "approved",
  );
  assert.equal(
    (await db.query("SELECT proposal_id FROM rmp_batch_test.course_decision"))
      .rows[0].proposal_id,
    approved.proposalId,
  );
  await assert.rejects(
    applyRmpDecisionBatch({ query }, approved, actor, hooks(approved)),
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision_audit",
      )
    ).rows[0].n,
    1,
  );
  const failed = await proposalFor(item("2", "1100", "BIOLOGY1100"));
  await assert.rejects(
    applyRmpDecisionBatch({ query }, failed, actor, hooks(failed, true)),
  );
  assert.equal(
    (
      await db.query(
        "SELECT status FROM rmp_batch_test.assistance_proposal WHERE id=$1",
        [failed.proposalId],
      )
    ).rows[0].status,
    "pending",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision",
      )
    ).rows[0].n,
    1,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision_audit",
      )
    ).rows[0].n,
    1,
  );
});
test("profile source changes invalidate an unchanged decision version before mapper rebuild", async (t) => {
  const { db, query } = await fixture(t),
    snapshot = await fingerprinted(query, item());
  await db.exec(
    "UPDATE osu_rmp.professor SET department='Statistics' WHERE legacy_id=1",
  );
  await assert.rejects(
    applyRmpDecisionBatch(
      { query },
      { items: [snapshot], confirmed: true },
      "account:reviewer",
      { env },
    ),
    (error) =>
      error.code === "batch_conflict" &&
      error.issues[0].code === "evidence_changed",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision",
      )
    ).rows[0].n,
    0,
  );
});
test("live official teaching changes invalidate snapshots even before mapper rebuild", async (t) => {
  const { db, query } = await fixture(t);
  await db.exec(
    "INSERT INTO osu_rmp.instructor_course(name_dot_number,source,source_record_key,campus_code,course_key,subject,catalog_number,latest_term,active) VALUES('field.1','official_evaluation','fact','COL','MATH1131','MATH','1131','AU 26',true)",
  );
  const snapshot = await fingerprinted(query, item());
  await db.exec(
    "UPDATE osu_rmp.instructor_course SET active=false WHERE source_record_key='fact'",
  );
  await assert.rejects(
    applyRmpDecisionBatch(
      { query },
      { items: [snapshot], confirmed: true },
      "account:reviewer",
      { env },
    ),
    (error) =>
      error.code === "batch_conflict" &&
      error.issues[0].code === "evidence_changed",
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM rmp_batch_test.course_decision",
      )
    ).rows[0].n,
    0,
  );
});
