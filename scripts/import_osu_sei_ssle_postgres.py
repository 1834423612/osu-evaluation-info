#!/usr/bin/env python3
"""
Import OSU Blue SEI/SSLE JSONL into PostgreSQL.

Features:
- Full validation before any database write
- Idempotent imports by source + file SHA-256
- Raw JSONB snapshot retention
- Set-based normalization through a temporary staging table
- Stable natural keys validated from the 68,729-row source:
    section    = Term + Class Number
    evaluation = Term + Class Number + Namen
    instructor = Namen
- Explicit SEI/SSLE metric separation
- Source-state tracking for future overlapping historical datasets

Python: 3.10+
Database: PostgreSQL 15+ (17+ recommended)

Install DB driver:
    python -m pip install "psycopg[binary]>=3.2"

Validate only (psycopg not required):
    python scripts/import_osu_sei_ssle_postgres.py --validate-only --expected-rows 68729

Create schema + import:
    python scripts/import_osu_sei_ssle_postgres.py ^
      --file data/raw/blue-sei-ssle-su22-su26/osu_sei_ssle_all.jsonl ^
      --schema db/schema.sql ^
      --dsn "postgresql://postgres:password@localhost:5432/osu" ^
      --init-schema ^
      --expected-rows 68729
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
from collections import Counter
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Dict, Iterable, Iterator, Optional, Tuple

EXPECTED_FIELDS = [
    "Last Name",
    "First Name",
    "SUBJECT",
    "Catalog",
    "Class",
    "Class Number",
    "Term",
    "COLLEGE",
    "DEPARTMENT",
    "MEDIUM",
    "CAMPUS",
    "Class Size Category",
    "N of Responses",
    "Instructor's Average Overall Rating",
    "Standard Deviation",
    "InvitedCount",
    "ResponseRatio",
    "Namen",
]

TERM_RE = re.compile(r"^(SP|SU|AU) (\d{2})$")
CLASS_NUMBER_RE = re.compile(r"^\d+$")
NAMEN_RE = re.compile(r"^[^.\s]+\.\d+$")
SEASON_ORDER = {"SP": 1, "SU": 2, "AU": 3}
SSLE_CUTOVER_SORT_KEY = 2025 * 10 + SEASON_ORDER["AU"]
KNOWN_CLASS_SIZE_CATEGORIES = {"S", "M", "L"}
KNOWN_MEDIUMS = {
    "In Person",
    "Distance Learning",
    "Hybrid Delivery",
    "Distance Enhanced",
}
KNOWN_CAMPUSES = {"COL", "LMA", "MNS", "MRN", "NWK", "WST"}

SOURCE_CODE_DEFAULT = "osu_bluera_sei_ssle"
SOURCE_NAME_DEFAULT = "OSU Blue SEI and SSLE Scores by instructor & course"
SOURCE_BASE_URL_DEFAULT = "https://osu.bluera.com/osubpi/fbview.aspx"
BLOCK_ID_DEFAULT = "730"
DATASOURCE_ID_DEFAULT = "1104300"
REPOSITORY_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SNAPSHOT_PATH = (
    REPOSITORY_ROOT
    / "data"
    / "raw"
    / "blue-sei-ssle-su22-su26"
    / "osu_sei_ssle_all.jsonl"
)
DEFAULT_SCHEMA_PATH = REPOSITORY_ROOT / "db" / "schema.sql"


class ValidationError(Exception):
    pass


def canonical_json(obj: Dict[str, Any]) -> str:
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def clean_text(value: Any, field: str) -> str:
    if value is None:
        raise ValidationError(f"{field}: null is not allowed")
    text = str(value).strip()
    if not text:
        raise ValidationError(f"{field}: empty string is not allowed")
    return text


def parse_decimal(value: Any, field: str, allow_na: bool = False) -> Optional[Decimal]:
    text = clean_text(value, field)
    if allow_na and text.upper() == "N/A":
        return None
    try:
        return Decimal(text)
    except InvalidOperation as exc:
        raise ValidationError(f"{field}: invalid number {text!r}") from exc


def parse_int(value: Any, field: str) -> int:
    dec = parse_decimal(value, field)
    assert dec is not None
    if dec != dec.to_integral_value():
        raise ValidationError(f"{field}: expected integer, got {dec}")
    return int(dec)


def parse_term(label: str) -> Tuple[str, int, int]:
    m = TERM_RE.fullmatch(label)
    if not m:
        raise ValidationError(f"Term: unexpected value {label!r}")
    season = m.group(1)
    year = 2000 + int(m.group(2))
    sort_key = year * 10 + SEASON_ORDER[season]
    return season, year, sort_key


def instrument_for_sort_key(sort_key: int) -> Tuple[str, str]:
    if sort_key >= SSLE_CUTOVER_SORT_KEY:
        return "SSLE", "ssle_mean_all_items"
    return "SEI", "sei_overall_item_10"


def course_identity(subject: str, catalog_raw: str, class_title: str) -> Tuple[Optional[str], str, bool]:
    if catalog_raw.upper() == "N/A":
        # Unknown catalog must not collapse all same-subject unknown rows into one course.
        return None, f"{subject}|<UNKNOWN_CATALOG>|{class_title}", True
    return catalog_raw, f"{subject}|{catalog_raw}", False


@dataclass(frozen=True)
class NormalizedRow:
    row_number: int
    row_hash: str
    natural_key_hash: str
    last_name: str
    first_name: str
    subject: str
    catalog_raw: str
    catalog: Optional[str]
    course_key: str
    catalog_unknown: bool
    class_title: str
    class_number: str
    term_label: str
    term_season: str
    term_year: int
    term_sort_key: int
    college: str
    department: str
    medium: str
    campus: str
    class_size_category: str
    n_responses: int
    rating: Decimal
    standard_deviation: Optional[Decimal]
    invited_count: int
    response_ratio: Decimal
    namen: str
    instrument: str
    metric_kind: str
    payload_text: str


def normalize_row(obj: Dict[str, Any], row_number: int) -> NormalizedRow:
    missing = [f for f in EXPECTED_FIELDS if f not in obj]
    if missing:
        raise ValidationError(f"row {row_number}: missing fields: {missing}")

    last_name = clean_text(obj["Last Name"], "Last Name")
    first_name = clean_text(obj["First Name"], "First Name")
    subject = clean_text(obj["SUBJECT"], "SUBJECT")
    catalog_raw = clean_text(obj["Catalog"], "Catalog")
    class_title = clean_text(obj["Class"], "Class")
    class_number = clean_text(obj["Class Number"], "Class Number")
    term_label = clean_text(obj["Term"], "Term")
    college = clean_text(obj["COLLEGE"], "COLLEGE")
    department = clean_text(obj["DEPARTMENT"], "DEPARTMENT")
    medium = clean_text(obj["MEDIUM"], "MEDIUM")
    campus = clean_text(obj["CAMPUS"], "CAMPUS")
    class_size_category = clean_text(obj["Class Size Category"], "Class Size Category")
    namen = clean_text(obj["Namen"], "Namen")

    if not CLASS_NUMBER_RE.fullmatch(class_number):
        raise ValidationError(f"row {row_number}: Class Number is not digits: {class_number!r}")

    season, year, sort_key = parse_term(term_label)
    instrument, metric_kind = instrument_for_sort_key(sort_key)

    n_responses = parse_int(obj["N of Responses"], "N of Responses")
    rating = parse_decimal(obj["Instructor's Average Overall Rating"], "Instructor's Average Overall Rating")
    standard_deviation = parse_decimal(obj["Standard Deviation"], "Standard Deviation", allow_na=True)
    invited_count = parse_int(obj["InvitedCount"], "InvitedCount")
    response_ratio = parse_decimal(obj["ResponseRatio"], "ResponseRatio")

    assert rating is not None and response_ratio is not None

    if n_responses < 1:
        raise ValidationError(f"row {row_number}: N of Responses must be >= 1")
    if invited_count < 1:
        raise ValidationError(f"row {row_number}: InvitedCount must be >= 1")
    if n_responses > invited_count:
        raise ValidationError(
            f"row {row_number}: responses {n_responses} > invited {invited_count}"
        )
    if not (Decimal("1") <= rating <= Decimal("5")):
        raise ValidationError(f"row {row_number}: rating out of 1-5 range: {rating}")
    if standard_deviation is not None and not (Decimal("0") <= standard_deviation <= Decimal("3")):
        raise ValidationError(
            f"row {row_number}: standard deviation out of expected range: {standard_deviation}"
        )
    if not (Decimal("0") <= response_ratio <= Decimal("100")):
        raise ValidationError(
            f"row {row_number}: response ratio out of 0-100 range: {response_ratio}"
        )

    expected_ratio = (
        (Decimal(n_responses) / Decimal(invited_count)) * Decimal("100")
    ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    if abs(expected_ratio - response_ratio) > Decimal("0.01"):
        raise ValidationError(
            f"row {row_number}: ResponseRatio {response_ratio} != "
            f"{n_responses}/{invited_count}*100 ({expected_ratio})"
        )

    catalog, course_key, catalog_unknown = course_identity(subject, catalog_raw, class_title)

    payload_text = canonical_json(obj)
    row_hash = sha256_text(payload_text)
    natural_key_hash = sha256_text("\x1f".join((term_label, class_number, namen)))

    return NormalizedRow(
        row_number=row_number,
        row_hash=row_hash,
        natural_key_hash=natural_key_hash,
        last_name=last_name,
        first_name=first_name,
        subject=subject,
        catalog_raw=catalog_raw,
        catalog=catalog,
        course_key=course_key,
        catalog_unknown=catalog_unknown,
        class_title=class_title,
        class_number=class_number,
        term_label=term_label,
        term_season=season,
        term_year=year,
        term_sort_key=sort_key,
        college=college,
        department=department,
        medium=medium,
        campus=campus,
        class_size_category=class_size_category,
        n_responses=n_responses,
        rating=rating,
        standard_deviation=standard_deviation,
        invited_count=invited_count,
        response_ratio=response_ratio,
        namen=namen,
        instrument=instrument,
        metric_kind=metric_kind,
        payload_text=payload_text,
    )


def iter_normalized_rows(path: Path) -> Iterator[NormalizedRow]:
    with path.open("r", encoding="utf-8") as f:
        row_number = 0
        for physical_line, line in enumerate(f, start=1):
            if not line.strip():
                continue
            row_number += 1
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValidationError(
                    f"physical line {physical_line}: invalid JSON: {exc}"
                ) from exc
            if not isinstance(obj, dict):
                raise ValidationError(
                    f"physical line {physical_line}: expected JSON object"
                )
            yield normalize_row(obj, row_number)


def validate_file(path: Path, expected_rows: Optional[int] = None) -> Dict[str, Any]:
    section_metadata: Dict[Tuple[str, str], Tuple[Any, ...]] = {}
    evaluation_keys = set()
    row_hashes = set()
    instructor_ids = set()
    course_keys = set()
    subjects = set()
    term_counts: Counter[str] = Counter()
    campus_counts: Counter[str] = Counter()
    medium_counts: Counter[str] = Counter()
    class_size_counts: Counter[str] = Counter()
    instrument_counts: Counter[str] = Counter()
    extra_fields: Counter[str] = Counter()
    display_names_by_namen: Dict[str, set] = {}
    namen_by_display_name: Dict[Tuple[str, str], set] = {}

    duplicate_row_hashes = 0
    catalog_na_rows = 0
    sei_sd_na = 0
    ssle_sd_na = 0
    unknown_medium_rows = 0
    unknown_campus_rows = 0
    unknown_class_size_rows = 0
    unusual_namen_rows = 0
    rows = 0
    total_responses = 0
    total_invited = 0
    min_rating: Optional[Decimal] = None
    max_rating: Optional[Decimal] = None

    for nr in iter_normalized_rows(path):
        rows += 1

        # Re-open canonical payload only for schema drift detection.
        obj = json.loads(nr.payload_text)
        for key in set(obj) - set(EXPECTED_FIELDS):
            extra_fields[key] += 1

        section_key = (nr.term_label, nr.class_number)
        shared_metadata = (
            nr.subject,
            nr.catalog_raw,
            nr.class_title,
            nr.college,
            nr.department,
            nr.medium,
            nr.campus,
            nr.class_size_category,
            nr.course_key,
        )
        prior = section_metadata.get(section_key)
        if prior is None:
            section_metadata[section_key] = shared_metadata
        elif prior != shared_metadata:
            raise ValidationError(
                "Section-level metadata conflict for "
                f"{nr.term_label}/{nr.class_number}. "
                f"Existing={prior!r}, new={shared_metadata!r}"
            )

        eval_key = (nr.term_label, nr.class_number, nr.namen)
        if eval_key in evaluation_keys:
            raise ValidationError(
                f"Duplicate evaluation natural key: {eval_key!r}"
            )
        evaluation_keys.add(eval_key)

        if nr.row_hash in row_hashes:
            duplicate_row_hashes += 1
        row_hashes.add(nr.row_hash)

        instructor_ids.add(nr.namen)
        course_keys.add(nr.course_key)
        subjects.add(nr.subject)
        term_counts[nr.term_label] += 1
        campus_counts[nr.campus] += 1
        medium_counts[nr.medium] += 1
        class_size_counts[nr.class_size_category] += 1
        instrument_counts[nr.instrument] += 1
        total_responses += nr.n_responses
        total_invited += nr.invited_count

        display_names_by_namen.setdefault(nr.namen, set()).add(
            (nr.first_name, nr.last_name)
        )
        namen_by_display_name.setdefault((nr.first_name, nr.last_name), set()).add(
            nr.namen
        )

        if nr.catalog_unknown:
            catalog_na_rows += 1
        if nr.standard_deviation is None:
            if nr.instrument == "SSLE":
                ssle_sd_na += 1
            else:
                sei_sd_na += 1
        if nr.medium not in KNOWN_MEDIUMS:
            unknown_medium_rows += 1
        if nr.campus not in KNOWN_CAMPUSES:
            unknown_campus_rows += 1
        if nr.class_size_category not in KNOWN_CLASS_SIZE_CATEGORIES:
            unknown_class_size_rows += 1
        if not NAMEN_RE.fullmatch(nr.namen):
            unusual_namen_rows += 1

        min_rating = nr.rating if min_rating is None else min(min_rating, nr.rating)
        max_rating = nr.rating if max_rating is None else max(max_rating, nr.rating)

    if expected_rows is not None and rows != expected_rows:
        raise ValidationError(
            f"Expected {expected_rows:,} rows, parsed {rows:,}"
        )

    pooled_response_rate = (
        (Decimal(total_responses) / Decimal(total_invited)) * Decimal("100")
        if total_invited
        else Decimal("0")
    )

    result = {
        "rows": rows,
        "file_sha256": file_sha256(path),
        "file_size_bytes": path.stat().st_size,
        "sections": len(section_metadata),
        "evaluation_natural_keys": len(evaluation_keys),
        "instructors": len(instructor_ids),
        "course_keys": len(course_keys),
        "subjects": len(subjects),
        "terms": dict(sorted(term_counts.items())),
        "campuses": dict(campus_counts.most_common()),
        "mediums": dict(medium_counts.most_common()),
        "class_size_categories": dict(class_size_counts.most_common()),
        "instruments": dict(instrument_counts),
        "total_responses": total_responses,
        "total_invited": total_invited,
        "pooled_response_rate": str(pooled_response_rate.quantize(Decimal("0.01"))),
        "rating_min": str(min_rating) if min_rating is not None else None,
        "rating_max": str(max_rating) if max_rating is not None else None,
        "exact_duplicate_row_hashes": duplicate_row_hashes,
        "catalog_na_rows": catalog_na_rows,
        "sei_standard_deviation_na_rows": sei_sd_na,
        "ssle_standard_deviation_na_rows": ssle_sd_na,
        "namen_with_multiple_display_names": sum(
            1 for values in display_names_by_namen.values() if len(values) > 1
        ),
        "display_names_shared_by_multiple_namen": sum(
            1 for values in namen_by_display_name.values() if len(values) > 1
        ),
        "extra_fields": dict(extra_fields),
        "warning_counts": {
            "unknown_medium_rows": unknown_medium_rows,
            "unknown_campus_rows": unknown_campus_rows,
            "unknown_class_size_rows": unknown_class_size_rows,
            "unusual_namen_rows": unusual_namen_rows,
        },
    }
    return result


def require_psycopg():
    try:
        import psycopg  # type: ignore
    except ImportError as exc:
        raise SystemExit(
            'psycopg is required for database import. Install it with:\n'
            '  python -m pip install "psycopg[binary]>=3.2"\n'
            "Validation-only mode does not require psycopg."
        ) from exc
    return psycopg


def init_schema(conn, schema_path: Path) -> None:
    sql_text = schema_path.read_text(encoding="utf-8")
    # psycopg supports multi-statement execution for a plain SQL string.
    with conn.cursor() as cur:
        cur.execute(sql_text)


def get_or_create_source(conn, args) -> int:
    metadata = {
        "block_id": args.block_id,
        "datasource_id": args.datasource_id,
        "dataset_name": args.dataset_name,
    }
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO osu_eval.source_dataset
                (source_code, name, provider, base_url, block_id, datasource_id, metadata)
            VALUES
                (%s, %s, 'Explorance Blue', %s, %s, %s, %s::jsonb)
            ON CONFLICT (source_code) DO UPDATE SET
                name = EXCLUDED.name,
                base_url = EXCLUDED.base_url,
                block_id = EXCLUDED.block_id,
                datasource_id = EXCLUDED.datasource_id,
                metadata = EXCLUDED.metadata,
                updated_at = now()
            RETURNING id
            """,
            (
                args.source_code,
                args.source_name,
                args.source_base_url,
                args.block_id,
                args.datasource_id,
                json.dumps(metadata),
            ),
        )
        return int(cur.fetchone()[0])


