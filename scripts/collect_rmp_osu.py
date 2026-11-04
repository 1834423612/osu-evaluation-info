#!/usr/bin/env python3
"""Collect authorized OSU Rate My Professors profiles and reviews slowly."""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql"
SOURCE_PAGE = "https://www.ratemyprofessors.com/school/724"
SCHEMA_PATH = ROOT / "db" / "rmp_schema.sql"
COLLECTOR_SCHEMA_PATH = ROOT / "db" / "rmp_collector_schema.sql"
MIN_REQUEST_INTERVAL = 10.0
MAX_PAGE_SIZE = 100
SCHOOLS = (
    (724, "U2Nob29sLTcyNA==", "COL", "Columbus"),
    (726, "U2Nob29sLTcyNg==", "MNS", "Mansfield"),
    (725, "U2Nob29sLTcyNQ==", "LMA", "Lima"),
    (723, "U2Nob29sLTcyMw==", "MRN", "Marion"),
    (2610, "U2Nob29sLTI2MTA=", "NWK", "Newark"),
    (5207, "U2Nob29sLTUyMDc=", "WST", "Wooster / ATI"),
)

SEARCH_QUERY = """query TeacherSearchPaginationQuery(
  $count: Int!, $cursor: String, $query: TeacherSearchQuery!
) {
  search: newSearch {
    teachers(query: $query, first: $count, after: $cursor) {
      edges {
        cursor
        node {
          id legacyId firstName lastName department departmentId
          avgRating avgDifficulty numRatings wouldTakeAgainPercent
          school { id legacyId name city state }
        }
      }
      pageInfo { hasNextPage endCursor }
      resultCount
    }
  }
}"""

REVIEW_FIELDS = """id legacyId comment date class helpfulRating clarityRating
  difficultyRating isForOnlineClass ratingTags attendanceMandatory
  wouldTakeAgain grade textbookUse isForCredit createdByUser flagStatus
  adminReviewedAt thumbsUpTotal thumbsDownTotal
  teacherNote { id teacherId comment createdAt updatedAt legacyId flagStatus }"""


class CollectionError(RuntimeError):
    pass


class RequestLimitReached(RuntimeError):
    pass


def validate_page_progress(
    current_cursor: str | None,
    next_cursor: str | None,
    has_next_page: bool,
    edges: list[Any],
    scope: str,
    previous_cursor: str | None = None,
) -> None:
    """Reject pages that cannot make forward progress or prove completeness."""
    if not has_next_page:
        return
    if not edges:
        raise CollectionError(f"RMP returned an empty page with hasNextPage for {scope}.")
    if not next_cursor:
        raise CollectionError(f"RMP omitted endCursor while paging {scope}.")
    if next_cursor == current_cursor or next_cursor == previous_cursor:
        raise CollectionError(f"RMP cursor did not advance while paging {scope}.")
    edge_cursors = [edge.get("cursor") for edge in edges if isinstance(edge, dict)]
    if edge_cursors and len(edge_cursors) != len(set(edge_cursors)):
        raise CollectionError(f"RMP returned duplicate edge cursors while paging {scope}.")
    if len(edge_cursors) != len(edges) or not edge_cursors or edge_cursors[-1] != next_cursor:
        raise CollectionError(f"RMP returned inconsistent edge/end cursors while paging {scope}.")


def save_page_cursor(
    conn, run_id: int, scope: str, entity_id: int,
    current_cursor: str | None, next_cursor: str | None,
) -> None:
    """Persist visited cursors so cycles stay detectable after process restarts."""
    if next_cursor and conn.execute(
        "SELECT 1 FROM osu_rmp.page_cursor "
        "WHERE run_id = %s AND scope = %s AND entity_id = %s AND cursor = %s",
        (run_id, scope, entity_id, next_cursor),
    ).fetchone():
        raise CollectionError(f"RMP cursor cycle detected for {scope} {entity_id}.")
    inserted = conn.execute(
        "INSERT INTO osu_rmp.page_cursor (run_id, scope, entity_id, cursor) "
        "VALUES (%s, %s, %s, %s) ON CONFLICT DO NOTHING RETURNING cursor",
        (run_id, scope, entity_id, current_cursor or "__first_page__"),
    ).fetchone()
    if not inserted:
        raise CollectionError(f"RMP repeated a committed page for {scope} {entity_id}.")


def mark_inactive_rows(conn, run_id: int) -> None:
    """Soft-delete reviews absent from a completed full review snapshot."""
    conn.execute(
        "UPDATE osu_rmp.review SET active = false, updated_at = now() "
        "WHERE last_seen_run_id <> %s AND active",
        (run_id,),
    )


def mark_missing_professors(conn, run_id: int) -> None:
    """Reconcile professor presence only after all six searches validate."""
    conn.execute(
        "UPDATE osu_rmp.professor SET active = false, status = 'missing_from_source', updated_at = now() "
        "WHERE last_seen_run_id <> %s AND active",
        (run_id,),
    )


