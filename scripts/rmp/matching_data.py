"""Load authoritative reference data and audit every active RMP course label."""

from __future__ import annotations

from collections import Counter, defaultdict
import hashlib
import json
import base64

if __package__:
    from .course_matching import VERSION, SubjectLexicon, course_parts, course_token, resolve_course
    from .mapping_coverage import summarize_profile_coverage
else:
    from course_matching import VERSION, SubjectLexicon, course_parts, course_token, resolve_course
    from mapping_coverage import summarize_profile_coverage


def reference_data(conn, course_rows):
    labels = set(conn.execute("SELECT code,code FROM osu_eval.subject").fetchall()) if conn.execute(
        "SELECT to_regclass('osu_eval.subject') IS NOT NULL"
    ).fetchone()[0] else set()
    # Read only the newest complete published generation for each term. An
    # unfinished refresh must never supply a partial course/subject universe.
    rows = []
    has_catalog = conn.execute("SELECT to_regclass('osu_catalog.snapshot_versions') IS NOT NULL").fetchone()[0]
    selected = conn.execute("""
          SELECT DISTINCT ON (term.code) term.code,v.run_id
          FROM osu_catalog.snapshot_versions v JOIN osu_catalog.sync_runs r ON r.id=v.run_id
          CROSS JOIN LATERAL jsonb_array_elements_text(r.terms) term(code)
          WHERE v.published_at IS NOT NULL AND r.status='complete'
          ORDER BY term.code,v.published_at DESC
        """).fetchall() if has_catalog else []
    for term, run_id in selected:
        after = ("", "", "")
        while True:
            batch = conn.execute("""SELECT c.course_id,c.offering_number,c.campus_code,
                c.subject,c.catalog_number,coalesce(c.data->>'subjectDesc','')
                FROM osu_catalog.course_snapshots c
                WHERE c.last_seen_run=%s::uuid AND c.term_code=%s
                  AND (c.course_id,c.offering_number,c.campus_code)>(%s,%s,%s)
                ORDER BY c.course_id,c.offering_number,c.campus_code LIMIT 1000""",
                (str(run_id), term, *after)).fetchall()
            if not batch:
                break
            next_key = batch[-1][:3]
            if next_key == after:
                raise RuntimeError("Official reference pagination did not advance")
            after = next_key
            rows.extend((campus, subject, catalog, label) for _cid, _offer, campus, subject, catalog, label in batch)
    inventory = defaultdict(set)
    for campus, subject, catalog, label in rows:
        labels.add((subject, label or subject))
        inventory[campus].add(course_token(subject + catalog))
    for row in course_rows:
        inventory[row[3]].add(row[4])
        labels.add((row[5], row[5]))
    return SubjectLexicon(labels), dict(inventory)


def review_groups(conn):
    rows = []
    ids = [row[0] for row in conn.execute("SELECT legacy_id FROM osu_rmp.professor WHERE active ORDER BY legacy_id")]
    for start in range(0, len(ids), 250):
        rows.extend(conn.execute("""SELECT r.professor_id,r.class_name,count(*)::int
            FROM osu_rmp.review r WHERE r.active AND r.professor_id=ANY(%s)
            GROUP BY r.professor_id,r.class_name ORDER BY r.professor_id,r.class_name""", (ids[start:start + 250],)).fetchall())
    return rows


def load_professors(conn):
    """Bound JSON transfer and verify payload integrity before making decisions."""
    result, after = [], 0
    while True:
        rows = conn.execute("""SELECT p.legacy_id,p.first_name,p.last_name,p.department,
            encode(convert_to(p.course_codes::text,'UTF8'),'base64'),
            encode(sha256(convert_to(p.course_codes::text,'UTF8')),'hex'),
            ARRAY(SELECT DISTINCT ps.school_id FROM osu_rmp.professor_school ps WHERE ps.professor_id=p.legacy_id)
            FROM osu_rmp.professor p WHERE p.active AND p.legacy_id>%s ORDER BY p.legacy_id LIMIT 250""", (after,)).fetchall()
        if not rows:
            return result
        for pid, first, last, department, encoded, digest, schools in rows:
            decoded = base64.b64decode(encoded)
            if hashlib.sha256(decoded).hexdigest() != digest:
                raise ValueError("RMP profile course payload failed its integrity check")
            codes = json.loads(decoded)
            if not isinstance(codes, list):
                raise ValueError("RMP profile course payload must be an array")
            result.append({"legacy_id": pid, "first_name": first, "last_name": last,
                           "department": department, "course_codes": codes, "school_ids": schools})
        next_id = rows[-1][0]
        if next_id <= after:
            raise RuntimeError("RMP profile pagination did not advance")
        after = next_id


