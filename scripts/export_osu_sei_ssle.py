#!/usr/bin/env python3
"""Robust exporter for the public OSU Blue SEI/SSLE table.

Features
--------
* Resolves Blue's public block token to its numeric block/datasource IDs.
* Handles Blue's non-strict JSON embedded in the outer JSON response.
* Fetches the grid with the UI-supported page size of 100.
* Uses modest concurrency and retries/backoff.
* Writes deterministic page order to CSV and JSONL.
* Verifies total row count and reports duplicate natural keys.

Install:
    python -m pip install requests beautifulsoup4

Run from the repository root:
    OSU_BLUE_PUBLIC_URL="..." python scripts/export_osu_sei_ssle.py

Optional:
    python scripts/export_osu_sei_ssle.py --url "$OSU_BLUE_PUBLIC_URL" --workers 2
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import os
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import parse_qs, parse_qsl, urlencode, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIRECTORY = (
    REPOSITORY_ROOT / "data" / "raw" / "blue-sei-ssle-su22-su26"
)
DEFAULT_PAGE_SIZE = 100  # largest size exposed by this Blue page's UI
DEFAULT_WORKERS = 4
ALL = "____[-1]____"
SENSITIVE_QUERY_PARAMETERS = {
    "access_token",
    "api_key",
    "apikey",
    "auth",
    "authorization",
    "password",
    "secret",
    "signature",
    "sig",
    "token",
    "userid",
}
SENSITIVE_QUERY_PARAMETER_SUFFIXES = (
    "key",
    "password",
    "secret",
    "signature",
    "token",
)

_thread_local = threading.local()


def redacted_url(url: str) -> str:
    """Return a metadata-safe URL without query values that act as credentials."""
    parsed = urlparse(url)
    query = [
        (
            key,
            "REDACTED"
            if key.casefold() in SENSITIVE_QUERY_PARAMETERS
            or key.casefold().endswith(SENSITIVE_QUERY_PARAMETER_SUFFIXES)
            else value,
        )
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
    ]
    return urlunparse(parsed._replace(query=urlencode(query)))


def loads_blue_inner(value):
    """Decode Blue's inner JSON.

    Blue's ASMX service returns valid *outer* JSON, but some inner JSON strings
    contain literal control characters/newlines in fields such as tagDescription.
    Python's json.loads() rejects those by default. strict=False accepts them.
    """
    if isinstance(value, (dict, list)):
        return value
    if not isinstance(value, str):
        raise TypeError(f"Expected Blue inner JSON string/dict/list, got {type(value)!r}")
    return json.loads(value, strict=False)


def make_session(view_url: str) -> requests.Session:
    parsed = urlparse(view_url)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    s = requests.Session()
    s.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/151.0 Safari/537.36"
            ),
            "Accept": "application/json, text/javascript, */*; q=0.01",
            "Content-Type": "application/json; charset=UTF-8",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": origin,
            "Referer": view_url,
        }
    )
    return s


def get_worker_session(view_url: str) -> requests.Session:
    s = getattr(_thread_local, "session", None)
    if s is None:
        s = make_session(view_url)
        _thread_local.session = s
    return s


def post_json(session: requests.Session, url: str, payload: dict, retries: int = 6):
    last_exc = None
    for attempt in range(retries):
        try:
            r = session.post(url, json=payload, timeout=(15, 90))
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else min(2 ** attempt, 20)
                time.sleep(delay)
                continue
            r.raise_for_status()
            return r.json()
        except (requests.RequestException, ValueError) as exc:
            last_exc = exc
            if attempt == retries - 1:
                break
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(f"Request failed after {retries} attempts: {url}") from last_exc


def parse_grid(d):
    """Parse Blue's JSON-wrapped HTML grid into headers, rows, total."""
    if not isinstance(d, list) or len(d) < 3:
        raise ValueError(f"Unexpected getFbvGrid payload shape: {type(d)!r}, len={getattr(d, '__len__', lambda: '?')()}")

    soup = BeautifulSoup(d[0], "html.parser")
    header_row = soup.find("tr", class_="gHeader") or soup.find("tr")
    if header_row is None:
        raise ValueError("Could not find grid header row")

    headers = [
        th.get_text(" ", strip=True).replace("↑", "").replace("↓", "").strip()
        for th in header_row.find_all("th")
    ]
    if not headers:
        raise ValueError("Could not parse grid headers")

    rows = []
    for tr in soup.find_all("tr"):
        if tr is header_row:
            continue
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if not cells:
            continue
        if len(cells) != len(headers):
            raise ValueError(
                f"Unexpected row width {len(cells)} != {len(headers)}; row={cells!r}"
            )
        rows.append(cells)

    m = re.search(r"([0-9][0-9,]*)", str(d[2]))
    total = int(m.group(1).replace(",", "")) if m else None
    return headers, rows, total