def validate_run_counts(conn, run_id: int) -> dict[str, int | bool]:
    """Return run-level counts and count-mismatch diagnostics."""
    row = conn.execute(
        """SELECT count(*) AS professors,
                  coalesce(sum(expected_count), 0) AS expected_reviews,
                  coalesce(sum(reviews_loaded), 0) AS loaded_reviews,
                  coalesce(sum(stored_count), 0) AS stored_reviews,
                  count(*) FILTER (WHERE reviews_complete) AS complete_professors,
                  count(*) FILTER (WHERE reviews_complete AND stored_count < expected_count) AS short_professors
           FROM osu_rmp.run_professor WHERE run_id = %s""",
        (run_id,),
    ).fetchone()
    result = {
        "professors": int(row[0]),
        "expected_reviews": int(row[1]),
        "loaded_reviews": int(row[2]),
        "stored_reviews": int(row[3]),
        "complete_professors": int(row[4]),
        "short_professors": int(row[5]),
    }
    result["expected_professors"] = int(
        conn.execute(
            "SELECT coalesce(sum(result_count), 0) FROM osu_rmp.run_school WHERE run_id = %s",
            (run_id,),
        ).fetchone()[0]
    )
    result["count_differences"] = int(
        conn.execute(
            "SELECT count(*) FROM osu_rmp.run_professor "
            "WHERE run_id = %s AND stored_count <> expected_count",
            (run_id,),
        ).fetchone()[0]
    )
    return result


def load_database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if value:
        return value
    env_path = ROOT / ".env.local"
    if env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            key, sep, raw = line.partition("=")
            if sep and key.strip() == "DATABASE_URL":
                return raw.strip().strip("\"'")
    raise CollectionError("DATABASE_URL is missing from the environment and .env.local.")


def require_psycopg():
    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except ImportError as exc:
        raise CollectionError(
            "Install the PostgreSQL driver with: python3 -m pip install 'psycopg[binary]>=3.2'"
        ) from exc
    return psycopg, Jsonb


def json_value(value: Any) -> Any:
    return Jsonb(value if value is not None else {})


def nullable_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "yes", "1"}:
            return True
        if normalized in {"false", "no", "0"}:
            return False
    raise CollectionError("RMP returned an unrecognized boolean value.")


