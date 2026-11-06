#!/usr/bin/env python3
"""Preserve legacy SQLite-only RMP records without inventing source review IDs."""

from __future__ import annotations

import argparse
import contextlib
import json
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Iterator

try:
    from .sync_rmp_mappings import ROOT, connect_database, ensure_schema, load_dsn
except ImportError:
    from sync_rmp_mappings import ROOT, connect_database, ensure_schema, load_dsn

LOCK_ID = 7241102918
REQUIRED_COLUMNS = {
    "professors": {"school_id", "professor_id", "name", "payload", "last_seen_at"},
    "reviews": {"review_key", "school_id", "professor_id", "date", "course", "quality",
                "difficulty", "comment", "payload", "last_seen_at"},
}


def positive_id(value: Any) -> int:
    raw = str(value)
    if not raw.isascii() or not raw.isdigit() or not 0 < int(raw) < 2**63:
        raise ValueError("Legacy source IDs must be positive bigint values.")
    return int(raw)


def source_payload(row: sqlite3.Row, source_name: str) -> dict[str, Any]:
    record = dict(row)
    raw = record.get("payload")
    try:
        record["payload"] = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        # Keep malformed legacy payloads for later investigation as plain text.
        pass
    return {"source": "legacy_sqlite", "source_file": source_name, "record": record}


@contextlib.contextmanager
def source_snapshot(path: Path) -> Iterator[sqlite3.Connection]:
    if not path.is_file():
        raise RuntimeError("The legacy SQLite source file does not exist.")
    with tempfile.TemporaryDirectory(prefix="osu-rmp-reconcile-") as temp:
        source = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True, timeout=5)
        snapshot = sqlite3.connect(str(Path(temp) / "snapshot.sqlite"))
        try:
            deadline = time.monotonic() + 45

            def check_deadline(_status: int, _remaining: int, _total: int) -> None:
                if time.monotonic() > deadline:
                    raise TimeoutError("SQLite snapshot exceeded 45 seconds; retry when its writer is quieter.")

            source.backup(snapshot, pages=1024, progress=check_deadline, sleep=0.01)
            source.close()
            snapshot.row_factory = sqlite3.Row
            if snapshot.execute("PRAGMA quick_check").fetchone()[0] != "ok":
                raise RuntimeError("Legacy SQLite snapshot failed quick_check.")
            for table, required in REQUIRED_COLUMNS.items():
                columns = {row[1] for row in snapshot.execute(f"PRAGMA table_info({table})")}
                if not required <= columns:
                    raise RuntimeError(f"Legacy SQLite {table} schema is unsupported.")
            yield snapshot
        finally:
            source.close()
            snapshot.close()


def copy_postgres_comparison(conn, snapshot: sqlite3.Connection) -> None:
    """Read one consistent PostgreSQL snapshot into a disposable local index."""
    snapshot.execute("CREATE TABLE pg_profile (id INTEGER PRIMARY KEY)")
    snapshot.execute("""CREATE TABLE pg_review (
        id INTEGER PRIMARY KEY, professor_id INTEGER, day TEXT, course TEXT,
        comment TEXT, quality REAL, difficulty REAL)""")
    with conn.transaction():
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        with conn.cursor(name="rmp_supplement_profiles") as cursor:
            cursor.execute("SELECT legacy_id FROM osu_rmp.professor")
            while rows := cursor.fetchmany(1000):
                snapshot.executemany("INSERT INTO pg_profile VALUES (?)", rows)
        with conn.cursor(name="rmp_supplement_reviews") as cursor:
            cursor.execute("""SELECT legacy_id,professor_id,substring(date_text FROM 1 FOR 10),
                coalesce(class_name,''),coalesce(comment,''),
                coalesce(clarity_rating,helpful_rating)::float8,difficulty_rating::float8 FROM osu_rmp.review""")
            while rows := cursor.fetchmany(1000):
                snapshot.executemany("INSERT INTO pg_review VALUES (?,?,?,?,?,?,?)", rows)
    snapshot.execute("CREATE INDEX pg_review_identity ON pg_review (professor_id,day,course,comment)")
    snapshot.commit()


def review_matches(snapshot: sqlite3.Connection) -> None:
    snapshot.execute("""CREATE TEMP TABLE review_match AS
        SELECT r.review_key,count(p.id) AS matches,min(p.id) AS matched_id
        FROM reviews r LEFT JOIN pg_review p
          ON p.professor_id=CAST(r.professor_id AS INTEGER)
         AND coalesce(p.day,'')=coalesce(r.date,'')
         AND p.course=coalesce(r.course,'') AND p.comment=coalesce(r.comment,'')
         AND ((p.quality IS NULL AND r.quality IS NULL) OR abs(p.quality-r.quality)<0.000001)
         AND ((p.difficulty IS NULL AND r.difficulty IS NULL) OR abs(p.difficulty-r.difficulty)<0.000001)
        GROUP BY r.review_key""")
    snapshot.execute("CREATE UNIQUE INDEX review_match_key ON review_match(review_key)")