def natural_key(headers, row):
    """Best-effort public-row identity used only for diagnostics."""
    item = dict(zip(headers, row))
    return (
        item.get("Term", ""),
        item.get("Class Number", ""),
        item.get("Namen", ""),
        item.get("Last Name", ""),
        item.get("First Name", ""),
    )


def parse_args():
    p = argparse.ArgumentParser(description="Export OSU Blue public SEI/SSLE data")
    p.add_argument(
        "--url",
        default=os.environ.get("OSU_BLUE_PUBLIC_URL"),
        help="Public fbview.aspx URL (or set OSU_BLUE_PUBLIC_URL)",
    )
    p.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    p.add_argument("--workers", type=int, default=DEFAULT_WORKERS)
    p.add_argument(
        "--out-dir",
        default=str(DEFAULT_OUTPUT_DIRECTORY),
        help="Directory for CSV, JSONL, and metadata output",
    )
    args = p.parse_args()
    if not args.url:
        p.error("provide --url or set OSU_BLUE_PUBLIC_URL")
    return args


def main():
    args = parse_args()
    if args.page_size < 1 or args.page_size > 100:
        raise SystemExit("Use --page-size between 1 and 100; 100 is the largest size exposed by the UI.")
    if args.workers < 1 or args.workers > 8:
        raise SystemExit("Use --workers between 1 and 8; 2-4 is recommended.")

    view_url = args.url
    parsed_view = urlparse(view_url)
    q = parse_qs(parsed_view.query)
    try:
        public_block_id = q["blockid"][0]
        user_id = q["userid"][0]
    except (KeyError, IndexError) as exc:
        raise SystemExit("The URL must contain both blockid= and userid= parameters.") from exc
    lang = q.get("lng", ["en"])[0]

    base = f"{parsed_view.scheme}://{parsed_view.netloc}/osubpi"
    ws = base + "/fbview-WebService.asmx"

    bootstrap = make_session(view_url)
    # Load once to mirror a normal browser visit and obtain any cookies if Blue adds them later.
    r = bootstrap.get(view_url, timeout=(15, 90))
    r.raise_for_status()

    info_outer = post_json(
        bootstrap,
        ws + "/getFbViewInfo",
        {
            "strUiCulture": lang,
            "blockId": public_block_id,
            "userId": user_id,
            "fbvType": "block",
        },
    )

    # IMPORTANT FIX vs v1: Blue's inner d string contains literal newlines.
    info = loads_blue_inner(info_outer["d"])
    numeric_block_id = str(info["blockId"])
    datasource_id = str(info["Datasource1ID"])

    subjects_outer = post_json(
        bootstrap,
        ws + "/getDatasourceSubjects",
        {
            "strUiCulture": lang,
            "datasourceId": datasource_id,
            "ddlId": "ddlFbvSubjects",
            "blockid": numeric_block_id,
            "userid": user_id,
        },
    )
    subject_soup = BeautifulSoup(subjects_outer["d"], "html.parser")
    subject_col_id = next(
        (
            p.get("id")
            for p in subject_soup.find_all("p")
            if p.get_text(strip=True).upper() == "SUBJECT"
        ),
        None,
    )
    if not subject_col_id:
        raise RuntimeError("Could not resolve SUBJECT column id")

    def payload(page: int):
        return {
            "strUiCultureIn": lang,
            "datasourceId": datasource_id,
            "blockId": numeric_block_id,
            "subjectColId": subject_col_id,
            "subjectValue": ALL,
            "detailValue": ALL,
            "gridId": "fbvGrid",
            "pageActuelle": page,
            "strOrderBy": [f"col_{subject_col_id}", "asc"],
            "strFilter": ["", "", "ddlFbvColumnSelectorLvl1", ""],
            "sortCallbackFunc": "__getFbvGrid",
            "userid": user_id,
            "pageSize": args.page_size,
        }

    first_outer = post_json(bootstrap, ws + "/getFbvGrid", payload(1))
    first = first_outer["d"]
    headers, first_rows, total = parse_grid(first)
    if total is None:
        raise RuntimeError("Could not parse Total Items from getFbvGrid response")
    pages = math.ceil(total / args.page_size)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_csv = out_dir / "osu_sei_ssle_all.csv"
    out_jsonl = out_dir / "osu_sei_ssle_all.jsonl"
    out_meta = out_dir / "metadata.json"

    print(f"Dataset: {info.get('datasource1Name')}")
    print(f"Blue block: {numeric_block_id}; datasource: {datasource_id}")
    print(f"Total items: {total}; page size: {args.page_size}; pages: {pages}")
    print("Columns:")
    for i, h in enumerate(headers, 1):
        print(f"  {i:02d}. {h}")

    metadata = {
        "source_url": redacted_url(view_url),
        "blue_block_id": numeric_block_id,
        "blue_datasource_id": datasource_id,
        "dataset_name": info.get("datasource1Name"),
        "block_title": info.get("tagBlockTitle"),
        "description": info.get("tagDescription"),
        "expected_rows": total,
        "page_size": args.page_size,
        "pages": pages,
        "columns": headers,
    }
    out_meta.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    def fetch_page(page: int):
        s = get_worker_session(view_url)
        outer = post_json(s, ws + "/getFbvGrid", payload(page))
        h, rows, t = parse_grid(outer["d"])
        if h != headers:
            raise ValueError(f"Header changed on page {page}")
        if t != total:
            raise ValueError(f"Total changed on page {page}: {t} != {total}")
        return page, rows

    count = 0
    keys_seen = set()
    duplicate_keys = 0

    with out_csv.open("w", newline="", encoding="utf-8-sig") as fcsv, out_jsonl.open(
        "w", encoding="utf-8"
    ) as fjson:
        writer = csv.writer(fcsv)
        writer.writerow(headers)

        def write_rows(rows):
            nonlocal count, duplicate_keys
            for row in rows:
                writer.writerow(row)
                item = dict(zip(headers, row))
                fjson.write(json.dumps(item, ensure_ascii=False) + "\n")
                key = natural_key(headers, row)
                if key in keys_seen:
                    duplicate_keys += 1
                else:
                    keys_seen.add(key)
                count += 1

        write_rows(first_rows)

        if pages > 1:
            # executor.map runs requests concurrently but yields results in input-page order,
            # making the output deterministic across runs.
            with ThreadPoolExecutor(max_workers=args.workers) as pool:
                for page, rows in pool.map(fetch_page, range(2, pages + 1)):
                    write_rows(rows)
                    if page % 25 == 0 or page == pages:
                        print(f"Fetched page {page}/{pages}; rows written: {count}/{total}")

    if count != total:
        raise RuntimeError(
            f"Row-count mismatch: wrote {count}, server reported {total}. "
            "Rerun with --workers 1 to rule out transient pagination issues."
        )

    print(f"Done. Rows: {count}")
    print(f"Duplicate diagnostic natural keys: {duplicate_keys}")
    print(f"CSV:      {out_csv.resolve()}")
    print(f"JSONL:    {out_jsonl.resolve()}")
    print(f"Metadata: {out_meta.resolve()}")


if __name__ == "__main__":
    main()
