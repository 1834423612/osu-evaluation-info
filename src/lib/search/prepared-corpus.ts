import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import type { PoolClient } from "pg";
import { CourseSearchEngine, type SearchEngineSnapshot } from "./engine.ts";
import type { CatalogCorpus } from "./catalog-source.ts";

// Bump when normalization, ranking inputs, serialization or MiniSearch changes.
export const SEARCH_ARTIFACT_VERSION = 1;
const MAX_BYTES = 192 * 1024 * 1024;
type WireCorpus = Omit<
  CatalogCorpus,
  "engine" | "courses" | "sections" | "metadata"
> & {
  version: number;
  engine: SearchEngineSnapshot;
  courses: [string, import("../catalog/types").CatalogCourse][];
  sections: [string, Record<string, unknown>][];
  metadata: [string, Record<string, unknown>][];
};
export function encodePreparedCorpus(corpus: CatalogCorpus) {
  const json = Buffer.from(
    JSON.stringify({
      ...corpus,
      version: SEARCH_ARTIFACT_VERSION,
      engine: corpus.engine.snapshot(),
      courses: [...corpus.courses],
      sections: [...corpus.sections],
      metadata: [...corpus.metadata],
    }),
  );
  if (json.length > MAX_BYTES)
    throw new Error("Prepared search corpus exceeds size limit");
  const payload = gzipSync(json);
  return {
    payload,
    digest: createHash("sha256").update(payload).digest("hex"),
  };
}
export function decodePreparedCorpus(
  payload: Buffer,
  digest: string,
  expected: Pick<CatalogCorpus, "run" | "term">,
): CatalogCorpus {
  if (
    payload.length > MAX_BYTES ||
    createHash("sha256").update(payload).digest("hex") !== digest
  )
    throw new Error("Prepared search corpus integrity check failed");
  const data: WireCorpus = JSON.parse(
    gunzipSync(payload, { maxOutputLength: MAX_BYTES }).toString("utf8"),
  );
  if (
    data.version !== SEARCH_ARTIFACT_VERSION ||
    data.run !== expected.run ||
    data.term !== expected.term
  )
    throw new Error("Prepared search corpus generation mismatch");
  return {
    ...data,
    engine: CourseSearchEngine.restore(data.engine),
    courses: new Map(data.courses),
    sections: new Map(data.sections),
    metadata: new Map(data.metadata),
  };
}
/** No DDL and no persistent writes on a visitor request. Old deployments can fall back safely. */
export async function loadPreparedCorpus(
  connection: Pick<PoolClient, "query">,
  snapshot: Pick<CatalogCorpus, "run" | "term" | "terms" | "snapshotAt">,
): Promise<CatalogCorpus | null> {
  const table = await connection.query(
    "SELECT to_regclass('osu_catalog.search_artifacts') IS NOT NULL AS installed",
  );
  if (!table.rows[0]?.installed) return null;
  const result = await connection.query<{ payload: Buffer; digest: string }>(
    "SELECT payload,digest FROM osu_catalog.search_artifacts WHERE run_id=$1::uuid AND term_code=$2 AND format_version=$3",
    [snapshot.run, snapshot.term, SEARCH_ARTIFACT_VERSION],
  );
  if (!result.rows.length) return null;
  try {
    const { payload, digest } = result.rows[0];
    return { ...decodePreparedCorpus(payload, digest, snapshot), ...snapshot };
  } catch {
    console.warn(
      "Prepared catalog search artifact invalid; using published snapshot.",
    );
    return null;
  }
}
