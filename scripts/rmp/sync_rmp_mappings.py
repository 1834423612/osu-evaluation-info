#!/usr/bin/env python3
"""Refresh conservative RMP-to-OSU identity candidates from local official data."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "db" / "schemas" / "rmp-app.sql"
LOCK_ID = 7241102917
DEFAULT_TERM_WINDOW = 8
SCHEMA_VERSION = "rmp-app-v3"
OSU_EMAIL = re.compile(r"^([a-z][a-z0-9_-]*\.\d+)@(?:buckeyemail\.)?osu\.edu$", re.I)


def normalize_name(value: str | None) -> str:
    """Compare names conservatively while ignoring case, accents, spaces and punctuation."""
    if not value:
        return ""
    folded = unicodedata.normalize("NFKD", value).casefold()
    return "".join(char for char in folded if char.isalnum())


def normalize_course_key(value: str | None) -> str | None:
    """Return only OSU-shaped course codes; raw review values remain untouched."""
    if not value:
        return None
    normalized = re.sub(r"[\s_-]", "", value.upper())
    if not re.fullmatch(r"[A-Z]{2,8}\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2}", normalized):
        return None
    return normalized


def osu_username(email: str | None) -> str | None:
    if not email:
        return None
    match = OSU_EMAIL.fullmatch(email.strip())
    return match.group(1).lower() if match else None


def confidence_score(
    *, name_exact: bool, campus_match: bool, department_match: bool, course_overlap: int
) -> int:
    return (
        (55 if name_exact else 0)
        + (15 if campus_match else 0)
        + (15 if department_match else 0)
        + (15 if course_overlap > 0 else 0)
    )


def should_auto_accept(
    *,
    name_exact: bool,
    campus_match: bool,
    department_match: bool,
    course_overlap: int,
    unique_for_professor: bool,
    unique_for_identity: bool,
) -> bool:
    """Require four exact signals and an unambiguous identity at each campus."""
    return all(
        (
            name_exact,
            campus_match,
            department_match,
            course_overlap > 0,
            unique_for_professor,
            unique_for_identity,
        )
    )


def apply_manual_reservations(
    candidates: list[dict[str, Any]], reserved: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Do not let a scheduled evidence refresh overwrite a reviewed campus decision."""
    campuses: dict[str, set[str]] = defaultdict(set)
    profiles: set[int] = set()
    for item in reserved:
        professor_id = int(item["professor_id"])
        username = str(item["username"])
        profiles.add(professor_id)
        campuses[username].update(str(campus) for campus in item.get("campus_codes", []))
    for item in candidates:
        if item["state"] == "accepted" and (
            int(item["professor_id"]) in profiles
            or campuses[str(item["username"])] & set(item["campus_codes"])
        ):
            item["state"] = "candidate"
            item["evidence"]["manual_decision_reserved"] = True
    return candidates


