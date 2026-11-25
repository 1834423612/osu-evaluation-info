import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { it } from "node:test";
import * as comparison from "../../scripts/catalog/diagnostics.mjs";

it("compares immutable section identities by term/class, distinguishing changes from additions and removals", () => {
  assert.equal(typeof comparison.compareSectionIdentities, "function");
  const old = [
    {
      term_code: "1272",
      class_number: "1",
      course_id: "10",
      subject: "MATH",
      catalog_number: "1151",
    },
    {
      term_code: "1272",
      class_number: "2",
      course_id: "11",
      subject: "MATH",
      catalog_number: "1152",
    },
  ];
  const current = [
    { ...old[0], catalog_number: "1152" },
    { ...old[0], term_code: "1268" },
  ];
  const diff = comparison.compareSectionIdentities(current, old);
  assert.equal(diff.added.length, 1);
  assert.equal(diff.removed.length, 1);
  assert.deepEqual(diff.changed, [
    {
      term: "1272",
      classNumber: "1",
      differences: [
        { field: "catalog_number", archived: "1151", official: "1152" },
      ],
    },
  ]);
  assert.equal(diff.unchanged, 0);
});

it("reproduces an official page without a database and emits field comparisons for rejected records", async () => {
  const directory = await mkdtemp(join(tmpdir(), "catalog-inspection-"));
  const script = new URL(
    "../../scripts/catalog/inspect-official.mjs",
    import.meta.url,
  ).pathname;
  try {
    const preload = join(directory, "fetch.mjs");
    await writeFile(
      preload,
      `globalThis.fetch=async url=>{
      if(!String(url).startsWith('https://content.osu.edu/v2/classes/search?'))throw Error('Unexpected source');
      return Response.json({data:{totalItems:1,totalPages:1,filters:[],courses:[{course:{courseId:'10',subject:'PHYSICS',catalogNumber:'1'},sections:[{termCode:'1272',classNumber:'9',courseId:'10',courseOfferingNumber:'1',secCampus:'COL'}]}]}});
    };`,
    );
    await assert.rejects(
      promisify(execFile)(
        process.execPath,
        ["--import", preload, script, "--term", "1272", "--subject", "math"],
        {
          env: { ...process.env, DATABASE_URL: "invalid-and-must-not-be-used" },
        },
      ),
      (error) => {
        const event = JSON.parse(error.stderr.trim());
        assert.equal(event.event, "catalog.inspection_failed");
        assert.equal(event.code, "CATALOG_SUBJECT_MISMATCH");
        assert.equal(event.subject, "math");
        assert.equal(event.page, 1);
        assert.ok(event.requestUrl.includes("subject=math"));
        assert.equal(event.details.classNumber, "9");
        assert.ok(event.details.path);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

it("finds a current class's archived identity outside the requested campus using real SQL", async () => {
  const directory = await mkdtemp(join(tmpdir(), "catalog-inspection-campus-"));
  const script = fileURLToPath(
    new URL("../../scripts/catalog/inspect-official.mjs", import.meta.url),
  );
  try {
    const preload = join(directory, "database.mjs");
    const packageFile = fileURLToPath(
      new URL("../../package.json", import.meta.url),
    );
    await writeFile(
      preload,
      `
      import {createRequire} from 'node:module';
      const require=createRequire(${JSON.stringify(packageFile)});
      const {PGlite}=require('@electric-sql/pglite'),pg=require('pg');
      const db=new PGlite();
      await db.exec(\`
        CREATE SCHEMA osu_catalog;
        CREATE TABLE osu_catalog.sync_runs(id uuid,status text,completed_at timestamptz,terms jsonb);
        CREATE TABLE osu_catalog.snapshot_versions(run_id uuid,published_at timestamptz);
        CREATE TABLE osu_catalog.section_snapshots(last_seen_run uuid,term_code text,class_number text,course_id text,offering_number text,campus_code text,subject text,catalog_number text);
        CREATE TABLE osu_catalog.course_snapshots(last_seen_run uuid,term_code text,course_id text,offering_number text,campus_code text,subject text,catalog_number text);
        INSERT INTO osu_catalog.sync_runs VALUES('00000000-0000-0000-0000-000000000001','complete',now(),'["1272"]');
        INSERT INTO osu_catalog.snapshot_versions VALUES('00000000-0000-0000-0000-000000000001',now());
        INSERT INTO osu_catalog.section_snapshots VALUES('00000000-0000-0000-0000-000000000001','1272','9','10','1','MNS','MATH','1');
        INSERT INTO osu_catalog.course_snapshots VALUES('00000000-0000-0000-0000-000000000001','1272','10','1','MNS','MATH','1');
      \`);
      pg.Client.prototype.connect=async()=>{};
      pg.Client.prototype.query=(...args)=>db.query(...args);
      pg.Client.prototype.end=()=>db.close();
      globalThis.fetch=async()=>Response.json({data:{totalItems:1,totalPages:1,filters:[],courses:[{course:{courseId:'10',subject:'MATH',catalogNumber:'1'},sections:[{termCode:'1272',classNumber:'9',courseId:'10',courseOfferingNumber:'1',secCampus:'COL'}]}]}});
    `,
    );
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--import",
        preload,
        script,
        "--term",
        "1272",
        "--subject",
        "math",
        "--campus",
        "col",
        "--compare-archive",
      ],
      {
        env: { ...process.env, DATABASE_URL: "postgresql://unused/inspection" },
      },
    );
    const { archive } = JSON.parse(result.stdout.trim());
    assert.equal(archive.added.length, 0);
    assert.equal(archive.changed.length, 1);
    assert.deepEqual(archive.changed[0].differences, [
      { field: "campus_code", archived: "MNS", official: "COL" },
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
