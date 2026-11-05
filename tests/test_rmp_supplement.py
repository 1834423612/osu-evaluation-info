import json
import sqlite3
import unittest

from scripts.import_rmp_supplement import discrepancy_counts, positive_id, review_matches, supplement_rows


class RmpSupplementTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.row_factory = sqlite3.Row
        self.db.executescript("""
            CREATE TABLE professors (school_id,professor_id,name,payload,last_seen_at);
            CREATE TABLE reviews (review_key,school_id,professor_id,date,course,quality,
                                  difficulty,comment,payload,last_seen_at);
            CREATE TABLE pg_profile (id INTEGER PRIMARY KEY);
            CREATE TABLE pg_review (id INTEGER PRIMARY KEY,professor_id,day,course,
                                    comment,quality,difficulty);
        """)

    def tearDown(self):
        self.db.close()

    def review(self, key, *, professor="101", quality=4, comment="A review"):
        self.db.execute("INSERT INTO reviews VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (key, "724", professor, "2026-11-03", "CSE2221", quality,
                         3, comment, '{"original":true}', "2026-11-04T00:00:00Z"))

    def pg_review(self, review_id, *, professor=101, quality=4, comment="A review"):
        self.db.execute("INSERT INTO pg_review VALUES (?,?,?,?,?,?,?)",
                        (review_id, professor, "2026-11-03", "CSE2221", comment, quality, 3))

    def test_same_content_distinct_source_ids_remain_ambiguous(self):
        self.review("fingerprint")
        self.pg_review(1)
        self.pg_review(2)
        review_matches(self.db)
        self.assertEqual(tuple(self.db.execute("SELECT matches FROM review_match").fetchone()), (2,))
        self.assertEqual(supplement_rows(self.db, "source.sqlite"), [])

    def test_rating_difference_is_preserved_and_fingerprint_is_never_source_id(self):
        self.review("fingerprint", quality=1)
        self.pg_review(999, quality=5)
        review_matches(self.db)
        rows = supplement_rows(self.db, "source.sqlite")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0][:4], ("review", "sqlite:fingerprint", 101, 724))
        self.assertEqual(json.loads(rows[0][4])["record"]["payload"], {"original": True})
        self.assertEqual(len(rows[0]), 6)
        self.assertEqual(discrepancy_counts(self.db), (0, 1))

    def test_unique_professor_payload_and_source_are_retained(self):
        self.db.executemany("INSERT INTO professors VALUES (?,?,?,?,?)", [
            ("724", "101", "Existing Person", "{}", "2026-11-04T00:00:00Z"),
            ("724", "102", "Unique Person", "legacy malformed json", "2026-11-04T00:00:00Z"),
        ])
        self.db.execute("INSERT INTO pg_profile VALUES (101)")
        review_matches(self.db)
        rows = supplement_rows(self.db, "legacy.sqlite")
        self.assertEqual(rows[0][:4], ("professor", "sqlite:724:102", 102, 724))
        payload = json.loads(rows[0][4])
        self.assertEqual(payload["source_file"], "legacy.sqlite")
        self.assertEqual(payload["record"]["name"], "Unique Person")
        self.assertEqual(payload["record"]["payload"], "legacy malformed json")

    def test_matching_includes_professor_identity(self):
        self.review("fingerprint", professor="102")
        self.pg_review(999, professor=101)
        review_matches(self.db)
        self.assertEqual(self.db.execute("SELECT matches FROM review_match").fetchone()[0], 0)

    def test_invalid_source_ids_fail_before_persistent_write(self):
        for value in ("0", "-1", "1;DROP TABLE review", "9223372036854775808", None):
            with self.subTest(value=value), self.assertRaises(ValueError):
                positive_id(value)


if __name__ == "__main__":
    unittest.main()
