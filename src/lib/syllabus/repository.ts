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
      "SELECT data, fetched_at FROM osu_syllabus.entries WHERE term_code=$1 AND subject=$2 AND catalog_number=$3 ORDER BY class_number,code LIMIT 501",
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
      "SELECT data,checked_at FROM osu_syllabus.document_versions WHERE code=$1 ORDER BY checked_at DESC LIMIT 1",
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