def supplement_rows(snapshot: sqlite3.Connection, source_name: str) -> list[tuple[Any, ...]]:
    rows: list[tuple[Any, ...]] = []
    for row in snapshot.execute("""SELECT p.* FROM professors p WHERE NOT EXISTS (
        SELECT 1 FROM pg_profile g WHERE g.id=CAST(p.professor_id AS INTEGER))"""):
        professor_id, school_id = positive_id(row["professor_id"]), positive_id(row["school_id"])
        rows.append(("professor", f"sqlite:{school_id}:{professor_id}", professor_id,
                     school_id, json.dumps(source_payload(row, source_name)), row["last_seen_at"]))
    for row in snapshot.execute("""SELECT r.* FROM reviews r JOIN review_match m USING(review_key)
        WHERE m.matches=0"""):
        rows.append(("review", "sqlite:" + row["review_key"], positive_id(row["professor_id"]),
                     positive_id(row["school_id"]), json.dumps(source_payload(row, source_name)),
                     row["last_seen_at"]))
    return rows


def discrepancy_counts(snapshot: sqlite3.Connection) -> tuple[int, int]:
    ratings = snapshot.execute("""SELECT count(*) FROM reviews r
        JOIN review_match m USING(review_key) WHERE m.matches=0 AND EXISTS (
          SELECT 1 FROM pg_review p WHERE p.professor_id=CAST(r.professor_id AS INTEGER)
            AND coalesce(p.day,'')=coalesce(r.date,'') AND p.course=coalesce(r.course,'')
            AND p.comment=coalesce(r.comment,''))""").fetchone()[0]
    unmatched = snapshot.execute("SELECT count(*) FROM review_match WHERE matches=0").fetchone()[0]
    return unmatched - ratings, ratings


def save_supplements(conn, rows: list[tuple[Any, ...]]) -> int:
    changed = 0
    for row in rows:
        changed += conn.execute("""INSERT INTO osu_rmp.legacy_supplement
            (kind,source_key,professor_id,school_id,payload,source_seen_at)
            VALUES (%s,%s,%s,%s,%s::jsonb,%s)
            ON CONFLICT (kind,source_key) DO UPDATE SET payload=EXCLUDED.payload,
              source_seen_at=EXCLUDED.source_seen_at
            WHERE ROW(osu_rmp.legacy_supplement.payload,osu_rmp.legacy_supplement.source_seen_at)
              IS DISTINCT FROM ROW(EXCLUDED.payload,EXCLUDED.source_seen_at)""", row).rowcount
    return changed


def reconcile_existing(conn, snapshot: sqlite3.Connection) -> int:
    existing = conn.execute("""SELECT source_key,payload FROM osu_rmp.legacy_supplement
        WHERE kind='review' AND matched_review_id IS NULL""").fetchall()
    changed = 0
    for key, payload in existing:
        if not isinstance(payload, dict) or payload.get("source") != "legacy_sqlite":
            continue
        row = payload.get("record", {})
        matches = snapshot.execute("""SELECT id FROM pg_review WHERE professor_id=?
            AND coalesce(day,'')=? AND course=? AND comment=?
            AND ((quality IS NULL AND ? IS NULL) OR abs(quality-?)<0.000001)
            AND ((difficulty IS NULL AND ? IS NULL) OR abs(difficulty-?)<0.000001)
            LIMIT 2""", (positive_id(row.get("professor_id")), row.get("date") or "",
                          row.get("course") or "", row.get("comment") or "",
                          row.get("quality"), row.get("quality"),
                          row.get("difficulty"), row.get("difficulty"))).fetchall()
        if len(matches) == 1:
            changed += conn.execute("""UPDATE osu_rmp.legacy_supplement SET matched_review_id=%s
                WHERE kind='review' AND source_key=%s AND matched_review_id IS NULL""",
                (matches[0][0], key)).rowcount
    return changed


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sqlite", type=Path, default=ROOT / "db" / "osu_rmp.sqlite")
    parser.add_argument("--dsn", help="Defaults to DATABASE_URL or .env.local")
    parser.add_argument("--dry-run", action="store_true", help="Compare without saving supplement rows")
    args = parser.parse_args(argv)
    conn = None
    locked = False
    try:
        conn = connect_database(load_dsn(args.dsn))
        locked = bool(conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0])
        if not locked:
            raise RuntimeError("Another legacy supplement comparison is already running.")
        ensure_schema(conn)
        with source_snapshot(args.sqlite) as snapshot:
            copy_postgres_comparison(conn, snapshot)
            review_matches(snapshot)
            rows = supplement_rows(snapshot, args.sqlite.name)
            counts = dict(snapshot.execute("SELECT matches,count(*) FROM review_match GROUP BY matches"))
            new_comments, rating_discrepancies = discrepancy_counts(snapshot)
            print(json.dumps({"sqlite_professors": snapshot.execute("SELECT count(*) FROM professors").fetchone()[0],
                              "sqlite_reviews": snapshot.execute("SELECT count(*) FROM reviews").fetchone()[0],
                              "unique_professors": sum(row[0] == "professor" for row in rows),
                              "unmatched_reviews": counts.get(0, 0),
                              "unmatched_comment_reviews": new_comments,
                              "rating_discrepancy_reviews": rating_discrepancies,
                              "unambiguous_reviews": counts.get(1, 0),
                              "ambiguous_reviews": sum(count for matches, count in counts.items() if matches > 1),
                              "dry_run": args.dry_run}, sort_keys=True))
            if not args.dry_run:
                with conn.transaction():
                    changed = save_supplements(conn, rows)
                    reconciled = reconcile_existing(conn, snapshot)
                print(json.dumps({"supplement_rows_changed": changed,
                                  "supplement_reviews_reconciled": reconciled}, sort_keys=True))
        return 0
    except Exception as exc:
        print(f"[error] {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        if conn is not None:
            if locked:
                with contextlib.suppress(Exception):
                    conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
            conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