def create_or_resume_run(
    conn,
    source_id: int,
    file_path: Path,
    validation: Dict[str, Any],
    expected_rows: Optional[int],
) -> Tuple[int, bool]:
    digest = validation["file_sha256"]
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, status
            FROM osu_eval.ingest_run
            WHERE source_dataset_id = %s AND file_sha256 = %s
            """,
            (source_id, digest),
        )
        existing = cur.fetchone()
        if existing and existing[1] == "completed":
            return int(existing[0]), True

        if existing:
            run_id = int(existing[0])
            cur.execute(
                """
                UPDATE osu_eval.ingest_run
                SET file_name = %s,
                    source_reported_rows = %s,
                    rows_read = 0,
                    rows_loaded = 0,
                    status = 'running',
                    validation_summary = %s::jsonb,
                    error_message = NULL,
                    started_at = now(),
                    completed_at = NULL
                WHERE id = %s
                """,
                (
                    file_path.name,
                    expected_rows,
                    json.dumps(validation),
                    run_id,
                ),
            )
            return run_id, False

        cur.execute(
            """
            INSERT INTO osu_eval.ingest_run
                (source_dataset_id, file_name, file_sha256, source_reported_rows,
                 rows_read, rows_loaded, status, validation_summary)
            VALUES
                (%s, %s, %s, %s, 0, 0, 'running', %s::jsonb)
            RETURNING id
            """,
            (
                source_id,
                file_path.name,
                digest,
                expected_rows,
                json.dumps(validation),
            ),
        )
        return int(cur.fetchone()[0]), False


def create_staging_table(cur) -> None:
    cur.execute(
        """
        CREATE TEMP TABLE stg_blue_evaluation (
            row_number              integer NOT NULL,
            row_hash                char(64) NOT NULL,
            natural_key_hash        char(64) NOT NULL,
            last_name               text NOT NULL,
            first_name              text NOT NULL,
            subject                 varchar(32) NOT NULL,
            catalog_raw             varchar(64) NOT NULL,
            catalog                 varchar(64),
            course_key              text NOT NULL,
            catalog_unknown         boolean NOT NULL,
            class_title             text NOT NULL,
            class_number            varchar(16) NOT NULL,
            term_label              varchar(8) NOT NULL,
            term_season             char(2) NOT NULL,
            term_year               smallint NOT NULL,
            term_sort_key           integer NOT NULL,
            college                 text NOT NULL,
            department              text NOT NULL,
            medium                  text NOT NULL,
            campus                  varchar(16) NOT NULL,
            class_size_category     varchar(16) NOT NULL,
            n_responses             integer NOT NULL,
            rating                  numeric(4,2) NOT NULL,
            standard_deviation      numeric(4,2),
            invited_count           integer NOT NULL,
            response_ratio          numeric(5,2) NOT NULL,
            namen                   varchar(128) NOT NULL,
            instrument              varchar(16) NOT NULL,
            metric_kind             varchar(64) NOT NULL,
            payload_text            text NOT NULL
        ) ON COMMIT DROP
        """
    )


def copy_to_staging(cur, file_path: Path) -> int:
    columns = """
        row_number, row_hash, natural_key_hash, last_name, first_name,
        subject, catalog_raw, catalog, course_key, catalog_unknown,
        class_title, class_number, term_label, term_season, term_year,
        term_sort_key, college, department, medium, campus,
        class_size_category, n_responses, rating, standard_deviation,
        invited_count, response_ratio, namen, instrument, metric_kind,
        payload_text
    """
    count = 0
    with cur.copy(
        f"COPY stg_blue_evaluation ({columns}) FROM STDIN"
    ) as copy:
        for nr in iter_normalized_rows(file_path):
            copy.write_row(
                (
                    nr.row_number,
                    nr.row_hash,
                    nr.natural_key_hash,
                    nr.last_name,
                    nr.first_name,
                    nr.subject,
                    nr.catalog_raw,
                    nr.catalog,
                    nr.course_key,
                    nr.catalog_unknown,
                    nr.class_title,
                    nr.class_number,
                    nr.term_label,
                    nr.term_season,
                    nr.term_year,
                    nr.term_sort_key,
                    nr.college,
                    nr.department,
                    nr.medium,
                    nr.campus,
                    nr.class_size_category,
                    nr.n_responses,
                    nr.rating,
                    nr.standard_deviation,
                    nr.invited_count,
                    nr.response_ratio,
                    nr.namen,
                    nr.instrument,
                    nr.metric_kind,
                    nr.payload_text,
                )
            )
            count += 1
    return count


def normalize_staging(cur, run_id: int, source_id: int) -> None:
    # Raw snapshot.
    cur.execute(
        """
        INSERT INTO osu_eval.raw_evaluation_row
            (run_id, row_number, row_hash, natural_key_hash,
             term_label, class_number, instructor_name_dot,
             subject_code, catalog_raw, payload)
        SELECT
            %s, row_number, row_hash, natural_key_hash,
            term_label, class_number, namen,
            subject, catalog_raw, payload_text::jsonb
        FROM stg_blue_evaluation
        ORDER BY row_number
        """,
        (run_id,),
    )

    # Terms and subjects.
    cur.execute(
        """
        INSERT INTO osu_eval.term (label, season, calendar_year, sort_key)
        SELECT DISTINCT term_label, term_season, term_year, term_sort_key
        FROM stg_blue_evaluation
        ON CONFLICT (label) DO UPDATE SET
            season = EXCLUDED.season,
            calendar_year = EXCLUDED.calendar_year,
            sort_key = EXCLUDED.sort_key
        """
    )
    cur.execute(
        """
        INSERT INTO osu_eval.subject (code)
        SELECT DISTINCT subject
        FROM stg_blue_evaluation
        ON CONFLICT (code) DO NOTHING
        """
    )

    # Courses.
    cur.execute(
        """
        INSERT INTO osu_eval.course
            (subject_id, catalog, catalog_raw, course_key, catalog_unknown)
        SELECT DISTINCT
            subj.id,
            s.catalog,
            s.catalog_raw,
            s.course_key,
            s.catalog_unknown
        FROM stg_blue_evaluation s
        JOIN osu_eval.subject subj ON subj.code = s.subject
        ON CONFLICT (course_key) DO UPDATE SET
            catalog = EXCLUDED.catalog,
            catalog_raw = EXCLUDED.catalog_raw,
            catalog_unknown = EXCLUDED.catalog_unknown,
            updated_at = now()
        """
    )

    # Instructors: choose the latest observed row in the imported snapshot.
    cur.execute(
        """
        WITH latest AS (
            SELECT DISTINCT ON (namen)
                namen, first_name, last_name, term_sort_key
            FROM stg_blue_evaluation
            ORDER BY namen, term_sort_key DESC, row_number DESC
        )
        INSERT INTO osu_eval.instructor
            (name_dot_number, current_first_name, current_last_name,
             current_name_sort_key, first_seen_run_id, last_seen_run_id)
        SELECT
            namen, first_name, last_name, term_sort_key, %s, %s
        FROM latest
        ON CONFLICT (name_dot_number) DO UPDATE SET
            current_first_name = CASE
                WHEN EXCLUDED.current_name_sort_key >= osu_eval.instructor.current_name_sort_key
                THEN EXCLUDED.current_first_name
                ELSE osu_eval.instructor.current_first_name
            END,
            current_last_name = CASE
                WHEN EXCLUDED.current_name_sort_key >= osu_eval.instructor.current_name_sort_key
                THEN EXCLUDED.current_last_name
                ELSE osu_eval.instructor.current_last_name
            END,
            current_name_sort_key = GREATEST(
                osu_eval.instructor.current_name_sort_key,
                EXCLUDED.current_name_sort_key
            ),
            last_seen_run_id = %s,
            updated_at = now()
        """,
        (run_id, run_id, run_id),
    )

    # Instructor display-name observations.
    cur.execute(
        """
        INSERT INTO osu_eval.instructor_name_observation
            (instructor_id, term_id, first_name, last_name,
             first_seen_run_id, last_seen_run_id)
        SELECT DISTINCT
            i.id, t.id, s.first_name, s.last_name, %s, %s
        FROM stg_blue_evaluation s
        JOIN osu_eval.instructor i ON i.name_dot_number = s.namen
        JOIN osu_eval.term t ON t.label = s.term_label
        ON CONFLICT (instructor_id, term_id, first_name, last_name)
        DO UPDATE SET last_seen_run_id = %s
        """,
        (run_id, run_id, run_id),
    )

    # Sections.
    cur.execute(
        """
        INSERT INTO osu_eval.section
            (term_id, class_number, course_id, class_title, college, department,
             delivery_mode, campus_code, class_size_category,
             first_seen_run_id, last_seen_run_id)
        SELECT DISTINCT
            t.id,
            s.class_number,
            c.id,
            s.class_title,
            s.college,
            s.department,
            s.medium,
            s.campus,
            s.class_size_category,
            %s,
            %s
        FROM stg_blue_evaluation s
        JOIN osu_eval.term t ON t.label = s.term_label
        JOIN osu_eval.course c ON c.course_key = s.course_key
        ON CONFLICT (term_id, class_number) DO UPDATE SET
            course_id = EXCLUDED.course_id,
            class_title = EXCLUDED.class_title,
            college = EXCLUDED.college,
            department = EXCLUDED.department,
            delivery_mode = EXCLUDED.delivery_mode,
            campus_code = EXCLUDED.campus_code,
            class_size_category = EXCLUDED.class_size_category,
            last_seen_run_id = %s,
            updated_at = now()
        """,
        (run_id, run_id, run_id),
    )

    # Evaluations.
    cur.execute(
        """
        INSERT INTO osu_eval.evaluation
            (section_id, instructor_id, instrument, metric_kind,
             n_responses, rating, standard_deviation, invited_count,
             response_ratio, source_row_hash,
             first_seen_run_id, last_seen_run_id)
        SELECT
            sec.id,
            i.id,
            s.instrument,
            s.metric_kind,
            s.n_responses,
            s.rating,
            s.standard_deviation,
            s.invited_count,
            s.response_ratio,
            s.row_hash,
            %s,
            %s
        FROM stg_blue_evaluation s
        JOIN osu_eval.term t ON t.label = s.term_label
        JOIN osu_eval.section sec
          ON sec.term_id = t.id AND sec.class_number = s.class_number
        JOIN osu_eval.instructor i ON i.name_dot_number = s.namen
        ON CONFLICT (section_id, instructor_id) DO UPDATE SET
            instrument = EXCLUDED.instrument,
            metric_kind = EXCLUDED.metric_kind,
            n_responses = EXCLUDED.n_responses,
            rating = EXCLUDED.rating,
            standard_deviation = EXCLUDED.standard_deviation,
            invited_count = EXCLUDED.invited_count,
            response_ratio = EXCLUDED.response_ratio,
            source_row_hash = EXCLUDED.source_row_hash,
            last_seen_run_id = %s,
            updated_at = now()
        """,
        (run_id, run_id, run_id),
    )

    # For this source, only terms actually included in this snapshot are used
    # when deactivating missing rows. This avoids retiring old archived terms
    # merely because a future rolling datasource window starts later.
    cur.execute(
        """
        UPDATE osu_eval.evaluation_source_state ess
        SET active = false
        FROM osu_eval.evaluation e
        JOIN osu_eval.section sec ON sec.id = e.section_id
        JOIN osu_eval.term t ON t.id = sec.term_id
        WHERE ess.evaluation_id = e.id
          AND ess.source_dataset_id = %s
          AND t.label IN (
              SELECT DISTINCT term_label FROM stg_blue_evaluation
          )
        """,
        (source_id,),
    )

    cur.execute(
        """
        INSERT INTO osu_eval.evaluation_source_state
            (evaluation_id, source_dataset_id, first_seen_run_id,
             last_seen_run_id, last_row_hash, active)
        SELECT
            e.id,
            %s,
            %s,
            %s,
            s.row_hash,
            true
        FROM stg_blue_evaluation s
        JOIN osu_eval.term t ON t.label = s.term_label
        JOIN osu_eval.section sec
          ON sec.term_id = t.id AND sec.class_number = s.class_number
        JOIN osu_eval.instructor i ON i.name_dot_number = s.namen
        JOIN osu_eval.evaluation e
          ON e.section_id = sec.id AND e.instructor_id = i.id
        ON CONFLICT (evaluation_id, source_dataset_id) DO UPDATE SET
            last_seen_run_id = EXCLUDED.last_seen_run_id,
            last_row_hash = EXCLUDED.last_row_hash,
            active = true
        """,
        (source_id, run_id, run_id),
    )


def refresh_views(cur) -> None:
    cur.execute("REFRESH MATERIALIZED VIEW osu_eval.mv_instructor_course_summary")
    cur.execute("REFRESH MATERIALIZED VIEW osu_eval.mv_instructor_summary")


def count_loaded(cur, run_id: int) -> int:
    cur.execute(
        "SELECT count(*) FROM osu_eval.raw_evaluation_row WHERE run_id = %s",
        (run_id,),
    )
    return int(cur.fetchone()[0])


def import_file(args, validation: Dict[str, Any]) -> None:
    psycopg = require_psycopg()

    file_path = Path(args.file).resolve()
    schema_path = Path(args.schema).resolve()

    with psycopg.connect(args.dsn) as conn:
        if args.init_schema:
            print(f"[db] initializing schema from {schema_path}")
            init_schema(conn, schema_path)
            conn.commit()

        # Create/resume the run in a small committed transaction so failures
        # can be recorded without leaving partial normalized data.
        with conn.transaction():
            source_id = get_or_create_source(conn, args)
            run_id, already_completed = create_or_resume_run(
                conn,
                source_id,
                file_path,
                validation,
                args.expected_rows,
            )

        if already_completed:
            print(
                f"[db] identical file already imported successfully as run {run_id}; "
                "nothing to do."
            )
            return

        try:
            with conn.transaction():
                with conn.cursor() as cur:
                    print(f"[db] staging {validation['rows']:,} rows...")
                    create_staging_table(cur)
                    staged = copy_to_staging(cur, file_path)
                    if staged != validation["rows"]:
                        raise RuntimeError(
                            f"second-pass row count changed: validated "
                            f"{validation['rows']}, staged {staged}"
                        )

                    print("[db] normalizing/upserting...")
                    normalize_staging(cur, run_id, source_id)
                    loaded = count_loaded(cur, run_id)
                    if loaded != validation["rows"]:
                        raise RuntimeError(
                            f"raw loaded rows {loaded} != validated rows "
                            f"{validation['rows']}"
                        )

                    if not args.no_refresh:
                        print("[db] refreshing materialized views...")
                        refresh_views(cur)

                    cur.execute(
                        """
                        UPDATE osu_eval.ingest_run
                        SET rows_read = %s,
                            rows_loaded = %s,
                            status = 'completed',
                            completed_at = now(),
                            error_message = NULL
                        WHERE id = %s
                        """,
                        (validation["rows"], loaded, run_id),
                    )

            print(
                f"[ok] import completed: run={run_id}, rows={validation['rows']:,}"
            )

        except Exception as exc:
            # Main transaction rolls back. Persist failure status separately.
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        UPDATE osu_eval.ingest_run
                        SET status = 'failed',
                            error_message = %s,
                            completed_at = now()
                        WHERE id = %s
                        """,
                        (str(exc)[:4000], run_id),
                    )
            raise


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Validate/import OSU Blue SEI/SSLE JSONL into PostgreSQL."
    )
    parser.add_argument(
        "--file",
        default=str(DEFAULT_SNAPSHOT_PATH),
        help="Path to JSONL export (defaults to the repository raw snapshot)",
    )
    parser.add_argument("--dsn", help="PostgreSQL DSN/URL")
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="Validate and profile the JSONL without connecting to PostgreSQL",
    )
    parser.add_argument(
        "--expected-rows",
        type=int,
        default=None,
        help=(
            "Source-reported expected row count, e.g. 68729. "
            "Required for database imports unless --allow-unverified-count is used."
        ),
    )
    parser.add_argument(
        "--allow-unverified-count",
        action="store_true",
        help=(
            "Allow a database import without a source-reported row count. "
            "Not recommended for production snapshots."
        ),
    )
    parser.add_argument(
        "--init-schema",
        action="store_true",
        help="Create/update schema before importing",
    )
    parser.add_argument(
        "--schema",
        default=str(DEFAULT_SCHEMA_PATH),
        help="Schema SQL path used with --init-schema (defaults to db/schema.sql)",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Skip materialized-view refresh after import",
    )

    parser.add_argument("--source-code", default=SOURCE_CODE_DEFAULT)
    parser.add_argument("--source-name", default=SOURCE_NAME_DEFAULT)
    parser.add_argument("--source-base-url", default=SOURCE_BASE_URL_DEFAULT)
    parser.add_argument("--block-id", default=BLOCK_ID_DEFAULT)
    parser.add_argument("--datasource-id", default=DATASOURCE_ID_DEFAULT)
    parser.add_argument(
        "--dataset-name",
        default="SEI and SSLE Results Summer 2022 - Summer 2026",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    file_path = Path(args.file).resolve()

    if not file_path.exists():
        parser.error(f"file does not exist: {file_path}")

    print(f"[validate] {file_path}")
    validation = validate_file(file_path, args.expected_rows)
    print(json.dumps(validation, indent=2, ensure_ascii=False))

    if args.validate_only:
        print("[ok] validation only; no database changes made.")
        return

    if not args.dsn:
        parser.error("--dsn is required unless --validate-only is used")
    if args.expected_rows is None and not args.allow_unverified_count:
        parser.error(
            "--expected-rows is required for database imports so a partial scrape "
            "cannot deactivate missing source rows. Use --allow-unverified-count "
            "only if you intentionally accept that risk."
        )

    import_file(args, validation)


if __name__ == "__main__":
    main()
