#!/usr/bin/env python3
"""Reconcile only derived course labels; preserve identities and manual decisions.

Default is a repeatable-read, read-only dry run. Applying requires the exact
plan SHA from a reviewed dry run. Raw RMP data and identity maps are never written.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import re
from pathlib import Path
import sys

if __package__:
    from .matching_data import reference_data, load_professors, review_groups, audit_course_links, save_course_links
    from .sync_rmp_mappings import connect_database, load_dsn, LOCK_ID
else:
    from matching_data import reference_data, load_professors, review_groups, audit_course_links, save_course_links
    from sync_rmp_mappings import connect_database, load_dsn, LOCK_ID


def semantic_diff(existing, proposed):
    before = {(r["professor_id"], r["campus_code"], r["raw_course_token"]): r for r in existing}
    after = {(r["professor_id"], r["campus_code"], r["raw_course_token"]): r for r in proposed}
    changes = []
    for key in sorted(before.keys() | after.keys()):
        old, new = before.get(key), after.get(key)
        old_value = {name: old.get(name) for name in ("state", "course_key", "reason", "candidates")} if old else None
        new_value = {name: new.get(name) for name in ("state", "course_key", "reason", "candidates")} if new else {"state": "stale", "course_key": None}
        if old_value != new_value:
            changes.append({"professor_id": key[0], "campus_code": key[1], "raw_course_token": key[2], "before": old_value, "after": new_value})
    return changes


def plan_fingerprint(records):
    stable = [{**r, "evidence": {k: v for k, v in r["evidence"].items() if k != "before_available"}} for r in records]
    return hashlib.sha256(json.dumps(stable, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def before_fingerprint(records, manual_decisions):
    return hashlib.sha256(json.dumps({"derived_records": records, "manual_decisions": manual_decisions}, sort_keys=True, ensure_ascii=False, default=str).encode()).hexdigest()


def safe_diagnostic(error, stage):
    result = {"stage": stage, "error_type": type(error).__name__}
    if isinstance(error, RuntimeError):
        result["message"] = str(error)
    if getattr(error, "sqlstate", None):
        result["sqlstate"] = error.sqlstate
    diag = getattr(error, "diag", None)
    for field in ("schema_name", "table_name", "constraint_name", "column_name", "statement_position"):
        if diag and (value := getattr(diag, field, None)):
            result[field] = value
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, help="Full JSON plan/diff destination")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-plan-sha256")
    parser.add_argument("--expected-before-sha256")
    args = parser.parse_args(argv)
    if args.apply and any(not value or not re.fullmatch(r"[a-f0-9]{64}", value) for value in (args.expected_plan_sha256, args.expected_before_sha256)):
        parser.error("--apply requires the reviewed --expected-plan-sha256 and --expected-before-sha256")
    conn = None
    stage, commit_attempted, committed = "connect", False, False
    try:
        conn = connect_database(load_dsn(None))
        conn.execute("SET statement_timeout='90s'")
        if not conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[0]:
            raise RuntimeError("A mapping refresh or administrator decision is running")
        conn.execute("BEGIN ISOLATION LEVEL REPEATABLE READ" + ("" if args.apply else " READ ONLY"))
        conn.execute("SET LOCAL idle_in_transaction_session_timeout='2min'")
        stage = "read-source-and-official-evidence"
        professors = load_professors(conn)
        reviews = review_groups(conn)
        course_rows = conn.execute("SELECT name_dot_number,source,source_record_key,campus_code,course_key,subject,catalog_number,latest_term FROM osu_rmp.instructor_course WHERE active ORDER BY name_dot_number,source,source_record_key").fetchall()
        identities = defaultdict(lambda: {"course_facts": []})
        for fact in course_rows:
            identities[fact[0]]["course_facts"].append(fact)
        schools = dict(conn.execute("SELECT legacy_id,campus_code FROM osu_rmp.school").fetchall())
        existing_identities = conn.execute("SELECT professor_id,name_dot_number,state,method FROM osu_rmp.professor_identity_map").fetchall()
        candidates = []
        for pid, username, state, method, evidence in conn.execute("SELECT professor_id,name_dot_number,state,method,evidence FROM osu_rmp.professor_identity_map WHERE state='accepted'"):
            candidates.append({"professor_id": pid, "username": username, "state": state, "campus_codes": evidence.get("campus_codes", []) if method != "manual" else sorted(set(schools.values()))})
        lexicon, inventory = reference_data(conn, course_rows)
        records, summary = audit_course_links(professors, reviews, candidates, dict(identities), schools, inventory, lexicon, existing_identities)
        old_rows = conn.execute("SELECT professor_id,campus_code,raw_course_token,course_key,state,reason,candidates,evidence FROM osu_rmp.course_identity_match ORDER BY professor_id,campus_code,raw_course_token").fetchall()
        columns = ("professor_id", "campus_code", "raw_course_token", "course_key", "state", "reason", "candidates", "evidence")
        before_records = [dict(zip(columns, row)) for row in old_rows]
        has_decisions = conn.execute("SELECT to_regclass('osu_rmp.course_decision') IS NOT NULL").fetchone()[0]
        manual_decisions = [row[0] for row in conn.execute("SELECT to_jsonb(d) FROM osu_rmp.course_decision d ORDER BY professor_id,campus_code,raw_course_token").fetchall()] if has_decisions else []
        before_sha = before_fingerprint(before_records, manual_decisions)
        changes = semantic_diff(before_records, records)
        fingerprint = plan_fingerprint(records)
        transitions = Counter((c["before"] or {}).get("state", "new") + "→" + c["after"]["state"] for c in changes)
        report = {"read_only": not args.apply, "plan_sha256": fingerprint, "before_sha256": before_sha, "summary": summary,
                  "transitions": dict(sorted(transitions.items())), "changes": changes,
                  "identity_changes": 0, "source_changes": 0, "manual_decision_changes": 0,
                  "proposed_records": records}
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        stage = "persist-plan-before-write"
        if args.apply:
            if fingerprint != args.expected_plan_sha256 or before_sha != args.expected_before_sha256:
                raise RuntimeError("Plan, existing course rows or manual decisions changed since review; generate a new dry run")
            backup = {"before_sha256": before_sha, "plan_sha256": fingerprint, "derived_records": before_records, "manual_decisions": manual_decisions}
            Path(str(destination) + ".before.json").write_text(json.dumps(backup, sort_keys=True, ensure_ascii=False, default=str), encoding="utf-8")
        report["status"] = "prepared" if args.apply else "dry-run"
        destination.write_text(json.dumps(report, sort_keys=True, ensure_ascii=False, default=str), encoding="utf-8")
        if args.apply:
            stage = "save-derived-course-links"
            save_course_links(conn, records, summary)
        stage, commit_attempted = "commit", True
        conn.execute("COMMIT")
        committed = True
        report["status"] = "committed" if args.apply else "dry-run"
        stage = "persist-receipt-after-commit"
        if args.apply:
            Path(str(destination) + ".receipt.json").write_text(json.dumps({k: v for k, v in report.items() if k not in ("changes", "proposed_records", "summary")}, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({k: v for k, v in report.items() if k not in ("changes", "proposed_records", "summary")}, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:
        outcome = "committed-receipt-failed" if committed else "commit-outcome-unknown" if commit_attempted else "rolled-back"
        if conn and not commit_attempted:
            try: conn.execute("ROLLBACK")
            except Exception: outcome = "transaction-aborted-connection-unavailable"
        print(json.dumps({"outcome": outcome, "diagnostic": safe_diagnostic(exc, stage)}, sort_keys=True), file=sys.stderr)
        return 2
    finally:
        if conn:
            conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
