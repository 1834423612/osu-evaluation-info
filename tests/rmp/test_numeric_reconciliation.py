import unittest

from scripts.rmp.course_matching import SubjectLexicon, resolve_course
from scripts.rmp.sync_rmp_mappings import catalog_candidates
from scripts.rmp.matching_data import audit_course_links


class NumericReconciliationTests(unittest.TestCase):
    def setUp(self):
        self.lexicon = SubjectLexicon([("MATH", "Mathematics"), ("STAT", "Statistics")])

    def test_verified_subjects_recover_numeric_labels_without_department(self):
        result = resolve_course("1131", {"MATH1131", "STAT1131"}, self.lexicon,
                                department="Mansfield Campus", taught={"MATH1151"})
        self.assertEqual(result["course_key"], "MATH1131")
        self.assertEqual(result["reason"], "number_with_verified_subject")

    def test_number_collision_across_verified_subjects_stays_ambiguous(self):
        result = resolve_course("1131", {"MATH1131", "STAT1131"}, self.lexicon,
                                department="Mathematics", taught={"MATH1151", "STAT1350"})
        self.assertEqual(result["state"], "ambiguous")
        self.assertEqual(result["candidates"], ["MATH1131", "STAT1131"])

    def test_even_one_exact_taught_course_does_not_hide_cross_subject_collision(self):
        result = resolve_course("1131", {"MATH1131", "STAT1131"}, self.lexicon,
                                taught={"MATH1131", "STAT1350"})
        self.assertEqual(result["state"], "ambiguous")

    def test_numeric_label_cannot_verify_a_name_matched_identity(self):
        fact = ("same.1", "official_catalog", "record", "MNS", "MATH1131", "MATH", "1131", "1272")
        identity = {"names": ["Sam Same"], "course_facts": [fact], "courses": {"MATH1131"}}
        profile = {"legacy_id": 1, "first_name": "Sam", "last_name": "Same", "department": "Mathematics",
                   "school_ids": [1], "course_codes": [{"courseName": "1131"}]}
        candidates = catalog_candidates([profile], {"same.1": identity}, {1: "MNS"}, {}, subject_lexicon=self.lexicon)
        self.assertEqual(candidates[0]["state"], "candidate")

    def test_numeric_inference_respects_the_verified_identity_campus_scope(self):
        profile = {"legacy_id": 1, "department": "Mathematics", "course_codes": [], "school_ids": [1]}
        candidates = [{"professor_id": 1, "username": "same.1", "state": "accepted", "campus_codes": ["MNS"]}]
        identities = {"same.1": {"course_facts": [("same.1", "official_catalog", "key", "COL", "MATH1151", "MATH", "1151", "1272")]}}
        records, _summary = audit_course_links([profile], [(1,"1131",1)], candidates, identities,
            {1: "COL"}, {"COL": {"MATH1131"}}, self.lexicon, [(1,"same.1","accepted","evidence-v1")])
        self.assertIsNone(records[0]["course_key"])


if __name__ == "__main__":
    unittest.main()
