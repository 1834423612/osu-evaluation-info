import unittest
from contextlib import nullcontext
from unittest.mock import patch

from scripts.collect_rmp_osu import (
    MIN_REQUEST_INTERVAL,
    build_review_batch_query,
    nullable_bool,
    parse_args,
    parse_retry_after,
    validate_page_progress,
    CollectionError,
    collect_reviews,
)


class RmpCollectorTests(unittest.TestCase):
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