def audit_course_links(professors, reviews, candidates, identities, schools, inventory, lexicon, existing, decisions=()):
    proposed = {item["professor_id"]: item["username"] for item in candidates if item["state"] == "accepted"}
    # Reviewed decisions have priority, including accepted links outside the
    # current automatic evidence set. Rejected profiles are not auto-approved.
    reviewed = list(existing)
    for pid, user, state in decisions:
        reviewed = [row for row in reviewed if (row[0], row[1]) != (pid, user)
                    and not (state == "accepted" and row[0] == pid and row[2] == "accepted")]
        reviewed.append((pid, user, state, "manual"))
    manual_profiles = {item[0] for item in reviewed if item[3] == "manual" and item[2] == "accepted"}
    proposed = {key: value for key, value in proposed.items() if key not in manual_profiles}
    for professor, username, state, method in reviewed:
        if method == "manual" and state == "accepted":
            proposed[professor] = username
    before = {item[0]: item[1] for item in existing if item[2] == "accepted"}
    candidate_profiles = {item["professor_id"] for item in candidates}
    profile_index = {int(p["legacy_id"]): p for p in professors}
    accepted_scopes = {item["professor_id"]: set(item["campus_codes"])
                       for item in candidates if item["state"] == "accepted"}
    rejected_pairs = {(pid, user) for pid, user, state, method in reviewed
                      if state == "rejected" and method == "manual"}
    pending_profiles = {item["professor_id"] for item in candidates
                        if (item["professor_id"], item["username"]) not in rejected_pairs}
    rejected_profiles = {pid for pid, _user in rejected_pairs}
    profile_rows = []
    for pid, profile in profile_index.items():
        campuses = {schools[sid] for sid in profile["school_ids"] if sid in schools} or {None}
        for campus in campuses:
            accepted = [proposed[pid]] if pid in proposed and campus and (
                pid in manual_profiles or campus in accepted_scopes.get(pid, set())
            ) else []
            profile_rows.append((pid, campus, accepted, pid in pending_profiles or pid in proposed,
                                 pid in rejected_profiles))
    profile_coverage = summarize_profile_coverage(profile_rows, set(schools.values()))
    raw = defaultdict(lambda: {"names": set(), "reviews": 0})
    for professor, name, count in reviews:
        item = raw[int(professor), course_token(name)]
        item["names"].add(name or "")
        item["reviews"] += count
    for profile in professors:
        for entry in profile.get("course_codes", []):
            name = entry.get("courseName") if isinstance(entry, dict) else None
            if name:
                raw[int(profile["legacy_id"]), course_token(name)]["names"].add(name)
    states, reasons, identity_states = Counter(), Counter(), Counter()
    campus_stats = defaultdict(Counter)
    records, outcomes = [], defaultdict(set)
    for (professor, token), source in sorted(raw.items()):
        profile = profile_index[professor]
        campuses = sorted({schools[sid] for sid in profile["school_ids"] if sid in schools})
        username = proposed.get(professor)
        identity_state = "accepted" if username else "candidate" if professor in candidate_profiles else "missing_identity"
        identity_states[identity_state] += source["reviews"]
        if not campuses:
            outcomes[professor, token].add("missing_campus")
        for campus in campuses:
            taught = {fact[4] for fact in identities.get(username, {}).get("course_facts", []) if fact[3] == campus}
            resolved = resolve_course(token, inventory.get(campus, set()), lexicon,
                                      department=profile.get("department") or "", taught=taught)
            result_state = identity_state if identity_state != "accepted" else resolved["reason"]
            outcomes[professor, token].add("available" if username and resolved["state"] == "accepted" else result_state)
            parsed = course_parts(token)
            before_available = bool(professor in before and parsed and parsed[0] in lexicon.codes
                                    and token in inventory.get(campus, set()))
            stats = campus_stats[campus]
            stats["source_labels"] += 1
            stats["before_reviews"] += source["reviews"] if before_available else 0
            stats["after_reviews"] += source["reviews"] if username and resolved["state"] == "accepted" else 0
            states[resolved["state"]] += 1
            reasons[resolved["reason"]] += source["reviews"]
            records.append({
                "professor_id": professor, "campus_code": campus, "raw_course_token": token,
                **resolved,
                "evidence": {
                    "version": VERSION, "raw_values": sorted(source["names"]),
                    "review_count": source["reviews"], "identity_state": identity_state,
                    "username": username, "department": profile.get("department"),
                    "taught_course_support": resolved["course_key"] in taught,
                    "before_available": before_available,
                },
            })
    coverage = Counter()
    for key, source in raw.items():
        values = outcomes[key]
        # Count source reviews once even when a profile has multiple school links.
        category = "available" if "available" in values else "identity_pending" if (
            "candidate" in values or "missing_identity" in values
        ) else sorted(values)[0] if values else "missing_campus"
        coverage[category] += source["reviews"]
    summary = {
        "version": VERSION, "profiles": len(professors), "active_reviews": sum(row[2] for row in reviews),
        "profile_coverage": profile_coverage,
        "profile_course_labels": len(raw), "campus_course_records": len(records),
        "course_states": dict(states), "course_reasons_review_weighted_by_campus": dict(reasons),
        "identity_review_coverage": dict(identity_states), "end_to_end_review_coverage": dict(coverage),
        "campuses": {campus: dict(stats) for campus, stats in sorted(campus_stats.items())},
    }
    return records, summary


