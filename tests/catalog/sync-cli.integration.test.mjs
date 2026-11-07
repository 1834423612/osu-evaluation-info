import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { it } from "node:test";
import pg from "pg";
import { FIND_CATALOG_SNAPSHOT_SQL } from "../../src/lib/catalog/snapshot-policy.ts";
const exec = promisify(execFile);

it(
  "executes the real sync CLI against isolated storage and publishes only complete static data",
  { skip: process.env.CATALOG_DATABASE_TEST !== "1", timeout: 60000 },
  async () => {
    process.loadEnvFile(".env.local");
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
      ]) {
        await client.query(
          (
            await readFile(
              new URL(file, new URL("../../", import.meta.url)),
              "utf8",
            )
          ).replaceAll("osu_catalog", schema),
        );
      }
      await client.query(
        `CREATE TABLE ${schema}.schema_versions(version integer PRIMARY KEY);INSERT INTO ${schema}.schema_versions VALUES(2)`,
      );
      const preload = join(directory, "preload.mjs");
      await writeFile(
        preload,
        `
      import {createRequire} from 'node:module';
      const require=createRequire(${JSON.stringify(root + "package.json")});
      const pg=require('pg');const query=pg.Client.prototype.query;
      pg.Client.prototype.query=function(sql,values,...rest) {
        if(typeof sql!=='string') throw new Error('Only scoped SQL strings are allowed');
        const scoped=sql.replaceAll('osu_catalog',${JSON.stringify(schema)});
        if(/\\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\b/i.test(scoped)&&!scoped.includes(${JSON.stringify(schema)})) throw new Error('Unscoped database mutation rejected');
        if(scoped.includes('pg_try_advisory_lock')||scoped.includes('pg_advisory_unlock')) values=[1796102243];
        return query.call(this,scoped,values,...rest);
      };
      globalThis.fetch=async url=>{
        const parsed=new URL(url);
        if(parsed.pathname.endsWith('searchableTermsV2')) return Response.json({data:{data:[{classSearch:'Y',strm:'1272',descr:'Spring 2027'}]}});
        const bad=process.env.CATALOG_CLI_TEST_INCOMPLETE==='1'&&parsed.searchParams.has('p');
        const sections=Array.from({length:bad?1:2},(_,i)=>({termCode:'1272',classNumber:String(i+1),courseId:'section-identity',courseOfferingNumber:'section-offering',secCampus:'COL',enrollmentStatus:'Open',enrollmentTotal:29,waitlistTotal:3}));
        return Response.json({data:{totalItems:2,totalPages:1,filters:[{slug:'subject',items:[{term:'math',title:'Mathematics',count:2,selected:false}]}],courses:[{course:{courseId:'1',offeringNumber:'1',campusCode:'COL',subject:'MATH',catalogNumber:'1151',title:'Calculus',description:'Test fixture'},sections}]}});
      };
    `,
      );
      const command = [
        "--import",
        preload,
        join(root, "scripts/catalog/sync_osu_catalog.mjs"),
        "--new-run",
      ];
      const success = await exec(process.execPath, command, {
        cwd: root,
        env: process.env,
        timeout: 20000,
      });
      assert.match(success.stdout, /Complete: 2 official hits/);
      const published = (
        await client.query(
          FIND_CATALOG_SNAPSHOT_SQL.replaceAll("osu_catalog", schema),
          ["1272", null],
        )
      ).rows[0].id;
      const rows = (
        await client.query(
          `SELECT data FROM ${schema}.section_snapshots WHERE last_seen_run=$1`,
          [published],
        )
      ).rows;
      assert.equal(rows.length, 2);
      assert.ok(
        rows.every(
          (row) =>
            !("enrollmentTotal" in row.data) &&
            !("enrollmentStatus" in row.data) &&
            !("waitlistTotal" in row.data),
        ),
      );
      await assert.rejects(
        exec(process.execPath, command, {
          cwd: root,
          env: { ...process.env, CATALOG_CLI_TEST_INCOMPLETE: "1" },
          timeout: 20000,
        }),
        (error) =>
          error.code === 1 && error.stderr.includes("Coverage check failed"),
      );
      assert.equal(
        (
          await client.query(
            FIND_CATALOG_SNAPSHOT_SQL.replaceAll("osu_catalog", schema),
            ["1272", null],
          )
        ).rows[0].id,
        published,
      );
      assert.equal(
        (
          await client.query(
            `SELECT count(*)::int AS n FROM ${schema}.sync_runs WHERE status='failed'`,
          )
        ).rows[0].n,
        1,
      );
    } finally {
      if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
