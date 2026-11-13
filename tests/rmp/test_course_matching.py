import base64
import hashlib
import unittest

from scripts.rmp.course_matching import SubjectLexicon, course_parts, course_token, resolve_course
from scripts.rmp.matching_data import audit_course_links, load_professors
from scripts.rmp.sync_rmp_mappings import catalog_candidates, collect_catalog_facts, refresh_fingerprint


class CourseMatchingTests(unittest.TestCase):
    def setUp(self):
        self.lexicon = SubjectLexicon([
            ("BIOLOGY", "Biology"), ("BIOCHEM", "Biochemistry"), ("MATH", "Mathematics"),
            ("COSENG", "Celestial Ocean Engineering"), ("MATHED", "Mathematics Education"),
            ("BIOMSCI", "Biomedical Science"), ("CSE", "Computer Science and Engineering"),
            ("COMPSTD", "Comparative Studies"),
        ])

    def test_subjects_are_derived_from_unseen_official_labels(self):
        self.assertEqual(self.lexicon.resolve("cel oce eng"), {"COSENG"})
        self.assertEqual(self.lexicon.resolve("coe"), {"COSENG"})
        result = resolve_course("COE 3100", {"COSENG3100"}, self.lexicon)
        self.assertEqual(result["course_key"], "COSENG3100")
        self.assertEqual(self.lexicon.resolve("Mathematics"), {"MATH"})

    def test_ambiguous_abbreviations_require_catalog_or_teacher_disambiguation(self):
        both = {"BIOLOGY1100", "BIOCHEM1100"}
        self.assertEqual(resolve_course("BIO1100", both, self.lexicon)["state"], "ambiguous")
        result = resolve_course("BIO1100", both, self.lexicon, taught={"BIOLOGY1100"})
        self.assertEqual(result["course_key"], "BIOLOGY1100")
        self.assertEqual(resolve_course("BIO1100", {"BIOLOGY1100"}, self.lexicon, department="Biology")["course_key"], "BIOLOGY1100")
        self.assertIsNone(resolve_course("BIOCHEM1100", {"BIOLOGY1100"}, self.lexicon)["course_key"])

    def test_shared_initials_and_wrong_numbers_never_jump_to_an_unrelated_subject(self):
        self.assertIsNone(resolve_course("BIO1100", {"BIOMSCI1100", "BIOLOGY1101"}, self.lexicon,
                                        department="Biology", taught={"BIOLOGY1101"})["course_key"])
        both = {"CSE2321", "COMPSTD2321"}
        self.assertEqual(resolve_course("CS2321", both, self.lexicon, department="Computer Science")["course_key"], "CSE2321")
        self.assertEqual(resolve_course("CS2321", both, self.lexicon)["state"], "ambiguous")

    def test_numbers_and_suffixes_are_never_fuzzy_matched(self):
        available = {"MATH1151", "MATH1151H", "MATH1151.01"}
        for raw in ["MATH151", "MATH1511", "MATH1151.1", "MATH1151E", "MATH113O"]:
            self.assertNotEqual(resolve_course(raw, available, self.lexicon)["state"], "accepted", raw)
        for raw in available:
            self.assertEqual(resolve_course(raw, available, self.lexicon)["course_key"], raw)
        self.assertEqual(course_parts("BIOLOGY1100"), ("BIOLOGY", "1100"))
        self.assertEqual(course_token("ＢＩＯ－１１００"), "BIO1100")

    def test_number_only_reviews_need_an_academic_department(self):
        available = {"MATH1151", "BIOLOGY1151"}
        self.assertEqual(resolve_course("1151", available, self.lexicon, department="Mathematics")["course_key"], "MATH1151")
        self.assertIsNone(resolve_course("1151", available, self.lexicon, department="Mansfield Campus")["course_key"])
        self.assertIsNone(resolve_course("1151", available, self.lexicon)["course_key"])

    def test_campus_administrative_labels_do_not_block_academic_subject_evidence(self):
        identities, facts = collect_catalog_facts([
            {"email": "ocean.7@osu.edu", "display_name": "Sam Ocean", "term_code": "1272",
             "class_number": "12345", "campus_code": "MNS", "subject": "COSENG", "catalog_number": "3100"},
        ])
        identities["ocean.7"]["course_facts"] = facts
        profile = {"legacy_id": 1, "first_name": "Sam", "last_name": "Ocean", "department": "Celestial Ocean Engineering",
                   "course_codes": [], "review_codes": ["COE3100"], "school_ids": [1, 2]}
        result = catalog_candidates([profile], identities, {1: "MNS", 2: "COL"},
                                    {"ocean.7": {"mansfieldcampus"}}, subject_lexicon=self.lexicon)
        self.assertEqual(result[0]["state"], "accepted")
        self.assertEqual(result[0]["campus_codes"], ["MNS"])
        self.assertTrue(result[0]["evidence"]["subject_department_match"])
        profile["department"] = "Unrelated discipline"
        self.assertEqual(catalog_candidates([profile], identities, {1: "MNS", 2: "COL"},
                         {"ocean.7": {"mansfieldcampus"}}, subject_lexicon=self.lexicon)[0]["state"], "candidate")

    def test_audit_separates_identity_and_course_failures_and_counts_reviews_once(self):
        profile = {"legacy_id": 1, "department": "Biology", "course_codes": [], "school_ids": [1, 2]}
        records, summary = audit_course_links([profile], [(1, "BIO1100", 5)], [], {},
            {1: "MNS", 2: "COL"}, {"MNS": {"BIOLOGY1100"}, "COL": {"BIOLOGY1100"}}, self.lexicon, [])
        self.assertEqual(len(records), 2)
        self.assertTrue(all(row["course_key"] == "BIOLOGY1100" for row in records))
        self.assertEqual(summary["active_reviews"], 5)
        self.assertEqual(summary["end_to_end_review_coverage"], {"identity_pending": 5})

    def test_profile_batches_reject_corrupt_payloads(self):
        class Result:
            def __init__(self, rows): self.rows = rows
            def fetchall(self): return self.rows
        class Database:
            count = 0
            def execute(self, *args):
                self.count += 1
                data = b'[]'
                return Result([(1, "Sam", "Ocean", "Biology", base64.b64encode(data).decode(),
                               hashlib.sha256(data).hexdigest(), [1])] if self.count == 1 else [])
        self.assertEqual(len(load_professors(Database())), 1)
        class Corrupt(Database):
            def execute(self, *args): return Result([(1, "Sam", "Ocean", "Biology", "W10=", "0" * 64, [1])])
        with self.assertRaises(ValueError): load_professors(Corrupt())

    def test_distinct_rmp_profiles_can_reference_one_verified_official_identity(self):
        identities, facts = collect_catalog_facts([
            {"email": "ocean.7@osu.edu", "display_name": "Sam Ocean", "term_code": "1272",
             "class_number": "12345", "campus_code": "MNS", "subject": "COSENG", "catalog_number": "3100"},
        ])
        identities["ocean.7"]["course_facts"] = facts
        profiles = [{"legacy_id": pid, "first_name": "Sam", "last_name": "Ocean",
                     "department": "Celestial Ocean Engineering", "course_codes": [{"courseName": "COE3100"}],
                     "school_ids": [1]} for pid in [1, 2]]
        candidates = catalog_candidates(profiles, identities, {1: "MNS"},
                         {"ocean.7": {"mansfieldcampus"}}, subject_lexicon=self.lexicon)
        self.assertEqual([row["state"] for row in candidates], ["accepted", "accepted"])
        self.assertEqual({row["professor_id"] for row in candidates}, {1, 2})
        self.assertTrue(all(row["evidence"]["identity_candidate_count"] == 1 for row in candidates))

    def test_new_subject_and_review_only_profile_are_linked_without_code_changes(self):
        observations = [
            {"email": "field.1@osu.edu", "display_name": "Avery Field", "term_code": "1272",
             "class_number": "10001", "campus_code": "MNS", "subject": "ABC", "catalog_number": "1234"},
            {"email": "tides.2@osu.edu", "display_name": "Dana Tides", "term_code": "1272",
             "class_number": "10002", "campus_code": "MNS", "subject": "MSE", "catalog_number": "4410"},
        ]
        identities, facts = collect_catalog_facts(observations)
        for username, identity in identities.items():
            identity["course_facts"] = [fact for fact in facts if fact[0] == username]
        labels = [("ABC", "Alpha Sciences"), ("MSE", "Marine Signal Engineering")]
        first = {"legacy_id": 11, "first_name": "Avery", "last_name": "Field", "department": "Alpha Sciences",
                 "course_codes": [{"courseName": "AS1234"}], "school_ids": [1]}
        incoming = {"legacy_id": 12, "first_name": "Dana", "last_name": "Tides", "department": "Marine Signal Engineering",
                    "course_codes": [], "review_codes": ["mar sig eng4410"], "school_ids": [1]}
        baseline = catalog_candidates([first], {"field.1": identities["field.1"]}, {1: "MNS"}, {},
                                      subject_lexicon=SubjectLexicon(labels[:1]))
        updated = catalog_candidates([first, incoming], identities, {1: "MNS"}, {},
                                     subject_lexicon=SubjectLexicon(labels))
        repeated = catalog_candidates([incoming, first], identities, {1: "MNS"}, {},
                                      subject_lexicon=SubjectLexicon(list(reversed(labels))))
        self.assertEqual(baseline[0]["state"], "accepted")
        self.assertEqual({row["professor_id"]: row["state"] for row in updated}, {11: "accepted", 12: "accepted"})
        self.assertEqual(updated[1]["course_matches"], ["MSE4410"])
        self.assertEqual(refresh_fingerprint(updated, []), refresh_fingerprint(repeated, []))


if __name__ == "__main__":
    unittest.main()
