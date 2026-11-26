import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { buildPublicAssistanceGroup } from "../../src/lib/rmp/assistance-evidence.ts";
import { createAssistanceJob } from "../../src/lib/rmp/assistance-store.ts";
import { rmpAdminSQL } from "../../src/lib/rmp/admin-namespace.ts";
import { collectAssistanceEvidence } from "../../src/lib/rmp/assistance-service.ts";

const row = {
  professorId: "1",
  campus: "COL",
  token: "1131",
  name: "a".repeat(299) + "😀",
  department: "Math",
  username: null,
  courseKey: null,
  state: "unresolved",
  reason: "no_match",
  candidates: ["MATH1131"],
  evidence: {},
  version: 0,
  manualReason: null,
  evidenceUrls: [],
  updatedAt: "2026-11-26T12:00:00Z",
  identityState: "missing",
  reviewCount: 12,
  sourceFingerprint: "source",
  privateEmail: "not-exported@example.test",
};

test("public evidence reports sampling and clips Unicode safely through PostgreSQL JSONB", async () => {
  const detail = {
    row,
    history: [{ private: "not exported" }],
    teaching: [
      {
        source: "s".repeat(99) + "😀",
        course_key: "MATH1131",
        latest_term: null,
        campus_code: "COL",
      },
    ],
    reviews: [
      {
        id: "10",
        course: "1131",
        comment: "a".repeat(1999) + "😀",
        date: "d".repeat(99) + "😀",
      },
    ],
  };
  const group = buildPublicAssistanceGroup(row, detail, [
    {
      key: "MATH1131",
      title: "t".repeat(499) + "😀",
      source: "official_evaluation",
      term: "1238",
    },
  ]);
  assert.equal(group.reviewCount, 12);
  assert.equal(group.reviewsSampled, true);
  assert.equal(group.reviews.length, 1);
  assert.equal(group.reviews[0].comment, "a".repeat(1999));
  assert.equal(group.name, "a".repeat(299));
  assert.equal(group.candidates[0].title, "t".repeat(499));
  assert.equal(group.candidates[0].source, "official_evaluation");
  assert.equal(group.candidates[0].term, "1238");
  assert.equal(group.teaching[0].source, "s".repeat(99));
  assert.equal(group.teaching[0].term, "");
  assert.equal(group.reviews[0].date, "d".repeat(99));
  assert.equal(JSON.stringify(group).includes("not-exported"), false);
  const db = new PGlite();
  try {
    const env = { NODE_ENV: "test", RMP_ADMIN_SCHEMA: "evidence_test" };
    await db.exec(
      rmpAdminSQL(
        await readFile(
          new URL("../../db/schemas/rmp-assistance.sql", import.meta.url),
          "utf8",
        ),
        env,
      ),
    );
    const job = await createAssistanceJob(
      (sql, values) => db.query(sql, values),
      { groups: [group], remote: false, minutes: 60 },
      { actor: "developer:test", userId: null },
      env,
    );
    assert.equal(job.export.groups[0].reviews[0].comment, "a".repeat(1999));
    assert.match(job.export.instructions, /untrusted data/i);
    assert.match(job.export.instructions, /reviewCount/);
  } finally {
    await db.close();
  }
});

test("complete short review sets are identified without a sampling claim", () => {
  const group = buildPublicAssistanceGroup(
    { ...row, reviewCount: 1 },
    {
      row,
      teaching: [],
      history: [],
      reviews: [
        { id: "10", course: "1131", comment: "A whole 😀 comment", date: null },
      ],
    },
    [],
  );
  assert.equal(group.reviewCount, 1);
  assert.equal(group.reviewsSampled, false);
  assert.equal(group.reviews[0].comment, "A whole 😀 comment");
});

test("a 100-group export resolves shared targets once and keeps campus evidence separate", async () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({
    ...row,
    professorId: String(index + 1),
    campus: index % 2 ? "MNS" : "COL",
    reviewCount: 0,
  }));
  let lookups = 0;
  const exported = await collectAssistanceEvidence(rows, {
    loadRows: async () => rows,
    loadDetail: async (identity) => ({
      row: rows.find((item) => item.professorId === identity.professorId),
      teaching: [],
      reviews: [],
      history: [],
    }),
    lookupTargets: async (targets) => {
      lookups++;
      assert.deepEqual(targets, [
        { campus: "COL", key: "MATH1131" },
        { campus: "MNS", key: "MATH1131" },
      ]);
      return [
        {
          campus: "COL",
          key: "MATH1131",
          title: "Columbus course",
          source: "official_catalog",
          term: "1268",
        },
      ];
    },
  });
  assert.equal(lookups, 1);
  assert.equal(exported.length, 100);
  assert.deepEqual(exported[0].candidates, [
    {
      key: "MATH1131",
      title: "Columbus course",
      source: "official_catalog",
      term: "1268",
    },
  ]);
  assert.deepEqual(exported[1].candidates, []);
});
