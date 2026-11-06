import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withPageTransaction } from "../../scripts/catalog/database.mjs";

function connection(rollbackFails = false) {
  const statements = [];
  return {
    statements,
    async query(sql) {
      statements.push(sql);
      if (sql === "ROLLBACK" && rollbackFails)
        throw new Error("connection lost");
    },
  };
}
const options = { wait: async () => {}, onRetry: () => {} };

describe("catalog page transaction recovery", () => {
  for (const code of ["40P01", "40001", "55P03"]) {
    it(`rolls back and retries the entire page after ${code}`, async () => {
      const client = connection();
      let calls = 0;
      await withPageTransaction(
        client,
        async () => {
          await client.query("PAGE AND CHECKPOINT");
          if (++calls === 1)
            throw Object.assign(new Error("transient"), { code });
        },
        options,
      );
      assert.equal(calls, 2);
      assert.deepEqual(client.statements, [
        "BEGIN",
        "PAGE AND CHECKPOINT",
        "ROLLBACK",
        "BEGIN",
        "PAGE AND CHECKPOINT",
        "COMMIT",
      ]);
    });
  }
  it("stops after three aborted attempts", async () => {
    const client = connection();
    let calls = 0;
    await assert.rejects(
      withPageTransaction(
        client,
        async () => {
          calls++;
          throw Object.assign(new Error("deadlock"), { code: "40P01" });
        },
        options,
      ),
    );
    assert.equal(calls, 3);
    assert.equal(client.statements.filter((s) => s === "ROLLBACK").length, 3);
    assert.ok(!client.statements.includes("COMMIT"));
  });
  it("does not replay an unknown commit result or permanent error", async () => {
    for (const code of ["ECONNRESET", "23505", "57014"]) {
      const client = connection();
      let calls = 0;
      await assert.rejects(
        withPageTransaction(
          client,
          async () => {
            calls++;
            throw Object.assign(new Error("failed"), { code });
          },
          options,
        ),
      );
      assert.equal(calls, 1);
    }
  });
  it("never retries a connection whose rollback failed", async () => {
    const client = connection(true);
    let calls = 0;
    await assert.rejects(
      withPageTransaction(
        client,
        async () => {
          calls++;
          throw Object.assign(new Error("deadlock"), { code: "40P01" });
        },
        options,
      ),
    );
    assert.equal(calls, 1);
  });
});
