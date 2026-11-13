from types import SimpleNamespace
import unittest

from scripts.rmp.sync_rmp_mappings import catalog_rows, evaluation_rows, official_departments
from scripts.rmp.matching_data import reference_data


class Result:
    def __init__(self, rows, columns=()):
        self.rows = rows
        self.description = [SimpleNamespace(name=name) for name in columns]
    def fetchall(self): return self.rows
    def fetchone(self): return self.rows[0]


class MappingBatchTests(unittest.TestCase):
    def test_catalog_keeps_all_instructors_and_advances_over_empty_sections(self):
        fields = ["term_code", "class_number", "campus_code", "subject", "catalog_number", "fetched_at", "email", "display_name"]
        class Database:
            cursors = []
            def execute(self, sql, params=None):
                if "to_regclass" in sql: return Result([(True,)])
                if "DISTINCT ON" in sql: return Result([("1272", "generation")])
                self.cursors.append(params[2:])
                if params[2:] == ("",):
                    return Result([
                        ("1272", "100", "COL", "ABC", "1234", "date", "teacher.1@osu.edu", "A Teacher"),
                        ("1272", "100", "COL", "ABC", "1234", "date", "teacher.2@osu.edu", "B Teacher"),
                        ("1272", "101", "COL", "ABC", "1234", "date", None, None),
                    ], fields)
                return Result([], fields)
        db = Database()
        rows, terms = catalog_rows(db, 0)
        self.assertEqual(len(rows), 2)
        self.assertEqual(terms, ["1272"])
        self.assertEqual(db.cursors, [("",), ("101",)])

    def test_evaluations_deduplicate_observations_across_page_boundaries(self):
        fields = ["evidence_id", "term_code", "term_sort_key", "class_number", "campus_code", "subject", "catalog_number", "fetched_at", "email", "display_name"]
        fact = ("AU 26", 20263, "100", "COL", "ABC", "1234", "date", "teacher.1@osu.edu", "A Teacher")
        class Database:
            positions = []
            def execute(self, sql, params=None):
                if "to_regclass" in sql: return Result([(True,)])
                if "SELECT label" in sql: return Result([("AU 26",)])
                self.positions.append(params[1])
                if params[1] == 0: return Result([(1, *fact)], fields)
                if params[1] == 1: return Result([(2, *fact)], fields)
                return Result([], fields)
        db = Database()
        rows, _ = evaluation_rows(db, 0)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["source"], "official_evaluation")
        self.assertNotIn("evidence_id", rows[0])
        self.assertEqual(db.positions, [0, 1, 2])

    def test_string_cursors_follow_database_collation(self):
        class Database:
            positions = []
            def execute(self, sql, params=None):
                if "to_regclass" in sql: return Result([(True,)])
                self.positions.append(params[0])
                if params[0] == "": return Result([("dejong.36", ["Mathematics"], 1)])
                if params[0] == "dejong.36": return Result([("de-jong.8", ["Mathematics"], 2)])
                return Result([])
        db = Database()
        departments, ids = official_departments(db)
        self.assertEqual(len(departments), 2)
        self.assertEqual(ids["de-jong.8"], 2)
        self.assertEqual(db.positions, ["", "dejong.36", "de-jong.8"])

    def test_reference_keeps_subject_labels_across_published_terms(self):
        class Database:
            positions = []
            def execute(self, sql, params=None):
                if "to_regclass" in sql: return Result([(True,)])
                if "SELECT code,code" in sql: return Result([("ABC", "ABC")])
                if "DISTINCT ON" in sql: return Result([("1272", "new"), ("1268", "old")])
                self.positions.append(params)
                if params[2:] == ("", "", ""):
                    return Result([("course", "1", "COL", "ABC", "1234",
                                    "Applied Sciences" if params[1] == "1272" else "Alpha Sciences")])
                return Result([])
        db = Database()
        lexicon, inventory = reference_data(db, [])
        self.assertEqual(inventory, {"COL": {"ABC1234"}})
        self.assertIn("Alpha Sciences", lexicon.labels["ABC"])
        self.assertIn("Applied Sciences", lexicon.labels["ABC"])
        self.assertEqual(len(db.positions), 4)


if __name__ == "__main__":
    unittest.main()
