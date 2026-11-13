import { isDatabaseConfigured, queryDatabase } from "../db.ts";
import type {
  SyllabusDocument,
  SyllabusEntry,
  SyllabusQuery,
  SyllabusResult,
  SyllabusTerm,
} from "./types.ts";

export async function syllabusBackupTerms(): Promise<SyllabusResult<
  SyllabusTerm[]
> | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const result = await queryDatabase<{
      data: SyllabusTerm;
      checked_at: Date;
    }>(
      "SELECT data, checked_at FROM osu_syllabus.terms ORDER BY code DESC NULLS LAST",
    );
    return result.rows.length
      ? {
          data: result.rows.map((row) => row.data),
          source: "backup",
          fetchedAt: result.rows
            .reduce(
              (latest, row) =>
                row.checked_at > latest ? row.checked_at : latest,
              result.rows[0].checked_at,
            )
            .toISOString(),
        }
      : null;
  } catch {
    return null;
  }
}

export async function syllabusBackupEntries(
  query: SyllabusQuery,
): Promise<SyllabusResult<SyllabusEntry[]> | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const result = await queryDatabase<{
      data: SyllabusEntry;
      fetched_at: Date;
    }>(
      `SELECT o.data,o.fetched_at FROM osu_syllabus.index_heads h
       JOIN osu_syllabus.entry_observations o USING(run_id,term_id)
       JOIN osu_syllabus.entries e ON e.code=o.code
       WHERE e.term_code=$1 AND e.subject=$2 AND e.catalog_number=$3
       ORDER BY e.class_number,e.code LIMIT 501`,
      [
        query.termCode,
        query.subject.toUpperCase(),
        query.catalogNumber.toUpperCase(),
      ],
    );
    if (result.rows.length > 500) return null;
    return result.rows.length
      ? {
          data: result.rows.map((row) => row.data),
          source: "backup",
          fetchedAt: new Date(
            Math.min(...result.rows.map((row) => row.fetched_at.getTime())),
          ).toISOString(),
        }
      : null;
  } catch {
    return null;
  }
}

export async function syllabusBackupDocument(
  code: string,
): Promise<SyllabusResult<SyllabusDocument> | null> {
  if (!isDatabaseConfigured()) return null;
  try {
    const result = await queryDatabase<{
      data: SyllabusDocument;
      checked_at: Date;
    }>(
      "SELECT data,checked_at FROM osu_syllabus.document_versions WHERE code=$1 ORDER BY osu_syllabus.official_modified(data->>'modifiedAt') DESC NULLS LAST,first_fetched_at DESC,content_hash DESC LIMIT 1",
      [code],
    );
    const row = result.rows[0];
    return row
      ? {
          data: row.data,
          source: "backup",
          fetchedAt: row.checked_at.toISOString(),
        }
      : null;
  } catch {
    return null;
  }
}
