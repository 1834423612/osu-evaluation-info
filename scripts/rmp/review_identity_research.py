#!/usr/bin/env python3
"""Persist reproducible source-assisted identity decisions without merging RMP profiles."""

import argparse
import base64
from collections import defaultdict, Counter
import hashlib
import json
from pathlib import Path
import sys
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).parent))
from sync_rmp_mappings import connect_database, load_dsn, LOCK_ID
from matching_data import (
    load_professors,
    review_groups,
    reference_data,
    execute_json_batches,
)
from identity_research import (
    evaluate_profile,
    fold,
    compatible_name_index,
    compatible_official_users,
)
from mapping_coverage import stored_profile_coverage


def safe_json_value(value):
    """Keep provider control characters from aborting an otherwise valid JSONB audit."""
    if isinstance(value, str):
        return re.sub(r"[\x00\ud800-\udfff]", "\ufffd", value)
    if isinstance(value, list):
        return [safe_json_value(item) for item in value]
    if isinstance(value, dict):
        return {
            safe_json_value(key): safe_json_value(item) for key, item in value.items()
        }
    return value


def decode_verified_payload(encoded, digest):
    try:
        decoded = base64.b64decode(encoded)
        if hashlib.sha256(decoded).hexdigest() != digest:
            raise ValueError("Payload hash mismatch")
        return decoded
    except Exception as error:
        raise ValueError(
            "Stored source observation failed integrity validation"
        ) from error


def read_observation_payload(conn, pid, key, encoded, digest):
    """Never repair truncated JSON/base64; reread the same immutable observation."""
    try:
        return decode_verified_payload(encoded, digest)
    except ValueError:
        pass
    encoded, expected, size = conn.execute(
        """SELECT encode(convert_to(data::text,'UTF8'),'base64'),
      encode(sha256(convert_to(data::text,'UTF8')),'hex'),octet_length(data::text)
      FROM osu_rmp.identity_research_observation WHERE professor_id=%s AND evidence_sha256=%s""",
        (pid, key),
    ).fetchone()
    if expected != digest:
        raise RuntimeError("Source observation changed during replay")
    try:
        return decode_verified_payload(encoded, digest)
    except ValueError:
        pass
    fragments = []
    for offset in range(1, size + 1, 3000):
        part = conn.execute(
            """SELECT encode(substring(convert_to(data::text,'UTF8') FROM %s FOR 3000),'base64')
          FROM osu_rmp.identity_research_observation WHERE professor_id=%s AND evidence_sha256=%s""",
            (offset, pid, key),
        ).fetchone()[0]
        try:
            fragments.append(base64.b64decode(part))
        except Exception as error:
            raise RuntimeError("A source evidence fragment is incomplete") from error
    decoded = b"".join(fragments)
    if len(decoded) != size or hashlib.sha256(decoded).hexdigest() != digest:
        raise RuntimeError("Source evidence fragments failed integrity validation")
    return decoded


def stored_observations():
    """Rebuild an audit on another machine from its saved server-side evidence."""
    conn = connect_database(load_dsn(None))
    result = {}
    after = 0
    try:
        conn.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        while True:
            rows = conn.execute(
                """WITH chosen AS (
              SELECT DISTINCT professor_id FROM osu_rmp.identity_research_observation
              WHERE professor_id>%s ORDER BY professor_id LIMIT 10)
              SELECT p.professor_id,o.evidence_sha256,encode(convert_to(o.data::text,'UTF8'),'base64'),
                encode(sha256(convert_to(o.data::text,'UTF8')),'hex')
              FROM chosen p CROSS JOIN LATERAL (SELECT evidence_sha256,data FROM osu_rmp.identity_research_observation
                WHERE professor_id=p.professor_id ORDER BY last_checked_at DESC,evidence_sha256 DESC LIMIT 1) o
              ORDER BY p.professor_id""",
                (after,),
            ).fetchall()
            if not rows:
                break
            for pid, key, encoded, digest in rows:
                decoded = read_observation_payload(conn, pid, key, encoded, digest)
                result[pid] = json.loads(decoded)
            after = rows[-1][0]
        conn.execute("COMMIT")
        return result
    finally:
        conn.close()