def execute_json_batches(conn, sql, records, batch_size=500):
    for offset in range(0, len(records), batch_size):
        conn.execute(sql, (json.dumps(records[offset:offset + batch_size], ensure_ascii=False),))


def save_course_links(conn, records, summary):
    """Refresh only derived rows in the caller's atomic mapping transaction."""
    stable = [{**row, "evidence": {key: value for key, value in row["evidence"].items()
                                  if key != "before_available"}} for row in records]
    payload = json.dumps(stable, sort_keys=True, ensure_ascii=False)
    conn.execute("""CREATE TEMP TABLE rmp_course_link_stage ON COMMIT DROP AS
        SELECT * FROM osu_rmp.course_identity_match WITH NO DATA""")
    execute_json_batches(conn, """INSERT INTO rmp_course_link_stage
        (professor_id,campus_code,raw_course_token,course_key,state,reason,candidates,evidence)
        SELECT professor_id,campus_code,raw_course_token,course_key,state,reason,candidates,evidence
        FROM jsonb_populate_recordset(NULL::osu_rmp.course_identity_match,%s::jsonb)""", stable)
    conn.execute("CREATE UNIQUE INDEX ON rmp_course_link_stage(professor_id,campus_code,raw_course_token)")
    conn.execute("ANALYZE rmp_course_link_stage")
    conn.execute("""UPDATE osu_rmp.course_identity_match m SET state='stale',course_key=NULL,updated_at=now()
        WHERE state<>'stale' AND NOT EXISTS (SELECT 1 FROM rmp_course_link_stage s
          WHERE (s.professor_id,s.campus_code,s.raw_course_token)=(m.professor_id,m.campus_code,m.raw_course_token))""")
    conn.execute("""INSERT INTO osu_rmp.course_identity_match
        (professor_id,campus_code,raw_course_token,course_key,state,reason,candidates,evidence)
        SELECT professor_id,campus_code,raw_course_token,course_key,state,reason,candidates,evidence
        FROM rmp_course_link_stage
        ON CONFLICT(professor_id,campus_code,raw_course_token) DO UPDATE SET
          course_key=EXCLUDED.course_key,state=EXCLUDED.state,reason=EXCLUDED.reason,
          candidates=EXCLUDED.candidates,evidence=EXCLUDED.evidence,updated_at=now()
        WHERE (osu_rmp.course_identity_match.course_key,osu_rmp.course_identity_match.state,
               osu_rmp.course_identity_match.reason,osu_rmp.course_identity_match.candidates,
               osu_rmp.course_identity_match.evidence) IS DISTINCT FROM
              (EXCLUDED.course_key,EXCLUDED.state,EXCLUDED.reason,EXCLUDED.candidates,EXCLUDED.evidence)""")
    conn.execute("""INSERT INTO osu_rmp.course_matching_refresh(evidence_sha256,summary)
        VALUES(%s,%s::jsonb) ON CONFLICT DO NOTHING""",
        (hashlib.sha256(payload.encode()).hexdigest(), json.dumps(summary)))
    mismatches = conn.execute("""SELECT count(*) FROM rmp_course_link_stage s
        LEFT JOIN osu_rmp.course_identity_match m USING(professor_id,campus_code,raw_course_token)
        WHERE (s.course_key,s.state,s.reason,s.candidates,s.evidence) IS DISTINCT FROM
              (m.course_key,m.state,m.reason,m.candidates,m.evidence)""").fetchone()[0]
    if mismatches:
        raise RuntimeError("Stored course links differ from the full reconciliation plan")