def parse_args(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dsn", help="PostgreSQL connection string; defaults to DATABASE_URL/.env.local")
    parser.add_argument("--term-window", type=int, default=DEFAULT_TERM_WINDOW,
                        help="Use the newest N complete OSU catalog terms (1-16).")
    parser.add_argument("--dry-run", action="store_true", help="Report candidates without changing mapping rows.")
    parser.add_argument(
        "--export-candidates",
        metavar="PATH",
        help="Write current pending candidate evidence as UTF-8 JSONL; requires --dry-run.",
    )
    parser.add_argument("--accept", action="append", default=[], metavar="RMP_ID:OSU_USERNAME",
                        help="Record a reviewed accepted mapping; repeat for multiple decisions.")
    parser.add_argument("--reject", action="append", default=[], metavar="RMP_ID:OSU_USERNAME",
                        help="Record a reviewed rejected mapping; repeat for multiple decisions.")
    parser.add_argument("--reason", default="Manual review through the mapping CLI",
                        help="Reason retained in the local mapping decision audit log.")
    args = parser.parse_args(argv)
    if not 1 <= args.term_window <= 16:
        parser.error("--term-window must be between 1 and 16.")
    if args.export_candidates and not args.dry_run:
        parser.error("--export-candidates requires --dry-run.")
    try:
        args.decisions = parse_decisions(args.accept, args.reject)
    except ValueError as exc:
        parser.error(str(exc))
    return args


def parse_decisions(accepted: list[str], rejected: list[str]) -> list[tuple[int, str, str]]:
    result: dict[tuple[int, str], str] = {}
    for state, values in (("accepted", accepted), ("rejected", rejected)):
        for value in values:
            raw_id, sep, username = value.partition(":")
            username = username.lower()
            if not sep or not raw_id.isdigit() or int(raw_id) < 1 or not osu_username(username + "@osu.edu"):
                raise ValueError("Manual mappings must have the form RMP_ID:lastname.number.")
            key = (int(raw_id), username)
            if key in result and result[key] != state:
                raise ValueError("A mapping cannot be accepted and rejected in the same command.")
            result[key] = state
    accepted_professors = [professor for (professor, _), state in result.items() if state == "accepted"]
    if len(set(accepted_professors)) != len(accepted_professors):
        raise ValueError("Each RMP profile can be accepted for only one OSU username.")
    return [(professor, username, state) for (professor, username), state in result.items()]


def export_candidates(
    path: str | Path,
    candidates: list[dict[str, Any]],
    professors: list[dict[str, Any]],
    identities: dict[str, dict[str, Any]],
) -> int:
    """Write pending exact-name candidates with their review evidence as JSONL."""
    profiles = {int(profile["legacy_id"]): profile for profile in professors}
    pending = sorted(
        (item for item in candidates if item["state"] == "candidate"),
        key=lambda item: (
            -int(item["score"]),
            int(item["professor_id"]),
            str(item["username"]),
        ),
    )
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8", newline="\n") as report:
        for item in pending:
            profile = profiles.get(int(item["professor_id"]), {})
            identity = identities.get(str(item["username"]), {})
            row = {
                "rmp_profile_id": item["professor_id"],
                "rmp_name": " ".join(
                    part
                    for part in (
                        str(profile.get("first_name") or "").strip(),
                        str(profile.get("last_name") or "").strip(),
                    )
                    if part
                ),
                "rmp_department": profile.get("department"),
                "rmp_school_ids": sorted(profile.get("school_ids", [])),
                "rmp_course_codes": profile.get("course_codes", []),
                "osu_username": item["username"],
                "osu_display_name": identity.get("display_name"),
                "osu_name_variants": identity.get("names", []),
                "state": item["state"],
                "score": item["score"],
                "evidence": item["evidence"],
            }
            report.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
    return len(pending)


def load_dsn(explicit: str | None) -> str:
    if explicit and explicit.strip():
        return explicit.strip()
    value = os.environ.get("DATABASE_URL", "").strip()
    if value:
        return value
    env_path = ROOT / ".env.local"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, sep, raw = line.partition("=")
            if sep and key.strip() == "DATABASE_URL":
                return raw.strip().strip("\"'")
    raise RuntimeError("DATABASE_URL is missing from the environment and .env.local.")


def _object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _campus(value: str | None) -> str:
    raw = (value or "").strip().upper()
    aliases = {"COLUMBUS": "COL", "LIMA": "LMA", "MANSFIELD": "MNS",
               "MARION": "MRN", "NEWARK": "NWK", "WOOSTER": "WST", "ATI": "WST"}
    return aliases.get(raw, raw)


def dict_rows(cursor) -> list[dict[str, Any]]:
    columns = [column.name for column in cursor.description]
    return [dict(zip(columns, row)) for row in cursor.fetchall()]


def connect_database(dsn: str):
    try:
        import psycopg
    except ImportError as exc:
        raise RuntimeError("Install psycopg with: python3 -m pip install 'psycopg[binary]>=3.2'") from exc
    conn = psycopg.connect(dsn, connect_timeout=5, application_name="osu-rmp-mapping-sync", autocommit=True)
    conn.execute("SET lock_timeout = '2s'")
    conn.execute("SET statement_timeout = '60s'")
    conn.execute("SET idle_in_transaction_session_timeout = '15s'")
    return conn


def ensure_schema(conn) -> None:
    """Run additive DDL once, then build the large lookup index without write locks."""
    exists = conn.execute("SELECT to_regclass('osu_rmp.app_migration') IS NOT NULL").fetchone()[0]
    installed = exists and conn.execute(
        "SELECT EXISTS (SELECT 1 FROM osu_rmp.app_migration WHERE version=%s)", (SCHEMA_VERSION,)
    ).fetchone()[0]
    if not installed:
        conn.execute(SCHEMA.read_text(encoding="utf-8"))
    index = conn.execute(
        "SELECT i.indisvalid FROM pg_index i WHERE i.indexrelid=to_regclass('osu_rmp.idx_rmp_review_course_recent')"
    ).fetchone()
    if index and not index[0]:
        conn.execute("DROP INDEX CONCURRENTLY osu_rmp.idx_rmp_review_course_recent")
        index = None
    if not index:
        # Index creation can outlast a normal application query, without holding
        # the table write lock required by a regular CREATE INDEX.
        conn.execute("SET statement_timeout = '10min'")
        try:
            conn.execute(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rmp_review_course_recent "
                "ON osu_rmp.review (professor_id, osu_rmp.course_key(class_name), "
                "osu_rmp.review_day(date_text) DESC, legacy_id DESC) WHERE active"
            )
        finally:
            conn.execute("SET statement_timeout = '60s'")


def catalog_rows(conn, term_window: int) -> tuple[list[dict[str, Any]], list[str]]:
    if not conn.execute("SELECT to_regclass('osu_catalog.sections') IS NOT NULL").fetchone()[0]:
        return [], []
    # Rows are replaced in place by catalog sync. A newer incomplete run could
    # already have replaced part of a completed term: never use that partial
    # snapshot to invalidate previously confirmed evidence.
    selected = conn.execute(
        """WITH completed_term AS (
                 SELECT r.id AS run_id, r.completed_at, term.code AS term_code
                 FROM osu_catalog.sync_runs r
                 CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) term(code)
                 WHERE r.status='complete' AND r.completed_at IS NOT NULL
             ), latest AS (
                 SELECT DISTINCT ON (term_code) * FROM completed_term
                 ORDER BY term_code, completed_at DESC
             ) SELECT t.term_code,t.run_id FROM latest t
             WHERE NOT EXISTS (
                 SELECT 1 FROM osu_catalog.sync_runs newer
                 WHERE newer.status <> 'complete' AND newer.started_at > t.completed_at
                   AND newer.terms ? t.term_code
             ) ORDER BY t.term_code DESC LIMIT %s""", (term_window,)
    ).fetchall()
    if not selected:
        return [], []
    rows = dict_rows(conn.execute(
        """WITH selected_terms AS (
                 SELECT * FROM jsonb_to_recordset(%s::jsonb) AS x(term_code text,run_id uuid)
             )
             SELECT s.term_code, s.class_number, s.campus_code, s.subject,
                    s.catalog_number, s.fetched_at,
                    instructor->>'email' AS email,
                    instructor->>'displayName' AS display_name
             FROM selected_terms t
             JOIN osu_catalog.sections s ON s.term_code = t.term_code AND s.last_seen_run = t.run_id
             CROSS JOIN LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(s.data->'meetings') = 'array'
                      THEN s.data->'meetings' ELSE '[]'::jsonb END
             ) meeting
             CROSS JOIN LATERAL jsonb_array_elements(
                 CASE WHEN jsonb_typeof(meeting->'instructors') = 'array'
                      THEN meeting->'instructors' ELSE '[]'::jsonb END
             ) instructor
             WHERE osu_rmp.course_key(s.subject || s.catalog_number) IS NOT NULL
               AND instructor->>'email' IS NOT NULL
               AND instructor->>'displayName' IS NOT NULL
             ORDER BY s.term_code DESC, s.fetched_at DESC""",
        (json.dumps([{"term_code": term, "run_id": str(run_id)} for term, run_id in selected]),),
    ))
    return rows, [r[0] for r in selected]


def retained_catalog_rows(conn, refreshed_terms: list[str]) -> list[dict[str, Any]]:
    """Preserve the last mapping evidence while an in-place catalog refresh is partial."""
    if not conn.execute("SELECT to_regclass('osu_catalog.sections') IS NOT NULL").fetchone()[0]:
        return []
    return dict_rows(conn.execute(
        """SELECT ic.latest_term AS term_code,ic.source_record_key,ic.campus_code,ic.subject,
                   ic.catalog_number,ic.last_seen_at AS fetched_at,i.osu_email AS email,
                   i.display_name,ic.source
            FROM osu_rmp.instructor_course ic
            JOIN osu_rmp.instructor_identity i ON i.name_dot_number=ic.name_dot_number
            WHERE ic.active AND ic.source='official_catalog' AND NOT (ic.latest_term=ANY(%s))
              AND EXISTS (SELECT 1 FROM osu_catalog.sync_runs r
                WHERE r.status <> 'complete' AND r.terms ? ic.latest_term
                  AND r.started_at > coalesce((SELECT max(done.completed_at)
                    FROM osu_catalog.sync_runs done WHERE done.status='complete'
                      AND done.terms ? ic.latest_term), ic.last_seen_at))""", (refreshed_terms,)
    ))


def evaluation_rows(conn, term_window: int) -> tuple[list[dict[str, Any]], list[str]]:
    """Official evaluations provide usable identities before catalog collection."""
    if not conn.execute("SELECT to_regclass('osu_eval.instructor') IS NOT NULL").fetchone()[0]:
        return [], []
    terms = [row[0] for row in conn.execute(
        "SELECT label FROM osu_eval.term ORDER BY sort_key DESC LIMIT %s", (term_window,)
    ).fetchall()]
    if not terms:
        return [], []
    rows = dict_rows(conn.execute(
        """SELECT DISTINCT t.label AS term_code,t.sort_key AS term_sort_key,
                   s.class_number,s.campus_code,su.code AS subject,
                   c.catalog AS catalog_number,e.updated_at AS fetched_at,
                   i.name_dot_number || '@osu.edu' AS email,
                   coalesce(n.first_name || ' ' || n.last_name,i.current_full_name) AS display_name
            FROM osu_eval.evaluation e
            JOIN osu_eval.instructor i ON i.id=e.instructor_id
            JOIN osu_eval.section s ON s.id=e.section_id
            JOIN osu_eval.term t ON t.id=s.term_id
            JOIN osu_eval.course c ON c.id=s.course_id AND NOT c.catalog_unknown
            JOIN osu_eval.subject su ON su.id=c.subject_id
            LEFT JOIN LATERAL (
                SELECT first_name,last_name FROM osu_eval.instructor_name_observation
                WHERE instructor_id=i.id AND term_id=t.id
                ORDER BY last_seen_run_id DESC LIMIT 1
            ) n ON true
            WHERE t.label=ANY(%s) AND EXISTS (
                SELECT 1 FROM osu_eval.evaluation_source_state es
                WHERE es.evaluation_id=e.id AND es.active
            )""", (terms,)
    ))
    for row in rows:
        row["source"] = "official_evaluation"
    return rows, terms


def official_departments(conn) -> tuple[dict[str, set[str]], dict[str, int]]:
    exists = conn.execute("SELECT to_regclass('osu_eval.instructor') IS NOT NULL").fetchone()[0]
    if not exists:
        return {}, {}
    rows = conn.execute(
        """SELECT i.name_dot_number,
                    array_remove(array_agg(DISTINCT s.department), NULL) AS departments,
                    min(i.id) AS instructor_id
             FROM osu_eval.instructor i
             LEFT JOIN osu_eval.evaluation e ON e.instructor_id = i.id
             LEFT JOIN osu_eval.section s ON s.id = e.section_id
             GROUP BY i.name_dot_number"""
    ).fetchall()
    departments: dict[str, set[str]] = {}
    instructor_ids: dict[str, int] = {}
    for username, values, instructor_id in rows:
        departments[username] = {normalize_name(v) for v in _list(values) if v}
        instructor_ids[username] = int(instructor_id)
    return departments, instructor_ids


def load_department_aliases(conn) -> dict[str, set[str]]:
    if not conn.execute("SELECT to_regclass('osu_rmp.department_alias') IS NOT NULL").fetchone()[0]:
        return {}
    aliases: dict[str, set[str]] = defaultdict(set)
    for rmp_label, official_label in conn.execute(
        "SELECT rmp_department,official_department FROM osu_rmp.department_alias"
    ).fetchall():
        aliases[normalize_name(rmp_label)].add(normalize_name(official_label))
    return aliases


def include_official_name_history(conn, identities: dict[str, dict[str, Any]]) -> None:
    """Add only aliases observed under that exact official OSU username."""
    if not conn.execute(
        "SELECT to_regclass('osu_eval.instructor_name_observation') IS NOT NULL"
    ).fetchone()[0]:
        return
    aliases = conn.execute(
        """SELECT i.name_dot_number,
                  array_agg(DISTINCT n.first_name || ' ' || n.last_name)
           FROM osu_eval.instructor i
           JOIN osu_eval.instructor_name_observation n ON n.instructor_id=i.id
           WHERE i.name_dot_number=ANY(%s)
           GROUP BY i.name_dot_number""",
        (list(identities),),
    ).fetchall()
    for username, values in aliases:
        identities[username]["names"] = sorted(set(identities[username]["names"]) | set(values))


def collect_catalog_facts(rows: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], list[tuple[Any, ...]]]:
    names: dict[str, set[str]] = defaultdict(set)
    courses: dict[str, set[tuple[str, str, str, str, str, str, str]]] = defaultdict(set)
    latest: dict[str, tuple[str, Any, str]] = {}
    for row in rows:
        username = osu_username(row.get("email"))
        display_name = str(row.get("display_name") or "").strip()
        if not username or not display_name:
            continue
        term = str(row.get("term_code") or "")
        names[username].add(display_name)
        course = normalize_course_key(f"{row.get('subject') or ''}{row.get('catalog_number') or ''}")
        campus = _campus(row.get("campus_code"))
        if course and campus:
            class_number = str(row.get("class_number") or "")
            courses[username].add((str(row.get("source") or "official_catalog"), term,
                                   class_number, str(row.get("source_record_key") or ""), campus,
                                   str(row.get("subject") or "").upper(),
                                   str(row.get("catalog_number") or "")))
        previous = latest.get(username)
        # Catalog term codes and evaluation labels use different formats. Prefer
        # current catalog identities, then compare their source's term ordering.
        sort_term = str(row.get("term_sort_key") or term)
        priority = "1" if row.get("source") != "official_evaluation" else "0"
        key = (priority + sort_term, str(row.get("fetched_at") or ""), display_name)
        if previous is None or key > previous:
            latest[username] = key
    identities: dict[str, dict[str, Any]] = {}
    course_rows: list[tuple[Any, ...]] = []
    for username, values in names.items():
        display = latest[username][2]
        email = username + "@osu.edu"
        identities[username] = {"email": email, "display_name": display,
                                "names": sorted(values), "courses": set()}
    for username, facts in courses.items():
        for source, term, class_number, old_source_key, campus, subject, catalog in facts:
            course_key = normalize_course_key(subject + catalog)
            identities[username]["courses"].add(course_key)
            source_key = old_source_key or f"{term}:{campus}:{class_number}"
            course_rows.append((username, source, source_key, campus,
                                course_key, subject, catalog, term))
    return identities, course_rows


