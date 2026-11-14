import assert from "node:assert/strict";
import { randomUUID, randomInt } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "node:test";
import pg from "pg";
import { loadCatalogEnvironment } from "../../scripts/catalog/database.mjs";
import { selectRun } from "../../scripts/catalog/checkpoints.mjs";
import { FIND_CATALOG_SNAPSHOT_SQL } from "../../src/lib/catalog/snapshot-policy.ts";
const exec = promisify(execFile);

it(
  "executes checkpoint recovery and rejects corrupt data through the real CLI",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1", timeout: 120000 },
  async (t) => {
    loadCatalogEnvironment();
    const schema = `catalog_cli_test_${randomUUID().replaceAll("-", "")}`;
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      application_name: "osu-catalog-cli-test",
      statement_timeout: 5000,
    });
    const directory = await mkdtemp(join(tmpdir(), "osu-catalog-cli-test-"));
    const root = new URL("../../", import.meta.url).pathname;
    let created = false;
    try {
      await client.connect();
      await client.query(`CREATE SCHEMA ${schema}`);
      created = true;
      for (const file of [
        "db/schemas/catalog.sql",
        "db/migrations/catalog/002-versioned-snapshots.sql",
        "db/migrations/catalog/004-term-archives.sql",
        "db/migrations/catalog/005-course-changes.sql",
      ])
        await client.query(
          (
            await readFile(
              new URL(file, new URL("../../", import.meta.url)),
              "utf8",
            )
          ).replaceAll("osu_catalog", schema),
        );
      await client.query(
        `CREATE TABLE ${schema}.schema_versions(version integer PRIMARY KEY);INSERT INTO ${schema}.schema_versions VALUES(5)`,
      );
      const preload = join(directory, "preload.mjs");
      await writeFile(
        preload,
        `
      import {createRequire} from 'node:module';
      const require=createRequire(${JSON.stringify(root + "package.json")});
      const pg=require('pg'), query=pg.Client.prototype.query;
      pg.Client.prototype.query=function(sql,values,...rest){
        if(typeof sql!=='string')throw new Error('Only scoped SQL strings allowed');
        const scoped=sql.replaceAll('osu_catalog',${JSON.stringify(schema)});
        if(/\\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\b/i.test(scoped)&&!scoped.includes(${JSON.stringify(schema)}))throw new Error('Unscoped database mutation rejected');
        if(scoped.includes('pg_try_advisory_lock')||scoped.includes('pg_advisory_unlock'))values=[${randomInt(1000000000, 2000000000)}];
        return query.call(this,scoped,values,...rest);
      };
      let pageCalls=0;
      globalThis.fetch=async url=>{
        const parsed=new URL(url),mode=process.env.CATALOG_CLI_MODE??'normal';
        if(parsed.pathname.endsWith('searchableTermsV2'))return Response.json({data:{data:[{classSearch:'Y',strm:'1272',descr:'Spring'}]}});
        let counts=mode==='shift'?{math:3,physics:1}:mode==='keys'?{math:2,chem:2}:{math:2,physics:2};
        const subject=parsed.searchParams.get('subject'), page=parsed.searchParams.has('p');
        if(mode==='discovery-gap'&&!subject)counts={math:2};
        let count=subject?counts[subject]:4;
        if(page){pageCalls++;if(mode==='drift-always'||mode==='drift-once'&&pageCalls===1)count++;}
        const subjects={math:'MATH',physics:'PHYSICS',chem:'CHEM'};
        let sections=Array.from({length:count},(_,i)=>({termCode:'1272',classNumber:String((subject==='math'?100:200)+i),courseId:subject==='math'?'1':'2',courseOfferingNumber:'1',secCampus:'COL',enrollmentStatus:'Open',enrollmentTotal:9}));
        if(mode==='incomplete'&&page)sections.pop();
        if(mode==='bad-id'&&page)delete sections[0].classNumber;
        if(mode==='conflict'&&page&&subject==='physics')sections[0].classNumber='100';
        if(mode==='variants'&&page)sections[1]={...sections[1],courseOfferingNumber:'2',secCampus:'MNS'};
        const course={courseId:subject==='math'?'1':'2',subject:subjects[subject]??'MATH',catalogNumber:'1151',title:'Fixture',description:'Test',enrollmentTotal:5};
        return Response.json({data:{totalItems:count,totalPages:1,filters:[{slug:'subject',items:Object.entries(counts).map(([term,count])=>({term,count,selected:false}))}],courses:page?[{course,sections}]:[]}});
      };
    `,
      );
      const run = (mode = "normal", args = []) =>
        exec(
          process.execPath,
          [
            "--import",
            preload,
            join(root, "scripts/catalog/sync_osu_catalog.mjs"),
            ...args,
          ],
          {
            cwd: root,
            env: { ...process.env, CATALOG_CLI_MODE: mode },
            timeout: 30000,
          },
        );
      const published = async () =>
        (
          await client.query(
            FIND_CATALOG_SNAPSHOT_SQL.replaceAll("osu_catalog", schema),
            ["1272", null],
          )
        ).rows[0]?.id;
      const latest = async () =>
        (
          await client.query(
            `SELECT * FROM ${schema}.sync_runs ORDER BY started_at DESC LIMIT 1`,
          )
        ).rows[0];
      const totalRuns = async () =>
        (
          await client.query(
            `SELECT count(*)::int AS n FROM ${schema}.sync_runs`,
          )
        ).rows[0].n;
      let stable;
      await t.test(
        "publishes missing-parent-field and multi-campus/offer variants without volatile fields",
        async () => {
          assert.match(
            (await run("variants", ["--new-run"])).stdout,
            /Complete: 4 official hits/,
          );
          stable = await published();
          const courses = (
            await client.query(
              `SELECT * FROM ${schema}.course_snapshots WHERE last_seen_run=$1`,
              [stable],
            )
          ).rows;
          assert.equal(courses.length, 4);
          assert.ok(
            courses.every(
              (c) =>
                c.offering_number !== "undefined" &&
                c.campus_code &&
                !("enrollmentTotal" in c.data),
            ),
          );
        },
      );
      await t.test(
        "unchanged checkpoint resumes the same run and leaves publication intact until complete",
        async () => {
          await run("normal", ["--new-run", "--max-pages", "1"]);
          const partial = await latest();
          assert.equal(await published(), stable);
          assert.match(
            (await run()).stdout,
            new RegExp(`Resuming run ${partial.id}`),
          );
          assert.equal(await published(), partial.id);
          stable = partial.id;
        },
      );
      for (const mode of ["shift", "keys"]) {
        await t.test(
          `replaces stale ${mode} plan even though the overall total is unchanged`,
          async () => {
            await run("normal", ["--new-run", "--max-pages", "1"]);
            const partial = await latest();
            assert.equal(await published(), stable);
            assert.match((await run(mode)).stdout, /Discarded stale run/);
            assert.notEqual(await published(), partial.id);
            assert.equal(
              (
                await client.query(
                  `SELECT status FROM ${schema}.sync_runs WHERE id=$1`,
                  [partial.id],
                )
              ).rows[0].status,
              "failed",
            );
            stable = await published();
          },
        );
      }
      await t.test(
        "incomplete discovery performs no database writes",
        async () => {
          const before = await totalRuns();
          await assert.rejects(run("discovery-gap"), (e) =>
            e.stderr.includes("coverage mismatch"),
          );
          assert.equal(await totalRuns(), before);
          assert.equal(await published(), stable);
        },
      );
      for (const [mode, error] of [
        ["bad-id", "class number"],
        ["conflict", "Conflicting static"],
        ["incomplete", "Coverage check failed"],
      ]) {
        await t.test(
          `rejects ${mode} and rolls back the offending page`,
          async () => {
            await assert.rejects(
              run(mode, ["--new-run"]),
              (e) => e.code === 1 && e.stderr.includes(error),
            );
            assert.equal(await published(), stable);
            const latestRun = await latest();
            assert.equal(latestRun.status, "failed");
            assert.equal(
              (
                await client.query(
                  `SELECT count(*)::int AS n FROM ${schema}.section_snapshots WHERE last_seen_run=$1 AND course_id='2'`,
                  [latestRun.id],
                )
              ).rows[0].n,
              0,
            );
          },
        );
      }
      await t.test(
        "live drift restarts once and can recover within the same invocation",
        async () => {
          assert.match(
            (await run("drift-once", ["--new-run"])).stdout,
            /Complete: 4 official hits/,
          );
          stable = await published();
        },
      );
      await t.test(
        "persistent live drift has a bounded restart count and preserves publication",
        async () => {
          const before = await totalRuns();
          await assert.rejects(run("drift-always", ["--new-run"]));
          assert.equal(await totalRuns(), before + 2);
          assert.equal(await published(), stable);
        },
      );
      await t.test(
        "invalid legacy staging identities are replaced even with an unchanged plan",
        async () => {
          await run("normal", ["--new-run", "--max-pages", "1"]);
          const partial = await latest();
          await client.query(
            `UPDATE ${schema}.course_snapshots SET offering_number='undefined' WHERE last_seen_run=$1`,
            [partial.id],
          );
          assert.match((await run()).stdout, /Discarded stale run/);
          assert.notEqual(await published(), partial.id);
          stable = await published();
        },
      );
      await t.test(
        "expired checkpoints are rebuilt instead of mixing arbitrarily old pages",
        async () => {
          await run("normal", ["--new-run", "--max-pages", "1"]);
          const partial = await latest();
          await client.query(
            `UPDATE ${schema}.sync_runs SET started_at=now()-interval '7 hours' WHERE id=$1`,
            [partial.id],
          );
          assert.match((await run()).stdout, /Discarded stale run/);
          assert.notEqual(await published(), partial.id);
          stable = await published();
        },
      );
      await t.test(
        "replacement status, run and partitions roll back together on initialization failure",
        async () => {
          await run("normal", ["--new-run", "--max-pages", "1"]);
          const before = await totalRuns(),
            partial = await latest();
          const scoped = {
            query(sql, values) {
              if (sql.includes("INSERT INTO osu_catalog.sync_partitions"))
                throw new Error("Injected partition initialization failure");
              return client.query(
                sql.replaceAll("osu_catalog", schema),
                values,
              );
            },
          };
          await assert.rejects(
            selectRun(
              scoped,
              ["1272"],
              { expectedTotal: 4, partitions: [] },
              true,
            ),
            /Injected/,
          );
          assert.equal(await totalRuns(), before);
          const after = await latest();
          assert.equal(after.id, partial.id);
          assert.equal(after.status, partial.status);
          assert.equal(after.error, partial.error);
          assert.equal(await published(), stable);
        },
      );
    } finally {
      if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
