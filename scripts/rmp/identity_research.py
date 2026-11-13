"""Evaluate live official people records against independent teaching evidence."""

import re
import unicodedata
from urllib.parse import urlsplit

if __package__:
    from .course_matching import resolve_course
else:
    from course_matching import resolve_course

VERSION = "official-identity-research-v4"


def fold(value):
    return "".join(
        c for c in unicodedata.normalize("NFKD", value or "").casefold() if c.isalnum()
    )


def name_words(value):
    return [fold(part) for part in re.findall(r"[^\W\d_]+", value or "", re.UNICODE)]


def compatible_name(profile, person):
    """Omitted middle names are allowed; conflicting explicit names never are."""
    if fold(profile["last_name"]) != fold(person.get("last")):
        return False
    left = name_words(re.sub(r"\([^)]*\)", "", profile["first_name"]))
    right = name_words(" ".join([person.get("first", ""), person.get("middle", "")]))
    if not left or not right or len(left[0]) < 2 or left[0] != right[0]:
        return False
    return all(
        a == b or (len(a) == 1 and b.startswith(a)) or (len(b) == 1 and a.startswith(b))
        for a, b in zip(left[1:], right[1:])
    )


def merge_people(profile, candidates):
    """Combine observations only by a verified account, never by a similar name."""
    grouped = {}
    for person in candidates:
        grouped.setdefault(person["user"], []).append(person)
    result = {}
    for user, people in grouped.items():
        people=sorted(people,key=lambda p:p.get('observed_at',''),reverse=True)
        matching = [p for p in people if compatible_name(profile, p)]
        base = dict((matching or people)[0])
        central = [
            p for p in people if not p.get("source_url") and p.get("appointments")
        ]
        jobs = (central or [p for p in people if p.get("appointments")] or [base])[0]
        base["appointments"] = jobs.get("appointments", [])
        base["roles"] = (
            jobs.get("roles", [])
            if jobs.get("appointments")
            else sorted({r for p in people for r in p.get("roles", [])})
        )
        base["appointment_source"] = jobs.get("source_url") or "official-directory"
        base["campuses"] = sorted({c for p in people for c in p.get("campuses", [])})
        base["context_roles"] = sorted({r for p in people for r in p.get("roles", [])})
        base["context_organizations"] = sorted(
            {
                job.get("organization") or ""
                for p in people
                for job in p.get("appointments", [])
            }
        )
        base["source_urls"] = sorted(
            {p["source_url"] for p in people if p.get("source_url")}
        )
        base["observed_names"] = sorted({p["name"] for p in people})
        result[user] = base
    return result


def classification(person):
    jobs = person.get("appointments", []) if person else []
    text = " ".join(job.get("title", "") for job in jobs).lower()
    roles = set(person.get("roles", [])) if person else set()
    category = (
        "emeritus"
        if "emerit" in text
        else (
            "professor"
            if "professor" in text
            else (
                "lecturer"
                if "lecturer" in text
                else (
                    "teaching-assistant"
                    if "teaching assistant" in text or "teaching associate" in text
                    else (
                        "faculty"
                        if "instructor" in text or "faculty" in text
                        else (
                            "student-assistant"
                            if "student-assistant" in roles
                            else (
                                "student"
                                if "student" in roles
                                else "employee" if "employee" in roles else "unknown"
                            )
                        )
                    )
                )
            )
        )
    )
    return {
        "category": category,
        "roles": person.get("roles", []) if person else [],
        "appointments": jobs,
    }


