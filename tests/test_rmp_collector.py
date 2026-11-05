import unittest
import io
from contextlib import nullcontext, redirect_stderr, redirect_stdout
from unittest.mock import MagicMock, patch

from scripts.collect_rmp_osu import (
    MIN_REQUEST_INTERVAL,
    build_review_batch_query,
    nullable_bool,
    parse_args,
    parse_retry_after,
    validate_page_progress,
    CollectionError,
    collect_reviews,
    connect_database,
    main,
    save_paused_run,
)


class RmpCollectorTests(unittest.TestCase):
    def test_installed_schema_skips_ddl_and_connection_has_timeout(self):
        driver = MagicMock()
        connection = driver.connect.return_value
        connection.execute.return_value.fetchone.return_value = (True,)
        with patch("scripts.collect_rmp_osu.require_psycopg", return_value=(driver, object())), \
             patch("scripts.collect_rmp_osu.SCHEMA_PATH") as base_schema, \
             patch("scripts.collect_rmp_osu.COLLECTOR_SCHEMA_PATH") as collector_schema:
            returned, _ = connect_database("test-dsn")
        self.assertIs(returned, connection)
        self.assertEqual(driver.connect.call_args.kwargs["connect_timeout"], 5)
        base_schema.read_text.assert_not_called()
        collector_schema.read_text.assert_not_called()
        connection.close.assert_not_called()

    def test_schema_failure_releases_connection_and_preserves_original_error(self):
        driver = MagicMock()
        connection = driver.connect.return_value

        def execute(sql, params=()):
            if sql == "base-schema":
                raise RuntimeError("DDL lock timeout")
            result = MagicMock()
            result.fetchone.return_value = ("pg_try_advisory_lock" in sql,)
            return result

        connection.execute.side_effect = execute
        with patch("scripts.collect_rmp_osu.require_psycopg", return_value=(driver, object())), \
             patch("scripts.collect_rmp_osu.SCHEMA_PATH") as base_schema:
            base_schema.read_text.return_value = "base-schema"
            with self.assertRaisesRegex(RuntimeError, "DDL lock timeout"):
                connect_database("test-dsn")
        connection.close.assert_called_once()

    def test_aborted_transaction_rolls_back_before_saving_paused_status(self):
        class Database:
            def __init__(self):
                self.aborted = True
                self.events = []

            def rollback(self):
                self.events.append("rollback")
                self.aborted = False

            def execute(self, sql, params=()):
                if self.aborted:
                    raise RuntimeError("transaction aborted")
                self.events.append((sql, params))

            def commit(self):
                self.events.append("commit")

        database = Database()
        self.assertTrue(save_paused_run(database, 7, RuntimeError("statement timeout")))
        self.assertEqual(database.events[0], "rollback")
        self.assertEqual(database.events[1][1], ("RuntimeError: statement timeout", 7))
        self.assertEqual(database.events[-1], "commit")

    def test_resume_error_closes_connection_without_starting_collection(self):
        database = MagicMock()
        with patch("scripts.collect_rmp_osu.load_database_url", return_value="test-dsn"), \
             patch("scripts.collect_rmp_osu.connect_database", return_value=(database, object())), \
             patch("scripts.collect_rmp_osu.start_or_resume_run", side_effect=CollectionError("resume mode differs")), \
             patch("scripts.collect_rmp_osu.collect_search_pages") as collect, \
             redirect_stderr(io.StringIO()):
            self.assertEqual(main(["--confirm-authorization"]), 2)
        database.close.assert_called_once()
        collect.assert_not_called()

    def test_status_write_failure_does_not_hide_collection_error_or_leak_connection(self):
        database = MagicMock()
        database.execute.side_effect = RuntimeError("connection lost while saving")
        errors = io.StringIO()
        with patch("scripts.collect_rmp_osu.load_database_url", return_value="test-dsn"), \
             patch("scripts.collect_rmp_osu.connect_database", return_value=(database, object())), \
             patch("scripts.collect_rmp_osu.start_or_resume_run", return_value=(7, None, False)), \
             patch("scripts.collect_rmp_osu.GraphQLClient"), \
             patch("scripts.collect_rmp_osu.collect_search_pages", side_effect=RuntimeError("original statement timeout")), \
             redirect_stderr(errors), redirect_stdout(io.StringIO()):
            self.assertEqual(main(["--confirm-authorization"]), 1)
        self.assertIn("original statement timeout", errors.getvalue())
        self.assertIn("connection lost while saving", errors.getvalue())
        database.rollback.assert_called()
        database.close.assert_called_once()

    def test_terminal_page_with_missing_reviews_cannot_complete_or_delete(self):
        class Result:
            def __init__(self, rows):
                self.rows = rows

            def fetchall(self):
                return self.rows

            def fetchone(self):
                return self.rows[0]

        class Database:
            def __init__(self):
                self.statements = []

            def execute(self, sql, params=()):
                self.statements.append(sql)
                if "SELECT rp.professor_id" in sql:
                    return Result([(1, "teacher-1", None, None)])
                if "SELECT count(*) FROM osu_rmp.review" in sql:
                    return Result([(2,)])
                if "SELECT reviews_loaded" in sql:
                    return Result([(2,)])
                return Result([])

            def transaction(self):
                return nullcontext()

            def commit(self):
                pass

        class Client:
            at_limit = False
            batch_size = 1
            page_size = 50

            def request(self, *args):
                return {"p0": {"legacyId": 1, "numRatings": 2,
                    "ratingsDistribution": {"total": 3}, "ratings": {
                        "edges": [{"cursor": "a", "node": {"legacyId": 10}},
                                  {"cursor": "b", "node": {"legacyId": 11}}],
                        "pageInfo": {"hasNextPage": False}}}}

        database = Database()
        with patch("scripts.collect_rmp_osu.upsert_professor", return_value=1), \
             patch("scripts.collect_rmp_osu.upsert_review"), \
             patch("scripts.collect_rmp_osu.save_page_cursor"):
            with self.assertRaisesRegex(CollectionError, "distribution total 3, stored 2"):
                collect_reviews(database, lambda value: value, Client(), 1)
        self.assertFalse(any("SET active = false" in sql for sql in database.statements))
        self.assertFalse(any("SET last_full_refresh_at" in sql for sql in database.statements))

    def test_review_query_batches_distinct_cursors(self):
        query, variables = build_review_batch_query(
            [
                {"graphql_id": "VGVhY2hlci0x", "cursor": None},
                {"graphql_id": "VGVhY2hlci0y", "cursor": "cursor-2"},
            ],
            page_size=50,
        )

        self.assertIn("p0: node(id: $id0)", query)
        self.assertIn("p1: node(id: $id1)", query)
        self.assertIn("ratings(first: $count, after: $cursor1)", query)
        self.assertIn("comment", query)
        self.assertNotIn("computerId", query)
        self.assertEqual(variables["count"], 50)
        self.assertIsNone(variables["cursor0"])
        self.assertEqual(variables["cursor1"], "cursor-2")

    def test_retry_after_seconds(self):
        self.assertEqual(parse_retry_after("15"), 15.0)
        self.assertIsNone(parse_retry_after("not-a-delay"))

    def test_nullable_bool_normalizes_graphql_numeric_values(self):
        self.assertIs(nullable_bool(1), True)
        self.assertIs(nullable_bool(0), False)
        self.assertIs(nullable_bool(None), None)

    def test_request_interval_cannot_be_lowered(self):
        with self.assertRaises(SystemExit):
            parse_args(["--confirm-authorization", "--min-interval", str(MIN_REQUEST_INTERVAL - 1)])

    def test_page_requires_forward_cursor_when_more_results_exist(self):
        for next_cursor, edges in ((None, [{"cursor": "x"}]), ("same", [{"cursor": "x"}]), ("next", [])):
            with self.subTest(next_cursor=next_cursor, edges=edges):
                with self.assertRaises(CollectionError):
                    validate_page_progress("same", next_cursor, True, edges, "test")

    def test_page_accepts_terminal_page_without_cursor(self):
        validate_page_progress("cursor-1", None, False, [], "test")

    def test_page_rejects_duplicate_edge_cursors(self):
        with self.assertRaisesRegex(CollectionError, "duplicate edge cursors"):
            validate_page_progress(
                None,
                "edge-1",
                True,
                [{"cursor": "edge-1"}, {"cursor": "edge-1"}],
                "test",
            )

    def test_page_rejects_cursor_cycles_and_inconsistent_end_cursor(self):
        with self.assertRaisesRegex(CollectionError, "did not advance"):
            validate_page_progress(
                "cursor-b", "cursor-a", True, [{"cursor": "cursor-a"}],
                "test", previous_cursor="cursor-a",
            )
        with self.assertRaisesRegex(CollectionError, "inconsistent edge/end cursors"):
            validate_page_progress(
                "cursor-a", "cursor-c", True, [{"cursor": "cursor-b"}], "test"
            )

    def test_full_refresh_options(self):
        args = parse_args(["--confirm-authorization", "--full-refresh", "--refresh-days", "45"])
        self.assertTrue(args.full_refresh)
        self.assertEqual(args.refresh_days, 45)


if __name__ == "__main__":
    unittest.main()
