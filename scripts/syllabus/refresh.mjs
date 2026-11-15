export function refreshCutoffs(term, options, now = Date.now()) {
  const raw = term.endsAt ?? "",
    parsed = Date.parse(raw),
    end = parsed + (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? 36 * 3600000 : 0),
    ended = Number.isFinite(end) && end < now,
    closing = Number.isFinite(end) && !ended && now >= end - 7 * 86400000,
    positive = ended
      ? options.archiveRefreshHours
      : closing
        ? Math.min(options.refreshHours, 24)
        : options.refreshHours,
    negative = options.missingRefreshHours;
  const cutoff = (hours) =>
    hours > 0
      ? new Date(
          Math.max(now - hours * 3600000, ended ? end : -Infinity),
        ).toISOString()
      : null;
  return { positive: cutoff(positive), negative: cutoff(negative) };
}
/** Reuse a previous network check without moving its timestamp forward. */
export async function markFreshDocuments(client, runId, terms, options) {
  let reused = 0;
  for (const term of terms) {
    const cutoff = refreshCutoffs(term, options);
    const result = await client.query(
      `UPDATE osu_syllabus.entry_observations o SET document_status=c.status
      FROM osu_syllabus.document_checks c,osu_syllabus.sync_partitions p
      WHERE o.run_id=$1 AND o.term_id=$2 AND o.document_status IS NULL AND c.code=o.code AND c.entry_data=o.data
        AND p.run_id=o.run_id AND p.term_id=o.term_id AND p.published_at IS NOT NULL AND p.unavailable_at IS NULL
        AND ((c.status IN ('saved','uploaded') AND c.checked_at >= $3::timestamptz)
          OR (c.status IN ('missing','restricted') AND c.checked_at >= $4::timestamptz))`,
      [runId, term.id, cutoff.positive, cutoff.negative],
    );
    reused += result.rowCount;
  }
  return reused;
}
export async function recordDocumentCheck(client, entry, status) {
  if (!["saved", "uploaded", "missing", "restricted"].includes(status))
    throw Error("Only conclusive source checks can advance refresh state");
  await client.query(
    `INSERT INTO osu_syllabus.document_checks(code,entry_data,status) VALUES($1,$2,$3)
    ON CONFLICT(code) DO UPDATE SET entry_data=excluded.entry_data,status=excluded.status,checked_at=now()`,
    [entry.code, JSON.stringify(entry), status],
  );
}
