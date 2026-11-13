import contextlib
import io
import unittest

from scripts.rmp.mapping_coverage import stored_profile_coverage, summarize_profile_coverage
from scripts.rmp.matching_data import audit_course_links
from scripts.rmp.course_matching import SubjectLexicon
from scripts.rmp.sync_rmp_mappings import parse_args


class MappingCoverageTests(unittest.TestCase):
    def test_source_profiles_and_official_identities_have_separate_counts(self):
        rows = [
            (1, "COL", ["teacher.1"], True, False),
            (2, "COL", ["teacher.1"], False, False),
            (3, "MNS", [], True, False),
            (3, "MNS", [], True, False),
            (4, "MNS", [], False, False),
            (5, "MNS", [], False, True),
        ]
        result = summarize_profile_coverage(rows, ["COL", "MNS", "WST"])
        self.assertEqual(result["overall"], {"total": 5, "linked": 2, "unlinked": 3,
            "pending": 1, "no_candidate": 1, "rejected": 1, "official_instructors": 1})
        self.assertEqual(result["campuses"]["WST"]["total"], 0)
        self.assertEqual(result["campuses"]["MNS"]["unlinked"], 3)

    def test_multiple_campuses_do_not_inflate_global_totals(self):
        result = summarize_profile_coverage([
            (1, "COL", ["teacher.1"], True, False),
            (1, "MNS", [], True, False),
            (2, None, [], False, False),
        ])
        self.assertEqual(result["overall"]["total"], 2)
        self.assertEqual(result["overall"]["linked"], 1)
        self.assertEqual(result["overall"]["unlinked"], 1)
        self.assertEqual(result["campuses"]["MNS"]["pending"], 1)
        self.assertEqual(result["campuses"]["UNASSIGNED"]["total"], 1)
        self.assertEqual(result["profiles_with_multiple_campuses"], 1)

    def test_profiles_without_any_reviews_are_included_in_proposed_coverage(self):
        profiles = [{"legacy_id": 1, "course_codes": [], "school_ids": [1]},
                    {"legacy_id": 2, "course_codes": [], "school_ids": [1]}]
        candidates = [{"professor_id": 1, "username": "teacher.1", "state": "accepted", "campus_codes": ["MNS"]}]
        _, summary = audit_course_links(profiles, [], candidates, {}, {1: "MNS"}, {}, SubjectLexicon([]), [])
        self.assertEqual(summary["active_reviews"], 0)
        self.assertEqual(summary["profile_coverage"]["overall"]["total"], 2)
        self.assertEqual(summary["profile_coverage"]["overall"]["unlinked"], 1)

    def test_reviewed_decisions_and_campus_scope_are_preserved_in_counts(self):
        profiles = [{"legacy_id": 1, "course_codes": [], "school_ids": [1, 2]},
                    {"legacy_id": 2, "course_codes": [], "school_ids": [1]}]
        candidates = [{"professor_id": 1, "username": "teacher.1", "state": "accepted", "campus_codes": ["MNS"]},
                      {"professor_id": 2, "username": "teacher.2", "state": "candidate", "campus_codes": ["MNS"]}]
        _, summary = audit_course_links(profiles, [], candidates, {}, {1: "MNS", 2: "COL"}, {}, SubjectLexicon([]),
                                        [(2, "teacher.2", "rejected", "manual")])
        coverage = summary["profile_coverage"]
        self.assertEqual(coverage["campuses"]["COL"]["linked"], 0)
        self.assertEqual(coverage["campuses"]["COL"]["pending"], 1)
        self.assertEqual(coverage["overall"]["rejected"], 1)
        self.assertEqual(coverage["overall"]["pending"], 0)

    def test_stored_coverage_pages_by_profile_id(self):
        class Result:
            def __init__(self, rows): self.rows = rows
            def __iter__(self): return iter(self.rows)
            def fetchall(self): return self.rows
        class Database:
            positions = []
            def execute(self, sql, params=None):
                if params is None: return Result([("COL",), ("MNS",)])
                self.positions.append(params[0])
                return Result([(10, "COL", ["teacher.1"], True, False),
                               (10, "MNS", [], True, False), (11, "MNS", [], False, False)] if params[0] == 0 else [])
        db = Database()
        self.assertEqual(stored_profile_coverage(db)["overall"]["total"], 2)
        self.assertEqual(db.positions, [0, 11])

    def test_coverage_only_rejects_mutating_or_proposal_flags(self):
        self.assertTrue(parse_args(["--coverage-only"]).coverage_only)
        for options in [["--accept", "1:teacher.1"], ["--reject", "1:teacher.1"],
                        ["--dry-run", "--export-candidates", "/tmp/candidates.jsonl"]]:
            with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
                parse_args(["--coverage-only", *options])


if __name__ == "__main__":
    unittest.main()