def merge_observation(observations, pid, item):
    if pid not in observations:
        observations[pid] = {**item, "sources": [item]}
    else:
        existing = observations[pid]
        existing["sources"].append(item)
    existing = observations[pid]
    existing["status"] = (
        "available"
        if any(s["status"] == "available" for s in existing["sources"])
        else "unavailable"
    )
    existing["candidates"] = [
        {
            **p,
            "observed_at": source.get("checked_at", ""),
            "source_provider": source.get("source"),
        }
        for source in existing["sources"]
        for p in source["candidates"]
    ]
    existing["possibly_truncated"] = any(
        s.get("possibly_truncated") for s in existing["sources"]
    )


def withdraw_changed_tool_links(conn):
    """Recheck our own decisions while preserving every human-reviewed override."""
    withdrawn = conn.execute("""
      UPDATE osu_rmp.professor_identity_map m SET state='stale',method='evidence-v1',score=0,
        evidence=s.evidence||jsonb_build_object('research_review_required',true),updated_at=now()
      FROM identity_research_stage s
      WHERE m.professor_id=s.professor_id AND m.state='accepted' AND m.method='manual'
        AND m.evidence->>'reviewer'='source-assisted-research-v1' AND s.state<>'reserved'
        AND (s.state<>'confirmed' OR s.username IS DISTINCT FROM m.name_dot_number)
      RETURNING m.professor_id,m.name_dot_number
    """).fetchall()
    for pid, user in withdrawn:
        conn.execute(
            """INSERT INTO osu_rmp.mapping_decision_log
          (professor_id,name_dot_number,previous_state,new_state,reason,decided_by)
          VALUES(%s,%s,'accepted','stale','Additional official evidence requires renewed identity review','source-assisted-research-v1')""",
            (pid, user),
        )
    return withdrawn