def nullable_text(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def parse_retry_after(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
            return max(0.0, (parsed - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None


class GraphQLClient:
    def __init__(
        self,
        conn,
        run_id: int,
        last_request_epoch: float | None,
        interval: float,
        max_requests: int,
        page_size: int,
        batch_size: int,
    ):
        self.conn = conn
        self.run_id = run_id
        self.last_request_epoch = last_request_epoch or 0.0
        self.interval = interval
        self.requests_made = 0
        self.max_requests = max_requests
        self.page_size = page_size
        self.batch_size = batch_size
        self.at_limit = False

    def _wait(self, seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)

    def request(self, operation_name: str, query: str, variables: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(
            {"operationName": operation_name, "query": query, "variables": variables},
            separators=(",", ":"),
        ).encode("utf-8")
        backoff = self.interval
        for attempt in range(5):
            if self.max_requests and self.requests_made >= self.max_requests:
                self.at_limit = True
                raise RequestLimitReached
            wait_for = max(self.interval - (time.time() - self.last_request_epoch), 0.0)
            self._wait(wait_for)
            now = time.time()
            self.conn.commit()
            with self.conn.transaction():
                self.conn.execute(
                    "UPDATE osu_rmp.collection_run SET last_request_epoch = %s, updated_at = now() WHERE id = %s",
                    (now, self.run_id),
                )
            self.last_request_epoch = now
            request = urllib.request.Request(
                GRAPHQL_URL,
                data=body,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                    "Origin": "https://www.ratemyprofessors.com",
                    "Referer": SOURCE_PAGE,
                    "User-Agent": "osu-eval-rmp-collector/1.0 (authorized; 10-second minimum interval)",
                },
                method="POST",
            )
            self.requests_made += 1
            try:
                with urllib.request.urlopen(request, timeout=40) as response:
                    payload = json.loads(response.read())
                    if response.status != 200:
                        raise CollectionError(f"RMP returned HTTP {response.status}.")
            except urllib.error.HTTPError as exc:
                retry_after = parse_retry_after(exc.headers.get("Retry-After"))
                if exc.code in (429, 500, 502, 503, 504) and attempt < 4:
                    self._wait(max(self.interval, retry_after or backoff))
                    backoff = min(backoff * 2, 300.0)
                    continue
                raise CollectionError(f"RMP returned HTTP {exc.code}.") from None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
                if attempt < 4:
                    self._wait(backoff)
                    backoff = min(backoff * 2, 300.0)
                    continue
                raise CollectionError(f"RMP request failed after retries ({type(exc).__name__}).") from None
            errors = payload.get("errors") or []
            if errors:
                message = str(errors[0].get("message", "GraphQL error"))[:240]
                raise CollectionError(f"RMP GraphQL error for {operation_name}: {message}")
            if not isinstance(payload.get("data"), dict):
                raise CollectionError(f"RMP returned an invalid response for {operation_name}.")
            if self.max_requests and self.requests_made >= self.max_requests:
                self.at_limit = True
            return payload["data"]
        raise CollectionError("RMP retry limit reached.")


def build_review_batch_query(
    batch: list[dict[str, Any]], page_size: int = MAX_PAGE_SIZE
) -> tuple[str, dict[str, Any]]:
    if not batch:
        raise ValueError("A review batch cannot be empty.")
    declarations = ["$count: Int!"]
    selections: list[str] = []
    variables: dict[str, Any] = {"count": page_size}
    for index, item in enumerate(batch):
        id_name = f"id{index}"
        cursor_name = f"cursor{index}"
        alias = f"p{index}"
        declarations.extend((f"${id_name}: ID!", f"${cursor_name}: String"))
        variables[id_name] = item["graphql_id"]
        variables[cursor_name] = item["cursor"]
        selections.append(
            f"{alias}: node(id: ${id_name}) {{ __typename ... on Teacher {{"
            " id legacyId firstName lastName department departmentId lockStatus"
            " avgRating avgDifficulty numRatings wouldTakeAgainPercent"
            " ratingsDistribution { total r1 r2 r3 r4 r5 }"
            " teacherRatingTags { legacyId tagCount tagName id }"
            " courseCodes { courseName courseCount }"
            " school { id legacyId name city state }"
            f" ratings(first: $count, after: ${cursor_name}) {{"
            " edges { cursor node { "
            + REVIEW_FIELDS
            + " } } pageInfo { hasNextPage endCursor }"
            " } } }"
        )
    query = (
        "query BatchRatings(" + ", ".join(declarations) + ") { "
        + " ".join(selections)
        + " }"
    )
    return query, variables


def connect_database(dsn: str):
    psycopg, Jsonb = require_psycopg()
    conn = psycopg.connect(dsn, application_name="osu-rmp-collector")
    conn.execute("SET lock_timeout = '5s'")
    conn.execute("SET statement_timeout = '60s'")
    locked = conn.execute("SELECT pg_try_advisory_lock(7241102901)").fetchone()[0]
    conn.commit()
    if not locked:
        conn.close()
        raise CollectionError("Another RMP collector is already running; this run exited without waiting.")
    conn.execute(SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
    conn.execute(COLLECTOR_SCHEMA_PATH.read_text(encoding="utf-8"))
    conn.commit()
    return conn, Jsonb


def start_or_resume_run(
    conn, Jsonb, new_run: bool, full_refresh: bool = False
) -> tuple[int, float | None, bool]:
    if not new_run:
        row = conn.execute(
            "SELECT id, last_request_epoch, metadata FROM osu_rmp.collection_run "
            "WHERE status IN ('running', 'paused') "
            "AND COALESCE(metadata->>'superseded', 'false') <> 'true' "
            "ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if row and (not isinstance(row[2], dict) or row[2].get("collector_version") != 2):
            # Earlier runs did not retain cursor history or truthful actual counts.
            # Preserve their audit rows and begin a run that can be validated.
            conn.execute(
                "UPDATE osu_rmp.collection_run SET status = 'paused', last_error = %s, updated_at = now() WHERE id = %s",
                ("Legacy collector state cannot resume with current integrity checks.", row[0]),
            )
            conn.commit()
            row = None
        if row:
            saved_metadata = row[2] if isinstance(row[2], dict) else {}
            if full_refresh and not saved_metadata.get("full_refresh"):
                raise CollectionError(
                    "Cannot upgrade a paused incremental run to a full refresh. "
                    "Resume without --full-refresh, or use --new-run --full-refresh."
                )
            full_refresh = bool(saved_metadata.get("full_refresh"))
            conn.execute(
                "UPDATE osu_rmp.collection_run SET status = 'running', last_error = NULL, updated_at = now() WHERE id = %s",
                (row[0],),
            )
            conn.commit()
            return int(row[0]), row[1], full_refresh
    conn.execute(
        """UPDATE osu_rmp.collection_run
           SET metadata = metadata || '{"superseded":true}'::jsonb,
               last_error = COALESCE(last_error, 'Superseded by a newer collection run.'),
               updated_at = now()
           WHERE status IN ('running', 'paused')"""
    )
    metadata = {
        "source_url": SOURCE_PAGE,
        "provider": "Rate My Professors",
        "authorization_basis": "User confirmed prior authorization in this task",
        "request_interval_seconds": MIN_REQUEST_INTERVAL,
        "campuses": [{"legacy_id": sid, "code": code, "label": label} for sid, _, code, label in SCHOOLS],
        "started_at_utc": datetime.now(timezone.utc).isoformat(),
        "full_refresh": full_refresh,
        "collector_version": 2,
    }
    row = conn.execute(
        "INSERT INTO osu_rmp.collection_run (status, metadata) VALUES ('running', %s) RETURNING id",
        (Jsonb(metadata),),
    ).fetchone()
    run_id = int(row[0])
    for legacy_id, graphql_id, code, label in SCHOOLS:
        conn.execute(
            """INSERT INTO osu_rmp.school (legacy_id, graphql_id, campus_code, name)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (legacy_id) DO UPDATE SET
                 graphql_id = EXCLUDED.graphql_id,
                 campus_code = EXCLUDED.campus_code,
                 name = CASE WHEN osu_rmp.school.name = '' THEN EXCLUDED.name ELSE osu_rmp.school.name END,
                 updated_at = now()""",
            (legacy_id, graphql_id, code, label),
        )
        conn.execute(
            "INSERT INTO osu_rmp.run_school (run_id, school_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (run_id, legacy_id),
        )
    conn.commit()
    return run_id, None, full_refresh


def upsert_school_from_professor(conn, run_id: int, school: dict[str, Any], Jsonb) -> None:
    if not school or school.get("legacyId") is None or not school.get("id"):
        return
    conn.execute(
        """INSERT INTO osu_rmp.school
             (legacy_id, graphql_id, campus_code, name, city, state, raw_payload)
           VALUES (%s, %s, 'UNK', %s, %s, %s, %s)
           ON CONFLICT (legacy_id) DO UPDATE SET
             graphql_id = EXCLUDED.graphql_id,
             name = EXCLUDED.name,
             city = EXCLUDED.city,
             state = EXCLUDED.state,
             raw_payload = EXCLUDED.raw_payload,
             updated_at = now()""",
        (
            int(school["legacyId"]),
            school["id"],
            school.get("name") or "Unknown RMP school",
            school.get("city"),
            school.get("state"),
            Jsonb(school),
        ),
    )


def upsert_professor(conn, run_id: int, teacher: dict[str, Any], Jsonb, profile: bool = False) -> int:
    legacy_id = teacher.get("legacyId")
    graphql_id = teacher.get("id")
    if legacy_id is None or not graphql_id:
        raise CollectionError("A professor record is missing its RMP identity.")
    school = teacher.get("school") or {}
    upsert_school_from_professor(conn, run_id, school, Jsonb)
    distribution = teacher.get("ratingsDistribution") or {}
    tags = teacher.get("teacherRatingTags") or []
    course_codes = teacher.get("courseCodes") or []
    raw_payload = dict(teacher)
    raw_payload.pop("ratings", None)
    conn.execute(
        """INSERT INTO osu_rmp.professor
             (legacy_id, graphql_id, first_name, last_name, department, department_id,
              avg_rating, avg_difficulty, would_take_again_percent, num_ratings,
              ratings_distribution, rating_tags, course_codes, lock_status,
              raw_payload, last_seen_run_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (legacy_id) DO UPDATE SET
             graphql_id = EXCLUDED.graphql_id,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             department = COALESCE(EXCLUDED.department, osu_rmp.professor.department),
             department_id = COALESCE(EXCLUDED.department_id, osu_rmp.professor.department_id),
             avg_rating = COALESCE(EXCLUDED.avg_rating, osu_rmp.professor.avg_rating),
             avg_difficulty = COALESCE(EXCLUDED.avg_difficulty, osu_rmp.professor.avg_difficulty),
             would_take_again_percent = COALESCE(EXCLUDED.would_take_again_percent, osu_rmp.professor.would_take_again_percent),
             num_ratings = EXCLUDED.num_ratings,
             ratings_distribution = CASE WHEN %s THEN EXCLUDED.ratings_distribution ELSE osu_rmp.professor.ratings_distribution END,
             rating_tags = CASE WHEN %s THEN EXCLUDED.rating_tags ELSE osu_rmp.professor.rating_tags END,
             course_codes = CASE WHEN %s THEN EXCLUDED.course_codes ELSE osu_rmp.professor.course_codes END,
             lock_status = COALESCE(EXCLUDED.lock_status, osu_rmp.professor.lock_status),
             raw_payload = CASE WHEN %s THEN EXCLUDED.raw_payload ELSE osu_rmp.professor.raw_payload END,
             last_seen_run_id = EXCLUDED.last_seen_run_id,
             active = true,
             status = 'active',
             updated_at = now()""",
        (
            int(legacy_id), graphql_id, teacher.get("firstName") or "", teacher.get("lastName") or "",
            teacher.get("department"), teacher.get("departmentId"), teacher.get("avgRating"),
            teacher.get("avgDifficulty"), teacher.get("wouldTakeAgainPercent"),
            int(teacher.get("numRatings") or 0), Jsonb(distribution), Jsonb(tags), Jsonb(course_codes),
            teacher.get("lockStatus"), Jsonb(raw_payload), run_id,
            profile, profile, profile, profile,
        ),
    )
    school_id = school.get("legacyId")
    if school_id is not None:
        conn.execute(
            """INSERT INTO osu_rmp.professor_school
                 (professor_id, school_id, first_seen_run_id, last_seen_run_id)
               VALUES (%s, %s, %s, %s)
               ON CONFLICT (professor_id, school_id) DO UPDATE SET last_seen_run_id = EXCLUDED.last_seen_run_id""",
            (int(legacy_id), int(school_id), run_id, run_id),
        )
    return int(legacy_id)


def upsert_review(conn, run_id: int, professor_id: int, review: dict[str, Any], Jsonb) -> None:
    if review.get("legacyId") is None or not review.get("id"):
        raise CollectionError("A review record is missing its RMP identity.")
    teacher_note = review.get("teacherNote")
    conn.execute(
        """INSERT INTO osu_rmp.review
             (legacy_id, graphql_id, professor_id, date_text, class_name, comment,
              helpful_rating, clarity_rating, difficulty_rating, rating_tags,
              attendance_mandatory, would_take_again, grade, textbook_use,
              is_for_online_class, is_for_credit, created_by_user, flag_status,
              admin_reviewed_at, thumbs_up_total, thumbs_down_total, teacher_note,
              raw_payload, last_seen_run_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (legacy_id) DO UPDATE SET
             graphql_id = EXCLUDED.graphql_id,
             professor_id = EXCLUDED.professor_id,
             date_text = EXCLUDED.date_text,
             class_name = EXCLUDED.class_name,
             comment = EXCLUDED.comment,
             helpful_rating = EXCLUDED.helpful_rating,
             clarity_rating = EXCLUDED.clarity_rating,
             difficulty_rating = EXCLUDED.difficulty_rating,
             rating_tags = EXCLUDED.rating_tags,
             attendance_mandatory = EXCLUDED.attendance_mandatory,
             would_take_again = EXCLUDED.would_take_again,
             grade = EXCLUDED.grade,
             textbook_use = EXCLUDED.textbook_use,
             is_for_online_class = EXCLUDED.is_for_online_class,
             is_for_credit = EXCLUDED.is_for_credit,
             created_by_user = EXCLUDED.created_by_user,
             flag_status = EXCLUDED.flag_status,
             admin_reviewed_at = EXCLUDED.admin_reviewed_at,
             thumbs_up_total = EXCLUDED.thumbs_up_total,
             thumbs_down_total = EXCLUDED.thumbs_down_total,
             teacher_note = EXCLUDED.teacher_note,
             raw_payload = EXCLUDED.raw_payload,
             last_seen_run_id = EXCLUDED.last_seen_run_id,
             active = true,
             updated_at = now()""",
        (
            int(review["legacyId"]), review["id"], professor_id,
            review.get("date"), review.get("class"), review.get("comment"),
            review.get("helpfulRating"), review.get("clarityRating"), review.get("difficultyRating"),
            Jsonb(review.get("ratingTags") or []), nullable_text(review.get("attendanceMandatory")),
            nullable_bool(review.get("wouldTakeAgain")), review.get("grade"), nullable_text(review.get("textbookUse")),
            nullable_bool(review.get("isForOnlineClass")), nullable_bool(review.get("isForCredit")),
            nullable_bool(review.get("createdByUser")),
            review.get("flagStatus"), review.get("adminReviewedAt"),
            int(review.get("thumbsUpTotal") or 0), int(review.get("thumbsDownTotal") or 0),
            Jsonb(teacher_note) if teacher_note is not None else None,
            Jsonb(review), run_id,
        ),
    )


def collect_search_pages(conn, Jsonb, client: GraphQLClient, run_id: int) -> None:
    for legacy_id, graphql_id, campus_code, campus_name in SCHOOLS:
        progress = conn.execute(
            "SELECT cursor, complete, previous_cursor FROM osu_rmp.run_school WHERE run_id = %s AND school_id = %s",
            (run_id, legacy_id),
        ).fetchone()
        conn.commit()
        cursor, complete, previous_cursor = progress
        while not complete:
            if client.at_limit:
                return
            data = client.request(
                "TeacherSearchPaginationQuery",
                SEARCH_QUERY,
                {
                    "count": client.page_size,
                    "cursor": cursor,
                    "query": {"text": "", "schoolID": graphql_id, "fallback": True, "departmentID": ""},
                },
            )
            connection = data.get("search", {}).get("teachers")
            if not isinstance(connection, dict):
                raise CollectionError(f"Invalid teacher page for RMP campus {campus_name}.")
            result_count = int(connection.get("resultCount") or 0)
            edges = connection.get("edges") or []
            page_info = connection.get("pageInfo") or {}
            has_next = bool(page_info.get("hasNextPage"))
            next_cursor = page_info.get("endCursor") if has_next else None
            validate_page_progress(
                cursor,
                next_cursor,
                has_next,
                edges,
                f"campus {campus_name}",
                previous_cursor,
            )
            with conn.transaction():
                save_page_cursor(conn, run_id, "school", legacy_id, cursor, next_cursor)
                teacher_ids = [
                    int(edge["node"]["legacyId"])
                    for edge in edges
                    if (edge.get("node") or {}).get("legacyId") is not None
                ]
                previous = {
                    int(row[0]): tuple(float(value) if value is not None else None for value in row[1:])
                    for row in conn.execute(
                        "SELECT legacy_id, num_ratings, avg_rating, avg_difficulty, would_take_again_percent "
                        "FROM osu_rmp.professor WHERE legacy_id = ANY(%s)",
                        (teacher_ids,),
                    ).fetchall()
                }
                conn.execute(
                    "UPDATE osu_rmp.school SET search_result_count = %s, updated_at = now() WHERE legacy_id = %s",
                    (result_count, legacy_id),
                )
                for edge in edges:
                    teacher = edge.get("node") or {}
                    if not teacher:
                        continue
                    professor_id = upsert_professor(conn, run_id, teacher, Jsonb)
                    total = int(teacher.get("numRatings") or 0)
                    signature = tuple(
                        float(value) if value is not None else None
                        for value in (total, teacher.get("avgRating"), teacher.get("avgDifficulty"), teacher.get("wouldTakeAgainPercent"))
                    )
                    conn.execute(
                        """INSERT INTO osu_rmp.run_professor
                               (run_id, professor_id, expected_count, source_changed)
                           VALUES (%s, %s, %s, %s)
                           ON CONFLICT (run_id, professor_id) DO NOTHING""",
                        (run_id, professor_id, total, previous.get(professor_id) != signature),
                    )
                conn.execute(
                    """UPDATE osu_rmp.run_school
                       SET previous_cursor = cursor, cursor = %s, page_count = page_count + 1, result_count = %s,
                           expected_count = %s, loaded_count = loaded_count + %s,
                           complete = %s, updated_at = now()
                       WHERE run_id = %s AND school_id = %s""",
                    (next_cursor, result_count, result_count, len(edges), not has_next, run_id, legacy_id),
                )
            previous_cursor, cursor, complete = cursor, next_cursor, not has_next
            print(
                f"[search] {campus_code} {campus_name}: {len(edges)} rows; "
                f"{result_count} listed; cursor {'next' if has_next else 'complete'}"
            )


def prepare_review_refresh(conn, run_id: int, full_refresh: bool, refresh_days: int) -> None:
    """Plan from indexed local counts; stable profiles need no detail requests."""
    with conn.transaction():
        for school_id, _, _, campus_name in SCHOOLS:
            observed = conn.execute(
                "SELECT count(*) FROM osu_rmp.professor_school "
                "WHERE school_id = %s AND last_seen_run_id = %s",
                (school_id, run_id),
            ).fetchone()[0]
            expected = conn.execute(
                "SELECT result_count FROM osu_rmp.run_school WHERE run_id = %s AND school_id = %s",
                (run_id, school_id),
            ).fetchone()[0]
            conn.execute(
                "UPDATE osu_rmp.run_school SET stored_count = %s WHERE run_id = %s AND school_id = %s",
                (observed, run_id, school_id),
            )
            if expected is None or observed != expected:
                raise CollectionError(
                    f"RMP search completeness check failed for {campus_name}: "
                    f"expected {expected}, observed {observed} distinct professor(s). "
                    "No missing-source deletion was applied. Start a new run to rescan."
                )
        conn.execute(
            """UPDATE osu_rmp.run_professor rp
               SET stored_count = counts.actual,
                   expected_count = CASE
                       WHEN jsonb_typeof(p.ratings_distribution->'total') = 'number'
                       THEN (p.ratings_distribution->>'total')::integer
                       ELSE rp.expected_count END,
                   refresh_mode = CASE
                       WHEN rp.expected_count = 0 AND counts.actual = 0 THEN 'unchanged'
                       WHEN %s OR rp.source_changed OR (
                           jsonb_typeof(p.ratings_distribution->'total') = 'number'
                           AND counts.actual <> (p.ratings_distribution->>'total')::integer)
                         OR p.last_full_refresh_at IS NULL
                         OR p.last_full_refresh_at < now() - (%s * interval '1 day')
                       THEN 'full' ELSE 'unchanged' END,
                   reviews_complete = CASE
                       WHEN rp.expected_count = 0 AND counts.actual = 0 THEN true
                       WHEN %s OR rp.source_changed OR (
                           jsonb_typeof(p.ratings_distribution->'total') = 'number'
                           AND counts.actual <> (p.ratings_distribution->>'total')::integer)
                         OR p.last_full_refresh_at IS NULL
                         OR p.last_full_refresh_at < now() - (%s * interval '1 day')
                       THEN false ELSE true END
               FROM osu_rmp.professor p
               CROSS JOIN LATERAL (
                   SELECT count(*)::integer AS actual FROM osu_rmp.review r
                   WHERE r.professor_id = p.legacy_id AND r.active
               ) counts
               WHERE rp.run_id = %s AND p.legacy_id = rp.professor_id
                 AND rp.refresh_mode = 'pending'""",
            (full_refresh, refresh_days, full_refresh, refresh_days, run_id),
        )


def collect_reviews(conn, Jsonb, client: GraphQLClient, run_id: int) -> None:
    while not client.at_limit:
        rows = conn.execute(
            """SELECT rp.professor_id, p.graphql_id, rp.cursor, rp.previous_cursor
               FROM osu_rmp.run_professor rp
               JOIN osu_rmp.professor p ON p.legacy_id = rp.professor_id
               WHERE rp.run_id = %s AND rp.reviews_complete = false
               ORDER BY rp.professor_id LIMIT %s""",
            (run_id, client.batch_size),
        ).fetchall()
        conn.commit()
        if not rows:
            return
        batch = [
            {"professor_id": int(row[0]), "graphql_id": row[1], "cursor": row[2], "previous_cursor": row[3]}
            for row in rows
        ]
        query, variables = build_review_batch_query(batch, client.page_size)
        data = client.request("BatchRatings", query, variables)
        for index, item in enumerate(batch):
            with conn.transaction():
                teacher = data.get(f"p{index}")
                if not teacher or teacher.get("legacyId") is None:
                    raise CollectionError(
                        f"RMP returned no teacher for professor {item['professor_id']}; "
                        "the run is paused without marking the professor complete."
                    )
                if int(teacher["legacyId"]) != item["professor_id"]:
                    raise CollectionError("RMP returned a different teacher identity in a review batch.")
                professor_id = upsert_professor(conn, run_id, teacher, Jsonb, profile=True)
                rating_connection = teacher.get("ratings")
                if not isinstance(rating_connection, dict):
                    raise CollectionError(f"RMP omitted ratings for professor {professor_id}.")
                edges = rating_connection.get("edges") or []
                page_info = rating_connection.get("pageInfo") or {}
                has_next = bool(page_info.get("hasNextPage"))
                next_cursor = page_info.get("endCursor") if has_next else None
                validate_page_progress(
                    item["cursor"], next_cursor, has_next, edges,
                    f"professor {professor_id}", item["previous_cursor"],
                )
                save_page_cursor(conn, run_id, "professor", professor_id, item["cursor"], next_cursor)
                for edge in edges:
                    review = edge.get("node") or {}
                    if review:
                        upsert_review(conn, run_id, professor_id, review, Jsonb)
                conn.execute(
                    """UPDATE osu_rmp.run_professor
                       SET previous_cursor = cursor, cursor = %s, reviews_loaded = reviews_loaded + %s,
                           expected_count = %s, reviews_complete = %s, updated_at = now()
                       WHERE run_id = %s AND professor_id = %s""",
                    (next_cursor, len(edges), int(teacher.get("numRatings") or 0), not has_next, run_id, professor_id),
                )
                if not has_next:
                    stored = conn.execute(
                        "SELECT count(*) FROM osu_rmp.review WHERE professor_id = %s AND last_seen_run_id = %s",
                        (professor_id, run_id),
                    ).fetchone()[0]
                    distribution_total = (teacher.get("ratingsDistribution") or {}).get("total")
                    expected = int(distribution_total) if distribution_total is not None else int(teacher.get("numRatings") or 0)
                    loaded = conn.execute(
                        "SELECT reviews_loaded FROM osu_rmp.run_professor WHERE run_id = %s AND professor_id = %s",
                        (run_id, professor_id),
                    ).fetchone()[0]
                    if loaded != stored:
                        raise CollectionError(
                            f"RMP returned repeated review IDs for professor {professor_id}: "
                            f"loaded {loaded} rows but stored {stored} distinct reviews."
                        )
                        if distribution_total is not None and stored != expected:
                            raise CollectionError(
                                f"RMP review completeness failed for professor {professor_id}: "
                                f"distribution total {expected}, stored {stored} distinct reviews."
                            )
                    if distribution_total is None and expected > 0 and stored == 0:
                        raise CollectionError(f"RMP returned no reviews for rated professor {professor_id}.")
                    conn.execute(
                        "UPDATE osu_rmp.run_professor SET expected_count = %s, stored_count = %s "
                        "WHERE run_id = %s AND professor_id = %s",
                        (expected, stored, run_id, professor_id),
                    )
                    if stored == expected:
                        conn.execute(
                            "UPDATE osu_rmp.review SET active = false, updated_at = now() "
                            "WHERE professor_id = %s AND last_seen_run_id <> %s AND active",
                            (professor_id, run_id),
                        )
                    conn.execute(
                        "UPDATE osu_rmp.professor SET last_full_refresh_at = now() WHERE legacy_id = %s",
                        (professor_id,),
                    )
        print(
            f"[reviews] batch {len(batch)} professors; "
            f"{sum(int((data.get(f'p{i}') or {}).get('ratings', {}).get('edges') and len(data[f'p{i}']['ratings']['edges']) or 0) for i in range(len(batch)))} reviews; "
            f"request {client.requests_made}"
        )


def latest_progress(conn, run_id: int) -> tuple[int, int, int]:
    schools = conn.execute(
        "SELECT count(*), count(*) FILTER (WHERE complete) FROM osu_rmp.run_school WHERE run_id = %s",
        (run_id,),
    ).fetchone()
    professors = conn.execute(
        "SELECT count(*), count(*) FILTER (WHERE reviews_complete), coalesce(sum(reviews_loaded), 0) "
        "FROM osu_rmp.run_professor WHERE run_id = %s",
        (run_id,),
    ).fetchone()
    return int(schools[1]), int(professors[1]), int(professors[2])


def parse_args(argv: list[str] | None = None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-authorization", action="store_true", help="Confirm the user-provided RMP authorization for this run.")
    parser.add_argument("--new-run", action="store_true", help="Start a new snapshot instead of resuming the latest paused run.")
    parser.add_argument(
        "--full-refresh",
        action="store_true",
        help="Fetch every professor's review pages and detect deleted reviews; default refreshes changed/stale profiles only.",
    )
    parser.add_argument(
        "--refresh-days",
        type=int,
        default=30,
        help="Refresh unchanged professor review pages after this many days (default: 30).",
    )
    parser.add_argument("--min-interval", type=float, default=MIN_REQUEST_INTERVAL, help="Minimum seconds between HTTP requests; values below 10 are rejected.")
    parser.add_argument("--page-size", type=int, default=MAX_PAGE_SIZE, help="Teacher/review page size (maximum 100).")
    parser.add_argument("--batch-size", type=int, default=10, help="Professor review queries per GraphQL request (1-20).")
    parser.add_argument("--max-requests", type=int, default=0, help="Pause after this many requests; 0 means no limit.")
    args = parser.parse_args(argv)
    if args.min_interval < MIN_REQUEST_INTERVAL:
        parser.error(f"--min-interval must be at least {MIN_REQUEST_INTERVAL:g} seconds.")
    if not 1 <= args.page_size <= MAX_PAGE_SIZE:
        parser.error(f"--page-size must be between 1 and {MAX_PAGE_SIZE}.")
    if not 1 <= args.batch_size <= 20:
        parser.error("--batch-size must be between 1 and 20.")
    if args.max_requests < 0:
        parser.error("--max-requests cannot be negative.")
    if args.refresh_days < 1:
        parser.error("--refresh-days must be at least 1.")
    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.confirm_authorization:
        print("RMP collection requires prior authorization. Re-run with --confirm-authorization.", file=sys.stderr)
        return 2
    try:
        dsn = load_database_url()
        conn, Jsonb = connect_database(dsn)
        run_id, last_request_epoch, full_refresh = start_or_resume_run(
            conn, Jsonb, args.new_run, args.full_refresh
        )
        client = GraphQLClient(
            conn,
            run_id,
            last_request_epoch,
            args.min_interval,
            args.max_requests,
            args.page_size,
            args.batch_size,
        )
        print(f"[run] {run_id}; resuming saved cursors; minimum interval {args.min_interval:g}s")
        try:
            collect_search_pages(conn, Jsonb, client, run_id)
            incomplete_schools = conn.execute(
                "SELECT count(*) FROM osu_rmp.run_school WHERE run_id = %s AND complete = false",
                (run_id,),
            ).fetchone()[0]
            if not incomplete_schools and not client.at_limit:
                prepare_review_refresh(conn, run_id, full_refresh, args.refresh_days)
                collect_reviews(conn, Jsonb, client, run_id)
            pending = conn.execute(
                "SELECT count(*) FROM osu_rmp.run_professor WHERE run_id = %s AND reviews_complete = false",
                (run_id,),
            ).fetchone()[0]
            incomplete_schools = conn.execute(
                "SELECT count(*) FROM osu_rmp.run_school WHERE run_id = %s AND complete = false",
                (run_id,),
            ).fetchone()[0]
            counts = validate_run_counts(conn, run_id) if not incomplete_schools and not pending else None
            if not incomplete_schools and not pending and counts is not None:
                mark_missing_professors(conn, run_id)
                if full_refresh and counts["count_differences"] == 0:
                    mark_inactive_rows(conn, run_id)
                conn.execute(
                    "UPDATE osu_rmp.collection_run SET expected_professors = %s, observed_professors = %s, "
                    "expected_reviews = %s, observed_reviews = %s, validation_status = %s, deletion_check_status = %s "
                    "WHERE id = %s",
                    (counts["expected_professors"], counts["professors"], counts["expected_reviews"], counts["stored_reviews"],
                     "passed" if counts["count_differences"] == 0 else "passed_with_count_differences",
                     "skipped_count_differences" if counts["count_differences"] else
                     ("passed" if full_refresh else "skipped_incremental"), run_id),
                )
                conn.execute(
                    "UPDATE osu_rmp.collection_run SET status = 'completed', completed_at = now(), updated_at = now(), last_error = NULL WHERE id = %s",
                    (run_id,),
                )
                conn.commit()
                print(
                    "[run] complete; review counts expected="
                    f"{counts['expected_reviews']} stored={counts['stored_reviews']} "
                    f"loaded_this_run={counts['loaded_reviews']} "
                    f"professor_count_differences={counts['count_differences']}"
                )
            else:
                conn.execute(
                    "UPDATE osu_rmp.collection_run SET status = 'paused', updated_at = now() WHERE id = %s",
                    (run_id,),
                )
                conn.commit()
                print(f"[run] paused; unfinished schools={incomplete_schools}, professors={pending}")
            complete_schools, complete_professors, reviews = latest_progress(conn, run_id)
            print(
                f"[progress] schools={complete_schools}/{len(SCHOOLS)}; "
                f"professor reviews complete={complete_professors}; reviews loaded={reviews}"
            )
        except RequestLimitReached:
            conn.execute(
                "UPDATE osu_rmp.collection_run SET status = 'paused', updated_at = now() WHERE id = %s",
                (run_id,),
            )
            conn.commit()
            print("[run] request limit reached; saved progress can be resumed")
        except KeyboardInterrupt:
            conn.execute(
                "UPDATE osu_rmp.collection_run SET status = 'paused', updated_at = now() WHERE id = %s",
                (run_id,),
            )
            conn.commit()
            print("\n[run] interrupted; saved progress can be resumed")
        except Exception as exc:
            conn.execute(
                "UPDATE osu_rmp.collection_run SET status = 'paused', last_error = %s, updated_at = now() WHERE id = %s",
                (f"{type(exc).__name__}: {str(exc)[:500]}", run_id),
            )
            conn.commit()
            print(f"[run] paused after error: {type(exc).__name__}: {exc}", file=sys.stderr)
            return 1
        finally:
            conn.execute("SELECT pg_advisory_unlock(7241102901)")
            conn.close()
        return 0
    except CollectionError as exc:
        print(f"[error] {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
