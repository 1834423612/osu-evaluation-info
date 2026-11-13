import { pathToFileURL } from "node:url";

/** Compatibility entry point: archived generations are retained permanently. */
export async function pruneCatalogSnapshots() {
  return { deletedRows: 0, complete: true, retention: "permanent" };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(
    process.argv.includes("--help")
      ? "Catalog snapshots are permanent archives. This compatibility command never deletes or unpublishes data."
      : JSON.stringify(await pruneCatalogSnapshots()),
  );
}
