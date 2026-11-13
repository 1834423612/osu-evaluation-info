import assert from "node:assert/strict";
import { it } from "node:test";
import { pruneCatalogSnapshots } from "../../scripts/catalog/prune_snapshots.mjs";

it("legacy cleanup options cannot delete or retire any archived generation", async () => {
  const client = {
    query() {
      throw new Error("permanent retention must not execute cleanup SQL");
    },
  };
  assert.deepEqual(
    await pruneCatalogSnapshots(client, {
      keep: 1,
      minAgeHours: 0,
      batchSize: 2000,
    }),
    {
      deletedRows: 0,
      complete: true,
      retention: "permanent",
    },
  );
});
