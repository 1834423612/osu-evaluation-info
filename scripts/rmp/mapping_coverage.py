"""Count source profiles once, independently of course/review coverage."""

from collections import defaultdict


def summarize_profile_coverage(rows, campuses=()):
    overall = {}
    by_campus = {campus: {} for campus in campuses if campus}
    memberships = defaultdict(set)

    def merge(group, pid, accepted, pending, rejected):
        item = group.setdefault(pid, {"accepted": set(), "pending": False, "rejected": False})
        item["accepted"].update(accepted)
        item["pending"] |= pending
        item["rejected"] |= rejected

    for pid, campus, accepted, pending, rejected in rows:
        accepted = set(accepted or [])
        merge(overall, pid, accepted, pending, rejected)
        merge(by_campus.setdefault(campus or "UNASSIGNED", {}), pid, accepted, pending, rejected)
        if campus:
            memberships[pid].add(campus)

    def count(group):
        result = {"total": len(group), "linked": 0, "pending": 0, "no_candidate": 0, "rejected": 0}
        identities = set()
        for item in group.values():
            if item["accepted"]:
                result["linked"] += 1
                identities.update(item["accepted"])
            elif item["pending"]:
                result["pending"] += 1
            elif item["rejected"]:
                result["rejected"] += 1
            else:
                result["no_candidate"] += 1
        result["unlinked"] = result["total"] - result["linked"]
        result["official_instructors"] = len(identities)
        return result

    return {
        "unit": "rmp_profile", "overall": count(overall),
        "campuses": {campus: count(group) for campus, group in sorted(by_campus.items())},
        "profiles_with_multiple_campuses": sum(len(values) > 1 for values in memberships.values()),
    }


def stored_profile_coverage(conn):
    campuses = [row[0] for row in conn.execute("SELECT DISTINCT campus_code FROM osu_rmp.school ORDER BY campus_code")]
    rows, after = [], 0
    while True:
        batch = conn.execute("""WITH selected AS (
              SELECT legacy_id FROM osu_rmp.professor WHERE active AND legacy_id>%s
              ORDER BY legacy_id LIMIT 500
            ), memberships AS (
              SELECT DISTINCT p.legacy_id,s.campus_code FROM selected p
              LEFT JOIN osu_rmp.professor_school ps ON ps.professor_id=p.legacy_id
              LEFT JOIN osu_rmp.school s ON s.legacy_id=ps.school_id
            )
            SELECT p.legacy_id,p.campus_code,
              ARRAY(SELECT m.name_dot_number FROM osu_rmp.professor_identity_map m
                WHERE m.professor_id=p.legacy_id AND m.state='accepted' AND p.campus_code IS NOT NULL
                  AND (m.method='manual' OR m.evidence->'campus_codes' ? p.campus_code)),
              EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map m WHERE m.professor_id=p.legacy_id
                AND m.state IN ('accepted','candidate')),
              EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map m WHERE m.professor_id=p.legacy_id
                AND m.state='rejected')
            FROM memberships p ORDER BY p.legacy_id,p.campus_code""", (after,)).fetchall()
        if not batch:
            break
        rows.extend(batch)
        next_id = batch[-1][0]
        if next_id <= after:
            raise RuntimeError("RMP coverage pagination did not advance")
        after = next_id
    return summarize_profile_coverage(rows, campuses)
