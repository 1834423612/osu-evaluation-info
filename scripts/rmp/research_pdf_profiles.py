#!/usr/bin/env python3
"""Read bounded official historical CV/directory sources without inferring current employment."""

import argparse
from concurrent.futures import ProcessPoolExecutor, wait, FIRST_COMPLETED
from collections import defaultdict
import hashlib
from io import BytesIO
import json
import logging
from pathlib import Path
import re
import signal
import sys
import time
import unicodedata
from urllib.parse import urlsplit, urlunsplit, urljoin
from urllib.request import Request, build_opener, HTTPRedirectHandler

sys.path.insert(0, str(Path(__file__).parent))
from sync_rmp_mappings import connect_database, load_dsn
from identity_research import fold


def official_pdf_url(value):
    p = urlsplit(value)
    if p.scheme not in ("http", "https") or p.username or p.password or p.port:
        return None
    if not p.hostname or not (
        p.hostname.endswith(".osu.edu") or p.hostname.endswith(".ohio-state.edu")
    ):
        return None
    if not p.path.lower().endswith(".pdf"):
        return None
    return urlunsplit(("https", p.netloc, p.path, p.query, ""))


class OfficialRedirects(HTTPRedirectHandler):
    max_redirections = 3
    max_repeats = 3

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        target = official_pdf_url(urljoin(req.full_url, newurl))
        if not target:
            raise ValueError("Redirect left official PDF source")
        return super().redirect_request(req, fp, code, msg, headers, target)


def normalized_text(text):
    value = "".join(
        c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c)
    )
    return re.sub("[ \t]+", " ", value)


def clean_organization(value):
    value = re.sub(r"\b\S+@\S+", "", value or "")
    return re.split(
        r"\b(?:office|phone|email|e-mail|fax|tel|contact)\b|[+0-9][0-9 ()+.-]{3,}",
        value,
        flags=re.I,
    )[0].strip(" ,;:")


def pdf_contact_evidence(text, profiles, url, page):
    """Require a full name and its nearest canonical OSU email, with matching family/account stem."""
    text = normalized_text(text)
    results = []
    email = re.compile(r"\b([a-z][a-z0-9_-]*\.\d+)@osu\.edu\b", re.I)
    for profile in profiles:
        first = (
            re.sub(r"\([^)]*\)", "", profile["first_name"]).strip().split()[0]
            if profile["first_name"].strip()
            else ""
        )
        if len(first) < 2:
            continue
        last = normalized_text(profile["last_name"]).strip()
        family = re.escape(last).replace(r"\ ", r"\s+")
        middle = r"(?:[^\W\d_]+\.?\s+){0,3}"
        pattern = re.compile(
            r"\b"
            + re.escape(normalized_text(first))
            + r"\s+"
            + middle
            + family
            + r"\b",
            re.I,
        )
        for match in pattern.finditer(text):
            if match.end() - match.start() > 100:
                continue
            tail = text[match.end() : match.end() + 400]
            contact = email.search(tail)
            if not contact:
                continue
            user = contact.group(1).lower()
            if fold(user.rsplit(".", 1)[0]) != fold(last):
                continue
            between = tail[: contact.start()]
            other = re.search(r"\b([A-Z][a-z]+)\s+" + family + r"\b", between)
            if other and fold(other.group(1)) != fold(first):
                continue
            # Keep the source contact block small and reject another name/email column.
            if len(re.findall(r"\n\s*\n", between)) > 2:
                continue
            start = text.rfind("\n", 0, match.start()) + 1
            block = text[start : match.end() + contact.end()]
            if page == 1 and match.start() < 200:
                # A CV's two-column address can continue below the email column.
                prefix = text[: match.start()]
                other_owner = re.search(r"\b([A-Z][a-z]+)\s+" + family + r"\b", prefix)
                if not other_owner or fold(other_owner.group(1)) == fold(first):
                    extension = tail[contact.end() : contact.end() + 200]
                    extension = re.split(
                        r"\n\s*\n|[A-Za-z][A-Za-z0-9_-]*\.\d+@", extension, maxsplit=1
                    )[0]
                    block += extension
            title = re.search(
                r"\b(?:(?:Associate|Assistant|Senior|Clinical|Visiting|Emeritus|Distinguished)\s+){0,2}(?:Professor|Lecturer|Instructor|Teaching Assistant|Teaching Associate)\b",
                block,
                re.I,
            )
            title = title.group(0) if title else ""
            department = re.search(
                r"(?:Department|School) of ([^\n,;]{2,100})", block, re.I
            )
            organization = (
                clean_organization(department.group(0))
                if department
                else urlsplit(url).hostname.split(".")[0].replace("-", " ")
            )
            roles = (
                ["professor"]
                if "professor" in title.lower()
                else (
                    ["lecturer"]
                    if "lecturer" in title.lower()
                    else (
                        ["faculty"]
                        if "instructor" in title.lower()
                        else (
                            ["teaching-assistant"]
                            if "teaching" in title.lower()
                            else []
                        )
                    )
                )
            )
            campuses = []
            for code, label in [
                ("COL", "Columbus"),
                ("MNS", "Mansfield"),
                ("LMA", "Lima"),
                ("MRN", "Marion"),
                ("NWK", "Newark"),
                ("WST", "Wooster"),
            ]:
                if label.lower() in urlsplit(url).hostname.split(".") or re.search(
                    r"\b" + label + r"\b", block, re.I
                ):
                    campuses.append(code)
            observed_name = re.sub(r"\s+", " ", match.group(0)).strip()
            pieces = observed_name.split()
            person = {
                "user": user,
                "name": observed_name,
                "first": pieces[0],
                "middle": " ".join(pieces[1 : -len(last.split())]),
                "last": last,
                "roles": roles,
                "appointments": (
                    [{"title": title, "organization": organization}] if title else []
                ),
                "campuses": campuses,
                "source_url": url,
                "source_kind": "historical-document",
                "source_page": page,
                "context_organizations": [organization],
            }
            results.append({"professor_id": str(profile["id"]), "person": person})
            break
    return results


