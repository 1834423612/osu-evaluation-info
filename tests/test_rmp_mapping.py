import unittest

from scripts.sync_rmp_mappings import (
    apply_manual_reservations,
    catalog_candidates,
    collect_catalog_facts,
    confidence_score,
    normalize_course_key,
    normalize_name,
    osu_username,
    parse_decisions,
    should_auto_accept,
)


class RmpMappingTests(unittest.TestCase):
    def test_name_normalization_handles_accents_and_punctuation(self):
        self.assertEqual(normalize_name("María-José O’Neil"), "mariajoseoneil")
        self.assertEqual(normalize_name(None), "")

    def test_course_normalization_accepts_known_shapes_without_aliasing(self):
        self.assertEqual(normalize_course_key("CSE 2221"), "CSE2221")
        self.assertEqual(normalize_course_key("Math-1151"), "MATH1151")
        self.assertEqual(normalize_course_key("CSE_2231"), "CSE2231")
        self.assertIsNone(normalize_course_key("Computer Science 2221"))
        self.assertIsNone(normalize_course_key("CSE 21"))

    def test_username_only_accepts_osu_domains(self):
        self.assertEqual(osu_username("Smith.123@OSU.EDU"), "smith.123")
        self.assertEqual(osu_username("smith.123@buckeyemail.osu.edu"), "smith.123")
        self.assertIsNone(osu_username("smith.123@example.com"))
        self.assertIsNone(osu_username("@osu.edu"))

    def test_catalog_facts_retain_source_and_campus(self):
        identities, facts = collect_catalog_facts([
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "10001", "campus_code": "COL", "subject": "CSE", "catalog_number": "2221",
             "source": "official_catalog"},
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "20002", "campus_code": "NWK", "subject": "CSE", "catalog_number": "2221",
             "source": "official_evaluation"},
        ])
        self.assertEqual(identities["smith.1"]["names"], ["Jane Smith"])
        self.assertEqual({row[1] for row in facts}, {"official_catalog", "official_evaluation"})
        self.assertEqual({row[3] for row in facts}, {"COL", "NWK"})

    def test_four_signals_and_unique_evidence_are_required_for_auto_accept(self):
        self.assertEqual(confidence_score(name_exact=True, campus_match=True, department_match=True, course_overlap=1), 100)
        base = dict(name_exact=True, campus_match=True, department_match=True, course_overlap=1,
                    unique_for_professor=True, unique_for_identity=True)
        self.assertTrue(should_auto_accept(**base))
        for key, value in (("name_exact", False), ("campus_match", False), ("department_match", False),
                           ("course_overlap", 0), ("unique_for_professor", False),
                           ("unique_for_identity", False)):
            with self.subTest(key=key):
                altered = dict(base)
                altered[key] = value
                self.assertFalse(should_auto_accept(**altered))

    def test_exact_name_with_campus_course_and_department_maps(self):
        identities, facts = collect_catalog_facts([
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "10001", "campus_code": "COL", "subject": "CSE", "catalog_number": "2221"},
        ])
        identities["smith.1"]["course_facts"] = facts
        candidates = catalog_candidates(
            [{"legacy_id": 101, "first_name": "Jane", "last_name": "Smith", "department": "CSE",
              "course_codes": [{"courseName": "CSE 2221"}], "school_ids": [724]}],
            identities, {724: "COL"}, {"smith.1": {"cse"}},
        )
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["state"], "accepted")
        self.assertEqual(candidates[0]["score"], 100)

    def test_same_name_ambiguous_on_a_campus_stays_candidate(self):
        identities, facts = collect_catalog_facts([
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "10001", "campus_code": "COL", "subject": "CSE", "catalog_number": "2221"},
            {"email": "smith.2@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "10002", "campus_code": "COL", "subject": "CSE", "catalog_number": "2221"},
        ])
        for user, item in identities.items():
            item["course_facts"] = [row for row in facts if row[0] == user]
        candidates = catalog_candidates(
            [{"legacy_id": 101, "first_name": "Jane", "last_name": "Smith", "department": "CSE",
              "course_codes": [{"courseName": "CSE 2221"}], "school_ids": [724]}],
            identities, {724: "COL"}, {"smith.1": {"cse"}, "smith.2": {"cse"}},
        )
        self.assertEqual(len(candidates), 2)
        self.assertTrue(all(candidate["state"] == "candidate" for candidate in candidates))

    def test_same_osu_identity_can_have_distinct_campus_profiles(self):
        identities, facts = collect_catalog_facts([
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "10001", "campus_code": "COL", "subject": "CSE", "catalog_number": "2221"},
            {"email": "smith.1@osu.edu", "display_name": "Jane Smith", "term_code": "1248",
             "class_number": "20002", "campus_code": "NWK", "subject": "CSE", "catalog_number": "2221"},
        ])
        identities["smith.1"]["course_facts"] = facts
        profiles = [
            {"legacy_id": 101, "first_name": "Jane", "last_name": "Smith", "department": "CSE",
             "course_codes": [{"courseName": "CSE 2221"}], "school_ids": [724]},
            {"legacy_id": 102, "first_name": "Jane", "last_name": "Smith", "department": "CSE",
             "course_codes": [{"courseName": "CSE 2221"}], "school_ids": [2610]},
        ]
        candidates = catalog_candidates(profiles, identities, {724: "COL", 2610: "NWK"}, {"smith.1": {"cse"}})
        self.assertEqual({candidate["state"] for candidate in candidates}, {"accepted"})

    def test_manual_accept_reserves_identity_without_overriding_manual_record(self):
        candidates = [{"professor_id": 101, "username": "smith.1", "state": "accepted",
                       "campus_codes": ["COL"], "evidence": {}}]
        apply_manual_reservations(candidates, [{"professor_id": 100, "username": "smith.1",
                                                "campus_codes": ["COL"]}])
        self.assertEqual(candidates[0]["state"], "candidate")
        self.assertTrue(candidates[0]["evidence"]["manual_decision_reserved"])

    def test_manual_decision_syntax_and_conflict_validation(self):
        self.assertEqual(parse_decisions(["101:smith.1"], ["102:jones.2"]),
                         [(101, "smith.1", "accepted"), (102, "jones.2", "rejected")])
        with self.assertRaises(ValueError):
            parse_decisions(["101:smith.1"], ["101:smith.1"])
        with self.assertRaises(ValueError):
            parse_decisions(["101:smith.1", "101:jones.2"], [])


if __name__ == "__main__":
    unittest.main()
