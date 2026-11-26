import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { rmpAdminSQL } from "../../src/lib/rmp/admin-namespace.ts";
import * as store from "../../src/lib/rmp/assistance-store.ts";

test("missing AI records remain available for later batches and queues paginate every pending proposal", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const env = { NODE_ENV: "test", RMP_ADMIN_SCHEMA: "assistance_queue" };
  await db.exec(
    rmpAdminSQL(readFileSync("db/schemas/rmp-assistance.sql", "utf8"), env),
  );
  const query = (sql, values) => db.query(sql, values);
  const groups = Array.from({ length: 21 }, (_, index) => ({
    professorId: String(index + 1),
    campus: "COL",
    token: "1131",
    name: "Public Teacher",
    department: "Math",
    username: null,
    decisionVersion: 0,
    recordFingerprint: "a".repeat(64),
    currentCourseKey: null,
    candidates: [],
    teaching: [],
    reviews: [],
    reviewCount: 0,
    reviewsSampled: false,
  }));
  const job = await store.createAssistanceJob(
    query,
    { groups, remote: false, minutes: 60 },
    { actor: "developer:test", userId: null },
    env,
  );
  const payload = (group) => ({
    schemaVersion: 1,
    jobId: job.id,
    snapshotFingerprint: job.snapshotFingerprint,
    sourceLabel: "Unverified AI",
    items: [
      {
        professorId: group.professorId,
        campus: group.campus,
        token: group.token,
        recordFingerprint: group.recordFingerprint,
        expectedVersion: 0,
        action: "bind",
        courseKey: "MATH1131",
        reason: "Needs human evidence review",
        evidenceUrls: [],
        confidence: 0.5,
      },
    ],
  });
  const first = await store.submitAssistanceProposal(
    query,
    job.id,
    payload(groups[0]),
    "machine",
    env,
  );
  const partial = await store.listAssistanceJobs(query, env, {
    page: 1,
    status: "all",
  });
  assert.ok(partial.items, "queue includes pagination metadata");
  assert.equal(partial.items[0].unproposedCount, 20);
  for (const group of groups.slice(1))
    await store.submitAssistanceProposal(
      query,
      job.id,
      payload(group),
      "machine",
      env,
    );
  const page1 = await store.listAssistanceJobs(query, env, {
      page: 1,
      status: "pending",
    }),
    page2 = await store.listAssistanceJobs(query, env, {
      page: 2,
      status: "pending",
    });
  assert.equal(page1.total, 21);
  assert.equal(page1.items.length, 20);
  assert.equal(page2.items.length, 1);
  assert.equal(
    new Set([...page1.items, ...page2.items].map((item) => item.proposal.id))
      .size,
    21,
  );
  for (const item of page1.items)
    await store.rejectAssistanceProposal(
      query,
      item.proposal.id,
      "developer:test",
      env,
    );
  const remaining = await store.listAssistanceJobs(query, env, {
    page: 1,
    status: "all",
  });
  assert.equal(remaining.items[0].proposal.status, "pending");
  assert.equal(
    (
      await store.listAssistanceJobs(query, env, {
        page: 1,
        status: "reviewed",
      })
    ).total,
    20,
  );
  const changed = payload(groups[0]);
  changed.items[0].reason = "Changed proposal cannot claim the same record";
  await assert.rejects(
    store.submitAssistanceProposal(query, job.id, changed, "machine", env),
    /conflict/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM assistance_queue.assistance_proposal",
      )
    ).rows[0].n,
    21,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM assistance_queue.assistance_proposal_record",
      )
    ).rows[0].n,
    21,
  );
  assert.equal(
    (
      await store.submitAssistanceProposal(
        query,
        job.id,
        payload(groups[0]),
        "machine",
        env,
      )
    ).id,
    first.id,
  );
  assert.equal(
    (await store.listAssistanceJobs(query, env, { page: 1, status: "pending" }))
      .total,
    1,
  );
  assert.equal(
    (
      await store.listAssistanceJobs(query, env, {
        page: 1,
        status: "reviewed",
      })
    ).total,
    20,
  );
  assert.equal(
    (
      await store.listAssistanceJobs(query, env, {
        page: 1,
        status: "awaiting",
      })
    ).total,
    0,
  );
  await assert.rejects(
    store.submitAssistanceProposal(
      query,
      job.id,
      { ...payload(groups[0]), sourceLabel: "Overwrite attempt" },
      "machine",
      env,
    ),
    /conflict/,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int n FROM assistance_queue.assistance_proposal",
      )
    ).rows[0].n,
    21,
  );
  assert(first.id);
});