def run(args):
    observations = stored_observations() if args.from_database else {}
    for journal in args.journal or (
        [] if args.from_database else ["data/local/rmp/identity-directory-scan.jsonl"]
    ):
        for line in Path(journal).read_text().splitlines():
            item = json.loads(line)
            if item.get("cache_saved"):
                merge_observation(observations, int(item["professor_id"]), item)
    if args.web_journal:
        web = []
        for line in Path(args.web_journal).read_text().splitlines():
            item = json.loads(line)
            if item.get("parser_version") == 2:
                web.append(item)
        for item in web:
            url = item["url"]
            by_profile = defaultdict(list)
            for row in item["records"]:
                by_profile[int(row["professor_id"])].append(row["person"])
            for pid in item["profiles"]:
                merge_observation(
                    observations,
                    int(pid),
                    {
                        "professor_id": str(pid),
                        "source": "official-department-profile",
                        "source_url": url,
                        "query": url,
                        "status": (
                            "available"
                            if item["status"] == "available"
                            else "unavailable"
                        ),
                        "candidates": by_profile[int(pid)],
                        "checked_at": item["checked_at"],
                    },
                )
    if args.web_index:
        for path in Path(args.web_index).glob("*.json"):
            for batch in json.loads(path.read_text()):
                for pid in batch["profiles"]:
                    if pid in observations:
                        observations[pid].setdefault("web_search_batches", []).append(
                            batch
                        )
    if args.pdf_journal:
        from research_pdf_profiles import clean_organization

        for line in Path(args.pdf_journal).read_text().splitlines():
            item = json.loads(line)
            if item.get("parser_version") not in ("pdf-contact-v1", "pdf-contact-v2"):
                continue
            if item.get("parser_version") == "pdf-contact-v1" and item["records"]:
                continue
            by_profile = defaultdict(list)
            for row in item["records"]:
                person = row["person"]
                person["context_organizations"] = [
                    clean_organization(org)
                    for org in person.get("context_organizations", [])
                ]
                for job in person.get("appointments", []):
                    job["organization"] = clean_organization(job.get("organization"))
                by_profile[int(row["professor_id"])].append(person)
            for pid in item["profiles"]:
                merge_observation(
                    observations,
                    int(pid),
                    {
                        "professor_id": str(pid),
                        "source": "official-pdf",
                        "source_url": item["url"],
                        "query": item["url"],
                        "document_sha256": item.get("sha256"),
                        "status": (
                            "available"
                            if item["status"] in ("available", "partial")
                            else "unavailable"
                        ),
                        "source_status": item["status"],
                        "candidates": by_profile[int(pid)],
                        "checked_at": item["checked_at"],
                    },
                )
    conn = connect_database(load_dsn(None))
    locked = False
    try:
        if args.install_schema:
            conn.execute((ROOT / "db/schemas/rmp-identity-research.sql").read_text())
        locked = conn.execute("SELECT pg_try_advisory_lock(%s)", (LOCK_ID,)).fetchone()[
            0
        ]
        if not locked:
            raise RuntimeError("Another RMP reconciliation is running")
        profiles = load_professors(conn)
        by_id = {p["legacy_id"]: p for p in profiles}
        for pid, code, _count in review_groups(conn):
            by_id[pid].setdefault("review_codes", []).append(code or "")
        schools = dict(conn.execute("SELECT legacy_id,campus_code FROM osu_rmp.school"))
        for p in profiles:
            p["campuses"] = [schools[s] for s in p["school_ids"] if s in schools]
        identities = {}
        exact = defaultdict(set)
        after = ""
        while True:
            batch = conn.execute(
                """SELECT name_dot_number,encode(convert_to(jsonb_build_object('names',names,'departments',departments)::text,'UTF8'),'base64')
              FROM osu_rmp.instructor_identity WHERE name_dot_number>%s ORDER BY name_dot_number LIMIT 200""",
                (after,),
            ).fetchall()
            if not batch:
                break
            for user, encoded in batch:
                item = json.loads(base64.b64decode(encoded))
                identities[user] = item
                for name in item["names"]:
                    exact[fold(name)].add(user)
            after = batch[-1][0]
        facts = defaultdict(list)
        course_rows = []
        after = ("", "", "")
        while True:
            batch = conn.execute(
                """SELECT DISTINCT name_dot_number,campus_code,course_key,subject,catalog_number
              FROM osu_rmp.instructor_course WHERE (name_dot_number,campus_code,course_key)>(%s,%s,%s)
              ORDER BY name_dot_number,campus_code,course_key LIMIT 1000""",
                after,
            ).fetchall()
            if not batch:
                break
            for user, campus, key, subject, number in batch:
                facts[user].append((campus, key, subject))
                course_rows.append(
                    (user, "official_catalog", "", campus, key, subject, number, "")
                )
            after = batch[-1][:3]
        lexicon, _inventory = reference_data(conn, course_rows)
        family_names = compatible_name_index(identities)
        results = []
        reserved = defaultdict(list)
        for pid, user, state, owned in conn.execute(
            """SELECT professor_id,name_dot_number,state,
                coalesce(evidence->>'reviewer','')='source-assisted-research-v1'
                FROM osu_rmp.professor_identity_map WHERE method='manual'"""
        ):
            if not owned:
                reserved[pid].append((user, state))
        for pid, observation in observations.items():
            p = by_id.get(pid)
            if not p:
                continue
            result = evaluate_profile(
                p,
                observation,
                identities,
                facts,
                lexicon,
                exact[fold(p["first_name"] + " " + p["last_name"])]
                | compatible_official_users(p, family_names),
            )
            if pid in reserved and reserved[pid] != [(result["username"], "accepted")]:
                result.update(
                    state="reserved",
                    username=None,
                    reason="existing_reviewed_decision_preserved",
                )
            results.append(result)
        results = safe_json_value(results)
        summary = {
            "scanned_profiles": len(results),
            "outcomes": dict(Counter(r["state"] for r in results)),
            "reasons": dict(Counter(r["reason"] for r in results)),
        }
        summary["decision_sha256"] = hashlib.sha256(
            json.dumps(
                sorted(
                    (
                        r["professor_id"],
                        r["state"],
                        r["username"],
                        r["reason"],
                        r["classification"],
                    )
                    for r in results
                ),
                sort_keys=True,
                ensure_ascii=False,
            ).encode()
        ).hexdigest()
        if args.apply:
            with conn.transaction():
                conn.execute(
                    "CREATE TEMP TABLE identity_research_stage(professor_id bigint,state text,username text,reason text,classification jsonb,evidence jsonb) ON COMMIT DROP"
                )
                execute_json_batches(
                    conn,
                    """INSERT INTO identity_research_stage SELECT x.* FROM jsonb_to_recordset(%s::jsonb)
                  x(professor_id bigint,state text,username text,reason text,classification jsonb,evidence jsonb)""",
                    results,
                    batch_size=100,
                )
                conn.execute(
                    """INSERT INTO osu_rmp.identity_research_result(professor_id,state,name_dot_number,reason,classification,evidence)
                  SELECT professor_id,state,username,reason,classification,evidence FROM identity_research_stage
                  ON CONFLICT(professor_id) DO UPDATE SET state=excluded.state,name_dot_number=excluded.name_dot_number,
                    reason=excluded.reason,classification=excluded.classification,evidence=excluded.evidence,reviewed_at=now()
                  WHERE excluded.state<>'reserved' """
                )
                observations_rows = []
                for pid, item in observations.items():
                    payload = safe_json_value(
                        {
                            k: v
                            for k, v in item.items()
                            if k not in ("checked_at", "cache_saved")
                        }
                    )
                    encoded = json.dumps(payload, sort_keys=True, ensure_ascii=False)
                    observations_rows.append(
                        {
                            "professor_id": pid,
                            "hash": hashlib.sha256(encoded.encode()).hexdigest(),
                            "source": "official-directory-research",
                            "url": "https://www.osu.edu/search/?q="
                            + item["query"].replace(" ", "%20"),
                            "data": payload,
                        }
                    )
                execute_json_batches(
                    conn,
                    """INSERT INTO osu_rmp.identity_research_observation(professor_id,evidence_sha256,source,source_url,data)
                  SELECT x.professor_id,x.hash,x.source,x.url,x.data FROM jsonb_to_recordset(%s::jsonb)
                    x(professor_id bigint,hash text,source text,url text,data jsonb)
                  ON CONFLICT(professor_id,evidence_sha256) DO UPDATE SET last_checked_at=now()""",
                    observations_rows,
                    batch_size=50,
                )
                # Cache only explicit appointments from the contact-checked official pages.
                cached_web = {}
                for item in observations.values():
                    for source in item.get("sources", []):
                        if source.get("source") != "official-department-profile":
                            continue
                        for person in source.get("candidates", []):
                            url = person.get("source_url", "")
                            parsed = urlsplit(url)
                            if (
                                parsed.scheme != "https"
                                or parsed.username
                                or parsed.password
                                or parsed.port
                                or parsed.query
                                or parsed.fragment
                            ):
                                continue
                            if not (
                                parsed.hostname
                                and (
                                    parsed.hostname.endswith(".osu.edu")
                                    or parsed.hostname.endswith(".ohio-state.edu")
                                )
                            ):
                                continue
                            if not person.get("appointments"):
                                continue
                            cached_web[person["user"]] = {
                                "username": person["user"],
                                "name": person["name"],
                                "roles": person["roles"],
                                "appointments": person["appointments"],
                                "url": url,
                                "checked": source["checked_at"],
                            }
                execute_json_batches(
                    conn,
                    """INSERT INTO osu_directory.person_cache
                    (name_dot_number,display_name,roles,appointments,source,source_url,verified_at,cache_version)
                  SELECT x.username,x.name,x.roles,x.appointments,'department-profile',x.url,x.checked,3
                  FROM jsonb_to_recordset(%s::jsonb) x(username text,name text,roles jsonb,appointments jsonb,url text,checked timestamptz)
                  ON CONFLICT(name_dot_number) DO UPDATE SET display_name=excluded.display_name,roles=excluded.roles,
                    appointments=excluded.appointments,source=excluded.source,source_url=excluded.source_url,
                    verified_at=excluded.verified_at,cache_version=3,updated_at=now()
                  WHERE jsonb_array_length(osu_directory.person_cache.appointments)=0""",
                    list(cached_web.values()),
                    batch_size=100,
                )
                # Research can confirm an identity absent from recent teaching terms.
                conn.execute(
                    """INSERT INTO osu_rmp.instructor_identity(name_dot_number,display_name,osu_email,names,departments)
                  SELECT DISTINCT ON(s.username) s.username,c->'person'->>'name',s.username||'@osu.edu',
                    jsonb_build_array(c->'person'->>'name'),'[]'::jsonb
                  FROM identity_research_stage s CROSS JOIN LATERAL jsonb_array_elements(s.evidence->'candidates') c
                  WHERE s.state='confirmed' AND c->>'user'=s.username AND c->'person'->>'name' IS NOT NULL
                  ON CONFLICT(name_dot_number) DO NOTHING"""
                )
                # Preserve all existing accepted/rejected decisions and distinct source profiles.
                summary["withdrawn_tool_links"] = len(withdraw_changed_tool_links(conn))
                applied = conn.execute(
                    """INSERT INTO osu_rmp.professor_identity_map(professor_id,name_dot_number,state,method,score,evidence)
                  SELECT s.professor_id,s.username,'accepted','manual',100,
                    s.evidence||jsonb_build_object('review_reason',s.reason,'reviewer','source-assisted-research-v1')
                  FROM identity_research_stage s WHERE s.state='confirmed' AND NOT EXISTS(
                    SELECT 1 FROM osu_rmp.professor_identity_map old WHERE old.professor_id=s.professor_id AND (old.state='accepted' OR old.method='manual'))
                  ON CONFLICT(professor_id,name_dot_number) DO UPDATE SET state='accepted',method='manual',score=100,evidence=excluded.evidence,updated_at=now()
                  WHERE osu_rmp.professor_identity_map.method<>'manual' AND osu_rmp.professor_identity_map.state<>'accepted'
                  RETURNING professor_id,name_dot_number"""
                ).fetchall()
                for pid, user in applied:
                    conn.execute(
                        """INSERT INTO osu_rmp.mapping_decision_log(professor_id,name_dot_number,new_state,reason,decided_by)
                      VALUES(%s,%s,'accepted','Official-source-assisted identity review; see identity_research_result evidence','source-assisted-research-v1')""",
                        (pid, user),
                    )
                summary["newly_linked"] = len(applied)
            summary["coverage"] = stored_profile_coverage(conn)
        destination = Path(args.report)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(
                {"summary": summary, "results": results}, ensure_ascii=False, indent=2
            )
        )
        print(json.dumps(summary, ensure_ascii=False, indent=2))
    finally:
        if locked:
            conn.execute("SELECT pg_advisory_unlock(%s)", (LOCK_ID,))
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--journal", action="append")
    parser.add_argument("--from-database", action="store_true")
    parser.add_argument(
        "--report", default="data/local/rmp/identity-research-report.json"
    )
    parser.add_argument("--web-journal")
    parser.add_argument("--web-index")
    parser.add_argument("--pdf-journal")
    parser.add_argument("--install-schema", action="store_true")
    parser.add_argument("--apply", action="store_true")
    run(parser.parse_args())