def catalog_candidates(
    professors: list[dict[str, Any]], identities: dict[str, dict[str, Any]],
    schools: dict[int, str], department_evidence: dict[str, set[str]],
    department_aliases: dict[str, set[str]] | None = None,
) -> list[dict[str, Any]]:
    department_aliases = department_aliases or {}
    by_name: dict[str, list[str]] = defaultdict(list)
    for username, item in identities.items():
        for name in item["names"]:
            normalized = normalize_name(name)
            if normalized and username not in by_name[normalized]:
                by_name[normalized].append(username)

    potential: list[dict[str, Any]] = []
    professor_counts: Counter[int] = Counter()
    identity_campus_counts: Counter[tuple[str, str]] = Counter()
    for profile in professors:
        professor_id = int(profile["legacy_id"])
        full_name = f"{profile.get('first_name') or ''} {profile.get('last_name') or ''}"
        normalized = normalize_name(full_name)
        if not normalized:
            continue
        professor_courses = {
            key for entry in _list(profile.get("course_codes"))
            if (key := normalize_course_key(_object(entry).get("courseName")))
        }
        rmp_departments = normalize_name(str(profile.get("department") or ""))
        rmp_campuses = {schools[sid] for sid in profile.get("school_ids", []) if sid in schools}
        for username in by_name.get(normalized, []):
            item = identities[username]
            osu_campuses = {fact[3] for fact in item.get("course_facts", [])}
            campus_intersection = sorted(rmp_campuses & osu_campuses)
            same_campus_courses = {
                fact[4] for fact in item.get("course_facts", []) if fact[3] in rmp_campuses
            }
            course_intersection = sorted(professor_courses & same_campus_courses)
            official_depts = department_evidence.get(username, set())
            alias_matches = sorted(department_aliases.get(rmp_departments, set()) & official_depts)
            dept_match = bool(rmp_departments and (rmp_departments in official_depts or alias_matches))
            if not campus_intersection and not course_intersection and not dept_match:
                continue
            entry = {
                "professor_id": professor_id,
                "username": username,
                "name_exact": True,
                "official_name_matches": sorted(
                    name for name in item["names"] if normalize_name(name) == normalized
                ),
                "campus_match": bool(campus_intersection),
                "campus_codes": campus_intersection,
                "department_match": dept_match,
                "department_alias_matches": alias_matches,
                "rmp_department": profile.get("department"),
                "osu_departments": sorted(department_evidence.get(username, set())),
                "course_matches": course_intersection,
                "official_sources": sorted({fact[1] for fact in item.get("course_facts", [])}),
                "rmp_courses": sorted(professor_courses),
                "school_ids": sorted(profile.get("school_ids", [])),
            }
            potential.append(entry)
            # Same-name entries without matching course and department evidence
            # do not compete with a complete, exact identity candidate.
            if campus_intersection and course_intersection and dept_match:
                professor_counts[professor_id] += 1
                for campus in campus_intersection:
                    identity_campus_counts[username, campus] += 1
    for entry in potential:
        accepted = should_auto_accept(
            name_exact=entry["name_exact"], campus_match=entry["campus_match"],
            department_match=entry["department_match"], course_overlap=len(entry["course_matches"]),
            unique_for_professor=professor_counts[entry["professor_id"]] == 1,
            unique_for_identity=all(identity_campus_counts[entry["username"], campus] == 1
                                    for campus in entry["campus_codes"]),
        )
        entry["state"] = "accepted" if accepted else "candidate"
        entry["score"] = confidence_score(
            name_exact=entry["name_exact"], campus_match=entry["campus_match"],
            department_match=entry["department_match"], course_overlap=len(entry["course_matches"]),
        )
        entry["evidence"] = {k: v for k, v in entry.items() if k not in {"professor_id", "username", "state", "score"}}
    return potential