def process_source(job):
    logging.getLogger("pypdf").setLevel(logging.ERROR)
    url, profiles = job
    result = {
        "url": url,
        "profiles": [int(p["id"]) for p in profiles],
        "status": "unavailable",
        "records": [],
        "parser_version": "pdf-contact-v2",
        "checked_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    def timeout(_sig, _frame):
        raise TimeoutError("PDF source budget exceeded")

    signal.signal(signal.SIGALRM, timeout)
    signal.alarm(30)
    try:
        request = Request(
            url,
            headers={
                "User-Agent": "osu-eval-identity-research/1.0",
                "Accept": "application/pdf",
            },
        )
        with build_opener(OfficialRedirects()).open(request, timeout=12) as response:
            data = response.read(8_000_001)
        if len(data) > 8_000_000:
            result["status"] = "too_large"
            return result
        if not data.startswith(b"%PDF-"):
            result["status"] = "not_pdf"
            return result
        result["sha256"] = hashlib.sha256(data).hexdigest()
        from pypdf import PdfReader

        reader = PdfReader(BytesIO(data), strict=False)
        if reader.is_encrypted and not reader.decrypt(""):
            result["status"] = "encrypted"
            return result
        result["page_count"] = len(reader.pages)
        for number, page in enumerate(reader.pages[:100], 1):
            text = page.extract_text(extraction_mode="layout") or ""
            if len(text) > 1_000_000:
                continue
            result["records"].extend(pdf_contact_evidence(text, profiles, url, number))
        result["status"] = "available" if len(reader.pages) <= 100 else "partial"
    except Exception as error:
        result["error_kind"] = type(error).__name__
    finally:
        signal.alarm(0)
    return result


def run(args):
    conn = connect_database(load_dsn(None))
    try:
        profiles = {
            row[0]: {"id": row[0], "first_name": row[1], "last_name": row[2]}
            for row in conn.execute(
                "SELECT legacy_id,first_name,last_name FROM osu_rmp.professor WHERE active"
            )
        }
        needed = {
            row[0]
            for row in conn.execute(
                "SELECT p.legacy_id FROM osu_rmp.professor p WHERE p.active AND NOT EXISTS(SELECT 1 FROM osu_rmp.professor_identity_map m WHERE m.professor_id=p.legacy_id AND m.state='accepted')"
            )
        }
    finally:
        conn.close()
    sources = defaultdict(set)
    for path in Path(args.index).glob("*.json"):
        for batch in json.loads(path.read_text()):
            related = needed & set(batch["profiles"])
            if not related:
                continue
            for source in batch["sources"]:
                url = official_pdf_url(source["url"])
                if url and re.search(
                    r"cv|vita|resume|syllab|directory|faculty|staff",
                    url + " " + source["title"],
                    re.I,
                ):
                    sources[url].update(related)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    done = set()
    positive = set()
    if output.exists():
        for line in output.read_text().splitlines():
            item = json.loads(line)
            if item["records"]:
                positive.add(item["url"])
            if item["status"] in ("available", "partial") and (
                item.get("parser_version") == "pdf-contact-v2" or not item["records"]
            ):
                done.add(item["url"])
    queue = [
        (url, [profiles[pid] for pid in sorted(ids)])
        for url, ids in sources.items()
        if url not in done and (not args.verify_positives or url in positive)
    ]
    print(
        json.dumps(
            {"event": "pdf-start", "sources": len(sources), "queued": len(queue)}
        ),
        flush=True,
    )
    finished = 0
    found = 0
    cursor = 0
    pending = set()
    last_start = 0
    with ProcessPoolExecutor(max_workers=4, max_tasks_per_child=20) as pool:
        while cursor < len(queue) or pending:
            while cursor < len(queue) and len(pending) < 8:
                time.sleep(max(0, 0.25 - (time.monotonic() - last_start)))
                last_start = time.monotonic()
                pending.add(pool.submit(process_source, queue[cursor]))
                cursor += 1
            completed, pending = wait(pending, timeout=1, return_when=FIRST_COMPLETED)
            for future in completed:
                item = future.result()
                with output.open("a") as stream:
                    stream.write(json.dumps(item, ensure_ascii=False) + "\n")
                finished += 1
                found += len(item["records"])
                if finished % 50 == 0 or finished == len(queue):
                    print(
                        json.dumps(
                            {
                                "event": "pdf-progress",
                                "finished": finished,
                                "total": len(queue),
                                "identityEvidence": found,
                            }
                        ),
                        flush=True,
                    )
    print(
        json.dumps(
            {"scanned": finished, "identityEvidence": found, "output": str(output)}
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--index", default="data/local/rmp/web-search-index")
    parser.add_argument(
        "--output", default="data/local/rmp/identity-pdf-profile-scan.jsonl"
    )
    parser.add_argument("--verify-positives", action="store_true")
    run(parser.parse_args())