def evaluate_profile(profile, observation, identities, facts, lexicon, exact_users):
    pid = int(profile["legacy_id"])
    raw_name = fold(profile["first_name"] + " " + profile["last_name"])
    campuses = set(profile["campuses"])
    all_people = merge_people(profile, observation.get("candidates", []))
    people = {p["user"]: p for p in all_people.values() if compatible_name(profile, p)}
    users = set(people) | set(exact_users)
    raw_courses = {
        item.get("courseName", "")
        for item in profile.get("course_codes", [])
        if isinstance(item, dict)
    } | set(profile.get("review_codes", []))
    eligible = []
    checked = []
    for user in sorted(users):
        person = people.get(user)
        local = identities.get(user, {})
        historical_name_match = raw_name in {fold(n) for n in local.get("names", [])}
        if historical_name_match:
            person = person or all_people.get(user)
        given = name_words(profile["first_name"])
        name_ok = bool(
            given
            and len(given[0]) >= 2
            and (
                compatible_name(profile, person)
                if person and not historical_name_match
                else historical_name_match
            )
        )
        own = [fact for fact in facts.get(user, []) if fact[0] in campuses]
        taught = {fact[1] for fact in own}
        course_matches = []
        for raw in sorted(raw_courses):
            match = resolve_course(
                raw,
                taught,
                lexicon,
                department=profile.get("department") or "",
                taught=taught,
            )
            if match["state"] == "accepted":
                course_matches.append(match["course_key"])
        organizations = set(local.get("departments", []))
        organizations.update(
            job.get("organization") or ""
            for job in (person or {}).get("appointments", [])
        )
        organizations.update((person or {}).get("context_organizations", []))
        for source_url in (person or {}).get("source_urls", []):
            host = urlsplit(source_url).hostname or ""
            if host.endswith(".osu.edu"):
                organizations.add(host.split(".")[0].replace("-", " "))
        for job in (person or {}).get("appointments", []):
            title_subject = re.search(
                r"\b(?:professor|lecturer|instructor)\s+(?:of|in)\s+(.+)",
                job.get("title", ""),
                re.I,
            )
            if title_subject:
                organizations.add(title_subject.group(1))
        organizations.update(
            re.sub(
                r"^(?:the\s+)?(?:department|school|college)\s+of\s+",
                "",
                org,
                flags=re.I,
            )
            for org in list(organizations)
        )
        rmp_dept = fold(profile.get("department"))
        academic = lexicon.resolve(profile.get("department") or "")
        department = bool(rmp_dept and rmp_dept in {fold(org) for org in organizations})
        department = department or bool(academic & {fact[2] for fact in own})
        department = department or any(
            academic & lexicon.resolve(org) for org in organizations if org
        )
        directory_subjects = set().union(
            *(set(lexicon.resolve(org)) for org in organizations if org)
        )
        department_conflict = bool(
            academic and directory_subjects and not academic & directory_subjects
        )
        source_campuses = set((person or {}).get("campuses", []))
        for org in organizations:
            for code, label in [
                ("MNS", "mansfield"),
                ("LMA", "lima"),
                ("MRN", "marion"),
                ("NWK", "newark"),
                ("WST", "wooster"),
                ("COL", "columbus"),
            ]:
                if re.search(r"\b" + label + r"\b", org, re.I):
                    source_campuses.add(code)
        scope = sorted(campuses & ({f[0] for f in own} | source_campuses))
        explicit_faculty = bool(
            person
            and set(person.get("context_roles", person.get("roles", [])))
            & {"professor", "lecturer", "faculty"}
        )
        supports = bool(
            name_ok
            and scope
            and (
                course_matches
                or department
                or (explicit_faculty and not department_conflict)
            )
        )
        # An overfull directory response cannot establish uniqueness on its own.
        if observation.get("possibly_truncated") and not course_matches:
            supports = False
        evidence = {
            "user": user,
            "name_match": name_ok,
            "campus_codes": scope,
            "department_match": department,
            "course_matches": sorted(set(course_matches)),
            "directory_account_observed": person is not None,
            "explicit_faculty_appointment": explicit_faculty,
            "department_conflict": department_conflict,
            "proof_level": 3 if course_matches else 2 if department else 1,
            "supports": supports,
            "official_sources": ["official-teaching-history"] if own else [],
            "person": person,
        }
        checked.append(evidence)
        if supports:
            eligible.append(evidence)
    if eligible:
        strongest = max(item["proof_level"] for item in eligible)
        eligible = [item for item in eligible if item["proof_level"] == strongest]
    selected = eligible[0] if len(eligible) == 1 else None
    if selected:
        state = "confirmed"
        reason = (
            "verified_name_campus_course"
            if selected["course_matches"]
            else (
                "verified_name_campus_department"
                if selected["department_match"]
                else "verified_faculty_name_campus"
            )
        )
    elif len(eligible) > 1:
        state = "ambiguous"
        reason = "multiple_supported_official_accounts"
    elif observation.get("status") == "unavailable":
        state = "source_unavailable"
        reason = "official_directory_request_failed"
    elif users:
        state = "unresolved"
        reason = "name_candidates_without_sufficient_context"
    else:
        state = "unresolved"
        reason = "no_compatible_official_name"
    return {
        "professor_id": pid,
        "state": state,
        "username": selected["user"] if selected else None,
        "reason": reason,
        "classification": classification((selected or {}).get("person")),
        "evidence": {
            "version": VERSION,
            "rmp_name":profile['first_name']+' '+profile['last_name'],
            "rmp_department":profile.get('department'),
            "rmp_campuses":sorted(campuses),
            "source_url": "https://www.osu.edu/search/?q="
            + observation.get("query", "").replace(" ", "%20"),
            "query_status": observation.get("status"),
            "query": observation.get("query"),
            "source_checked_at": observation.get("checked_at"),
            "campus_codes": selected["campus_codes"] if selected else [],
            "source_results": [
                {
                    "source": s.get("source"),
                    "status": s.get("status"),
                    "checked_at": s.get("checked_at"),
                }
                for s in observation.get("sources", [observation])
            ],
            "candidates": checked,
        },
    }
