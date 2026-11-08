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

/** Explicit opt-in: real upstream + real SQL, all writes isolated and removed. */
it(
  "publishes the complete live official catalog in disposable storage",
  {
    skip: process.env.CATALOG_LIVE_TEST !== "1",
    timeout: 25 * 60_000,
  },
  async () => {
    loadCatalogEnvironment();
    const schema = `catalog_live_test_${randomUUID().replaceAll("-", "")}`;
    const root = new URL("../../", import.meta.url).pathname;
    const directory = await mkdtemp(join(tmpdir(), "osu-catalog-live-test-"));
    const client = new pg.Client({
      connectionString: process.env.DATABASE_URL,
      application_name: "osu-catalog-live-test",
      statement_timeout: 30_000,
    });
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
      import {writeFile} from 'node:fs/promises';
      const require=createRequire(${JSON.stringify(root + "package.json")});
      const pg=require('pg'),query=pg.Client.prototype.query;
      pg.Client.prototype.query=function(sql,values,...rest){
        if(typeof sql!=='string')throw new Error('Only scoped SQL strings are allowed');
        const scoped=sql.replaceAll('osu_catalog',${JSON.stringify(schema)});
        if(/\\b(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\\b/i.test(scoped)&&!scoped.includes(${JSON.stringify(schema)}))throw new Error('Unscoped mutation rejected');
        if(scoped.includes('pg_try_advisory_lock')||scoped.includes('pg_advisory_unlock'))values=[${randomInt(1000000000, 2000000000)}];
        return query.call(this,scoped,values,...rest);
      };
      const upstreamFetch=globalThis.fetch;
      globalThis.fetch=async(...args)=>{
        const response=await upstreamFetch(...args);
        if(response.ok&&new URL(args[0]).searchParams.has('p'))await writeFile('/tmp/osu-catalog-live-last-page.json',await response.clone().text());
        return response;
      };
    `,
      );
      console.log(`Live verification uses disposable schema ${schema}.`);
      try {
        const result = await promisify(execFile)(
          process.execPath,
          [
            "--import",
            preload,
            join(root, "scripts/catalog/sync_osu_catalog.mjs"),
            "--new-run",
          ],
          {
            cwd: root,
            env: process.env,
            timeout: 24 * 60_000,
            maxBuffer: 5 * 1024 * 1024,
          },
        );
        await writeFile(
          "/tmp/osu-catalog-live-verification.log",
          result.stdout + result.stderr,
        );
        assert.match(result.stdout, /Complete:/);
      } catch (error) {
        await writeFile(
          "/tmp/osu-catalog-live-verification.log",
          (error.stdout ?? "") + (error.stderr ?? ""),
        );
        throw new Error(
          `Live CLI failed; see /tmp/osu-catalog-live-verification.log: ${error.stderr ?? error.message}`,
        );
      }
      const publications = (
        await client.query(
          `SELECT r.id,r.expected_sections,r.fetched_hits,r.distinct_sections,v.published_at FROM ${schema}.sync_runs r JOIN ${schema}.snapshot_versions v ON v.run_id=r.id WHERE r.status='complete' AND v.published_at IS NOT NULL`,
        )
      ).rows;
      assert.equal(publications.length, 1);
      assert.ok(publications[0].distinct_sections > 0);
      assert.equal(
        publications[0].fetched_hits,
        publications[0].expected_sections,
      );
      console.log(JSON.stringify(publications[0]));
    } finally {
      if (created) await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
      await rm(directory, { recursive: true, force: true });
    }
  },
);