def _manual_candidates(args, candidates: list[dict[str, Any]]) -> None:
    """Reserve identities named by this invocation before automatic upserts."""
    accepted = {(professor, username) for professor, username, state in args.decisions if state == "accepted"}
    accepted_profiles = {professor for professor, _, state in args.decisions if state == "accepted"}
    accepted_users = {username for _, username, state in args.decisions if state == "accepted"}
    for item in candidates:
        if item["state"] == "accepted" and (
            item["professor_id"] in accepted_profiles or item["username"] in accepted_users
        ) and (item["professor_id"], item["username"]) not in accepted:
            item["state"] = "candidate"
            item["evidence"]["manual_decision_reserved"] = True


def refresh_fingerprint(candidates: list[dict[str, Any]], source_terms: list[dict[str, Any]]) -> str:
    """Stable snapshot identity: unchanged evidence does not create audit churn."""
    snapshot = {
        "terms": sorted(source_terms, key=lambda item: (item["source"], item["term"])),
        "candidates": sorted(candidates, key=lambda item: (item["professor_id"], item["username"])),
    }
    return hashlib.sha256(json.dumps(snapshot, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _write_manual_decisions(conn, decisions: list[tuple[int, str, str]], reason: str) -> None:
    for professor_id, username, state in decisions:
        if not conn.execute("SELECT 1 FROM osu_rmp.professor WHERE legacy_id=%s", (professor_id,)).fetchone():
            raise RuntimeError(f"RMP profile {professor_id} does not exist.")
        if not conn.execute("SELECT 1 FROM osu_rmp.instructor_identity WHERE name_dot_number=%s", (username,)).fetchone():
            raise RuntimeError(f"OSU identity {username} does not exist in the recent official snapshots.")
        old = conn.execute(
            "SELECT state,method FROM osu_rmp.professor_identity_map WHERE professor_id=%s AND name_dot_number=%s",
            (professor_id, username),
        ).fetchone()
        if state == "accepted":
            conflicts = conn.execute(
                """SELECT m.professor_id,m.name_dot_number,m.method FROM osu_rmp.professor_identity_map m
                   WHERE m.state='accepted' AND NOT (m.professor_id=%s AND m.name_dot_number=%s)
                     AND (m.professor_id=%s OR (m.name_dot_number=%s AND EXISTS (
                       SELECT 1 FROM osu_rmp.professor_school previous
                       JOIN osu_rmp.school previous_school ON previous_school.legacy_id=previous.school_id
                       JOIN osu_rmp.professor_school chosen ON chosen.professor_id=%s
                       JOIN osu_rmp.school chosen_school ON chosen_school.legacy_id=chosen.school_id
                       WHERE previous.professor_id=m.professor_id
                         AND previous_school.campus_code=chosen_school.campus_code)))""",
                (professor_id, username, professor_id, username, professor_id),
            ).fetchall()
            if any(row[2] == "manual" for row in conflicts):
                raise RuntimeError(f"Manual mapping conflict for {professor_id}:{username}.")
            superseded = conn.execute(
                """UPDATE osu_rmp.professor_identity_map SET state='stale',updated_at=now()
                   WHERE state='accepted' AND method='evidence-v1' AND professor_id=ANY(%s)
                   RETURNING professor_id,name_dot_number""",
                ([row[0] for row in conflicts],),
            ).fetchall()
            for old_professor_id, old_username in superseded:
                conn.execute(
                    """INSERT INTO osu_rmp.mapping_decision_log
                         (professor_id,name_dot_number,previous_state,new_state,reason)
                       VALUES (%s,%s,'accepted','stale',%s)""",
                    (old_professor_id, old_username, f"Superseded: {reason}"),
                )
        evidence = {"method": "manual", "reason": reason}
        conn.execute(
            """INSERT INTO osu_rmp.professor_identity_map
                   (professor_id,name_dot_number,state,method,score,evidence)
               VALUES (%s,%s,%s,'manual',%s,%s::jsonb)
               ON CONFLICT (professor_id,name_dot_number) DO UPDATE SET
                 state=EXCLUDED.state,method='manual',score=EXCLUDED.score,
                 evidence=EXCLUDED.evidence,updated_at=now()""",
            (professor_id, username, state, 100 if state == "accepted" else 0, json.dumps(evidence)),
        )
        conn.execute(
            """INSERT INTO osu_rmp.mapping_decision_log
                 (professor_id,name_dot_number,previous_state,new_state,reason)
               VALUES (%s,%s,%s,%s,%s)""",
            (professor_id, username, old[0] if old else None, state, reason),
        )


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        conn = connect_database(load_dsn(args.dsn))
    except RuntimeError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2
    locked = False
    try:
        locked = bool(conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0])
        if not locked:
            print("[error] Another RMP mapping refresh is already running.", file=sys.stderr)
            return 2
        if args.dry_run:
            schema_ready = conn.execute(
                "SELECT to_regclass('osu_rmp.app_migration') IS NOT NULL"
            ).fetchone()[0]
            if schema_ready:
                schema_ready = conn.execute(
                    "SELECT EXISTS (SELECT 1 FROM osu_rmp.app_migration WHERE version=%s)",
                    ("rmp-app-v1",),
                ).fetchone()[0]
            if not schema_ready:
                raise RuntimeError(
                    "Read-only dry runs require the RMP application schema; "
                    "run the normal sync once to install it."
                )
        else:
            ensure_schema(conn)
        catalog, catalog_terms = catalog_rows(conn, args.term_window)
        evaluations, evaluation_terms = evaluation_rows(conn, args.term_window)
        source_rows = catalog + retained_catalog_rows(conn, catalog_terms) + evaluations
        terms = sorted(set(catalog_terms + evaluation_terms), reverse=True)
        if not terms:
            raise RuntimeError("No complete OSU catalog or official evaluation snapshots are available.")
        identities, course_rows = collect_catalog_facts(source_rows)
        if not identities:
            raise RuntimeError("No OSU instructors with valid osu.edu usernames were found in official snapshots.")
        include_official_name_history(conn, identities)
        departments, official_ids = official_departments(conn)
        facts_by_user: dict[str, list[tuple[Any, ...]]] = defaultdict(list)
        for fact in course_rows:
            facts_by_user[fact[0]].append(fact)
        for username in identities:
            identities[username]["departments"] = sorted(departments.get(username, set()))
            identities[username]["official_instructor_id"] = official_ids.get(username)
            identities[username]["course_facts"] = facts_by_user[username]

        schools_rows = conn.execute("SELECT legacy_id, campus_code FROM osu_rmp.school").fetchall()
        school_codes = {int(sid): _campus(code) for sid, code in schools_rows}
        professors = dict_rows(conn.execute(
            """SELECT p.legacy_id,p.first_name,p.last_name,p.department,p.course_codes,
                      coalesce(array_agg(DISTINCT ps.school_id) FILTER (WHERE ps.school_id IS NOT NULL),'{}') AS school_ids
               FROM osu_rmp.professor p LEFT JOIN osu_rmp.professor_school ps ON ps.professor_id=p.legacy_id
               WHERE p.active GROUP BY p.legacy_id"""
        ))
        candidates = catalog_candidates(professors, identities, school_codes, departments,
                                        load_department_aliases(conn))
        manual_rows = conn.execute(
            """SELECT m.professor_id,m.name_dot_number,
                      coalesce(array_agg(DISTINCT s.campus_code) FILTER (WHERE s.campus_code IS NOT NULL),'{}')
               FROM osu_rmp.professor_identity_map m
               LEFT JOIN osu_rmp.professor_school ps ON ps.professor_id=m.professor_id
               LEFT JOIN osu_rmp.school s ON s.legacy_id=ps.school_id
               WHERE m.method='manual' AND m.state='accepted'
               GROUP BY m.professor_id,m.name_dot_number"""
        ).fetchall()
        manual_reserved = [{"professor_id": row[0], "username": row[1],
                            "campus_codes": [_campus(code) for code in row[2]]}
                           for row in manual_rows]
        apply_manual_reservations(candidates, manual_reserved)
        _manual_candidates(args, candidates)
        print(f"[mapping] terms={','.join(terms)} identities={len(identities)} profiles={len(professors)} "
              f"exact-name evidence candidates={len(candidates)} accepted={sum(c['state']=='accepted' for c in candidates)}")
        if args.dry_run:
            if args.decisions:
                print("[mapping] dry-run: manual decisions were validated but not saved")
            if args.export_candidates:
                exported = export_candidates(
                    args.export_candidates, candidates, professors, identities
                )
                print(
                    f"[mapping] exported {exported} pending candidates to "
                    f"{args.export_candidates}"
                )
            return 0

        with conn.transaction():
            conn.execute(
                "CREATE TEMP TABLE rmp_identity_stage (username text,display_name text,osu_email text,"
                "official_instructor_id bigint,names jsonb,departments jsonb) ON COMMIT DROP"
            )
            identities_json = [{"username": username, "display_name": item["display_name"], "osu_email": item["email"],
                                "official_instructor_id": item["official_instructor_id"], "names": item["names"],
                                "departments": item["departments"]} for username, item in identities.items()]
            conn.execute(
                """INSERT INTO rmp_identity_stage
                   SELECT x.username,x.display_name,x.osu_email,x.official_instructor_id,x.names,x.departments
                   FROM jsonb_to_recordset(%s::jsonb) x(username text,display_name text,osu_email text,
                     official_instructor_id bigint,names jsonb,departments jsonb)""",
                (json.dumps(identities_json, ensure_ascii=False),),
            )
            conn.execute(
                """INSERT INTO osu_rmp.instructor_identity
                     (name_dot_number,display_name,osu_email,official_instructor_id,names,departments)
                   SELECT username,display_name,osu_email,official_instructor_id,names,departments FROM rmp_identity_stage
                   ON CONFLICT (name_dot_number) DO UPDATE SET display_name=EXCLUDED.display_name,
                     osu_email=EXCLUDED.osu_email,official_instructor_id=coalesce(EXCLUDED.official_instructor_id,
                     osu_rmp.instructor_identity.official_instructor_id),names=EXCLUDED.names,
                     departments=EXCLUDED.departments,updated_at=now()
                   WHERE ROW(osu_rmp.instructor_identity.display_name,osu_rmp.instructor_identity.osu_email,
                     osu_rmp.instructor_identity.official_instructor_id,osu_rmp.instructor_identity.names,
                     osu_rmp.instructor_identity.departments) IS DISTINCT FROM ROW(EXCLUDED.display_name,
                     EXCLUDED.osu_email,coalesce(EXCLUDED.official_instructor_id,
                     osu_rmp.instructor_identity.official_instructor_id),EXCLUDED.names,EXCLUDED.departments)"""
            )
            conn.execute(
                """CREATE TEMP TABLE rmp_course_stage (username text,source text,source_record_key text,
                   campus_code text,course_key text,subject text,catalog_number text,latest_term text) ON COMMIT DROP"""
            )
            if course_rows:
                conn.execute(
                    """INSERT INTO rmp_course_stage
                       SELECT x.username,x.source,x.source_record_key,x.campus_code,x.course_key,x.subject,
                              x.catalog_number,x.latest_term
                       FROM jsonb_to_recordset(%s::jsonb) x(username text,source text,source_record_key text,
                         campus_code text,course_key text,subject text,catalog_number text,latest_term text)""",
                    (json.dumps([{"username": row[0], "source": row[1], "source_record_key": row[2],
                                  "campus_code": row[3], "course_key": row[4], "subject": row[5],
                                  "catalog_number": row[6], "latest_term": row[7]} for row in course_rows]),),
                )
            conn.execute("CREATE INDEX ON rmp_course_stage (username,source,source_record_key)")
            conn.execute("ANALYZE rmp_course_stage")
            conn.execute(
                """CREATE TEMP TABLE rmp_source_term_stage (source text,term text) ON COMMIT DROP"""
            )
            source_terms = ([{"source": "official_catalog", "term": term} for term in catalog_terms]
                            + [{"source": "official_evaluation", "term": term} for term in evaluation_terms])
            if source_terms:
                conn.execute(
                    """INSERT INTO rmp_source_term_stage
                       SELECT x.source,x.term FROM jsonb_to_recordset(%s::jsonb) x(source text,term text)""",
                    (json.dumps(source_terms),),
                )
            conn.execute(
                """UPDATE osu_rmp.instructor_course ic SET active=false
                   WHERE ic.active AND EXISTS (SELECT 1 FROM rmp_source_term_stage st
                     WHERE st.source=ic.source AND st.term=ic.latest_term)
                     AND NOT EXISTS (SELECT 1 FROM rmp_course_stage x WHERE x.username=ic.name_dot_number
                       AND x.source=ic.source AND x.source_record_key=ic.source_record_key)"""
            )
            conn.execute(
                """INSERT INTO osu_rmp.instructor_course
                     (name_dot_number,source,source_record_key,campus_code,course_key,subject,catalog_number,latest_term)
                   SELECT username,source,source_record_key,campus_code,course_key,subject,catalog_number,latest_term
                   FROM rmp_course_stage ON CONFLICT (name_dot_number,source,source_record_key) DO UPDATE SET
                     campus_code=EXCLUDED.campus_code,course_key=EXCLUDED.course_key,subject=EXCLUDED.subject,
                     catalog_number=EXCLUDED.catalog_number,latest_term=EXCLUDED.latest_term,active=true,last_seen_at=now()
                   WHERE NOT osu_rmp.instructor_course.active OR
                     ROW(osu_rmp.instructor_course.campus_code,osu_rmp.instructor_course.course_key,
                       osu_rmp.instructor_course.subject,osu_rmp.instructor_course.catalog_number,
                       osu_rmp.instructor_course.latest_term) IS DISTINCT FROM
                     ROW(EXCLUDED.campus_code,EXCLUDED.course_key,EXCLUDED.subject,
                       EXCLUDED.catalog_number,EXCLUDED.latest_term)"""
            )
            conn.execute("""CREATE TEMP TABLE rmp_candidate_stage (professor_id bigint,username text,state text,
               score integer,evidence jsonb) ON COMMIT DROP""")
            if candidates:
                conn.execute(
                    """INSERT INTO rmp_candidate_stage
                       SELECT x.professor_id,x.username,x.state,x.score,x.evidence
                       FROM jsonb_to_recordset(%s::jsonb) x(professor_id bigint,username text,state text,
                         score integer,evidence jsonb)""",
                    (json.dumps([{"professor_id": c["professor_id"], "username": c["username"], "state": c["state"],
                                  "score": c["score"], "evidence": c["evidence"]} for c in candidates], ensure_ascii=False),),
                )
            fingerprint = refresh_fingerprint(candidates, source_terms)
            refresh_row = conn.execute(
                """INSERT INTO osu_rmp.mapping_refresh
                     (source_terms,candidate_sha256,identity_count,course_fact_count,candidate_count,accepted_count)
                   VALUES (%s::jsonb,%s,%s,%s,%s,%s)
                   ON CONFLICT (candidate_sha256) DO NOTHING RETURNING id""",
                (json.dumps(source_terms), fingerprint, len(identities), len(course_rows),
                 len(candidates), sum(item["state"] == "accepted" for item in candidates)),
            ).fetchone()
            if refresh_row:
                conn.execute(
                    """INSERT INTO osu_rmp.mapping_refresh_item
                         (refresh_id,professor_id,name_dot_number,proposed_state,score,evidence)
                       SELECT %s,professor_id,username,state,score,evidence FROM rmp_candidate_stage""",
                    (refresh_row[0],),
                )
            conn.execute("CREATE INDEX ON rmp_candidate_stage (professor_id,username)")
            conn.execute("ANALYZE rmp_candidate_stage")
            # Release only obsolete accepted pairs before inserting replacements;
            # unchanged records keep their row versions and avoid needless WAL.
            conn.execute("""UPDATE osu_rmp.professor_identity_map m SET state='stale',updated_at=now()
               WHERE m.method='evidence-v1' AND m.state='accepted'
                 AND NOT EXISTS (SELECT 1 FROM rmp_candidate_stage x WHERE x.professor_id=m.professor_id
                   AND x.username=m.name_dot_number AND x.state='accepted')""")
            conn.execute("""UPDATE osu_rmp.professor_identity_map m SET state='stale',updated_at=now()
               WHERE m.method='evidence-v1' AND m.state='candidate'
                 AND NOT EXISTS (SELECT 1 FROM rmp_candidate_stage x WHERE x.professor_id=m.professor_id
                   AND x.username=m.name_dot_number)""")
            conn.execute("""INSERT INTO osu_rmp.professor_identity_map
                 (professor_id,name_dot_number,state,method,score,evidence)
               SELECT professor_id,username,state,'evidence-v1',score,evidence FROM rmp_candidate_stage
               ON CONFLICT (professor_id,name_dot_number) DO UPDATE SET state=EXCLUDED.state,
                 score=EXCLUDED.score,evidence=EXCLUDED.evidence,updated_at=now()
               WHERE osu_rmp.professor_identity_map.method='evidence-v1'
                 AND ROW(osu_rmp.professor_identity_map.state,osu_rmp.professor_identity_map.score,
                   osu_rmp.professor_identity_map.evidence) IS DISTINCT FROM
                   ROW(EXCLUDED.state,EXCLUDED.score,EXCLUDED.evidence)""")
            _write_manual_decisions(conn, args.decisions, args.reason)
            conn.execute("UPDATE osu_rmp.app_migration SET applied_at=now() WHERE version=%s", (SCHEMA_VERSION,))
        print(f"[mapping] saved {len(identities)} identities, {len(course_rows)} recent course facts, {len(candidates)} mapping candidates")
        return 0
    except Exception as exc:
        print(f"[error] {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    finally:
        if locked:
            try:
                conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
            except Exception:
                pass
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
