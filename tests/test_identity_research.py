import sys
from pathlib import Path
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/rmp"))
from course_matching import SubjectLexicon
from identity_research import compatible_name, evaluate_profile, classification
from review_identity_research import safe_json_value,merge_observation


class IdentityResearchTests(unittest.TestCase):
    def test_later_outage_preserves_previously_observed_identity_evidence(self):
        observations={}
        person={'user':'example.1','name':'Alex Example','first':'Alex','last':'Example','roles':['lecturer'],'appointments':[]}
        merge_observation(observations,1,{'status':'available','source':'osu-search','checked_at':'2026-11-12T00:00:00Z','candidates':[person]})
        merge_observation(observations,1,{'status':'unavailable','source':'osu-search','checked_at':'2026-11-13T00:00:00Z','candidates':[]})
        self.assertEqual(len(observations[1]['candidates']),1)
        self.assertEqual(len(observations[1]['sources']),2)
        self.assertEqual(observations[1]['candidates'][0]['observed_at'],'2026-11-12T00:00:00Z')
    def test_provider_controls_are_replaced_before_jsonb_storage(self):
        self.assertEqual(
            safe_json_value({"title": "A\x00B", "items": ["\ud800"]}),
            {"title": "A\ufffdB", "items": ["\ufffd"]},
        )

    def setUp(self):
        self.profile = {
            "legacy_id": 1,
            "first_name": "Alex",
            "last_name": "Example",
            "department": "Mathematics",
            "campuses": ["MNS"],
            "course_codes": [{"courseName": "MATH1151"}],
        }
        self.person = {
            "user": "example.1",
            "first": "Alex",
            "middle": "Taylor",
            "last": "Example",
            "name": "Alex Taylor Example",
            "roles": ["lecturer", "employee"],
            "appointments": [
                {
                    "title": "Lecturer",
                    "organization": "Mansfield - Academic Instruction",
                }
            ],
        }
        self.observation = {
            "status": "available",
            "query": "Alex Example",
            "candidates": [self.person],
        }
        self.lexicon = SubjectLexicon([("MATH", "Mathematics"), ("BIOLOGY", "Biology")])
        self.identities = {"example.1": {"names": ["Alex Example"], "departments": []}}
        self.facts = {"example.1": [("MNS", "MATH1151", "MATH")]}

    def evaluate(self, exact=("example.1",)):
        return evaluate_profile(
            self.profile,
            self.observation,
            self.identities,
            self.facts,
            self.lexicon,
            exact,
        )

    def test_course_and_campus_verify_broad_department_without_alias(self):
        self.profile["department"] = "Science"
        self.assertEqual(self.evaluate()["reason"], "verified_name_campus_course")

    def test_missing_middle_is_supported_but_conflicting_explicit_middle_is_not(self):
        self.assertTrue(compatible_name(self.profile, self.person))
        self.profile["first_name"] = "Alex Morgan"
        self.assertFalse(compatible_name(self.profile, self.person))

    def test_compatible_middle_initial(self):
        self.profile["first_name"] = "Alex T."
        self.assertTrue(compatible_name(self.profile, self.person))

    def test_wrong_last_name_and_initial_only_first_are_rejected(self):
        self.person["last"] = "Examples"
        self.assertFalse(compatible_name(self.profile, self.person))
        self.person["last"] = "Example"
        self.profile["first_name"] = "A"
        self.assertFalse(compatible_name(self.profile, self.person))

    def test_nicknames_are_not_invented(self):
        self.person["first"] = "Alexander"
        self.assertFalse(compatible_name(self.profile, self.person))

    def test_same_name_other_campus_is_not_accepted(self):
        self.facts = {"example.1": [("COL", "MATH1151", "MATH")]}
        self.person["appointments"] = [
            {"title": "Lecturer", "organization": "Mathematics"}
        ]
        self.assertEqual(self.evaluate()["state"], "unresolved")

    def test_department_and_teaching_campus_can_verify_identity_without_same_course(
        self,
    ):
        self.profile["course_codes"] = []
        self.assertEqual(self.evaluate()["reason"], "verified_name_campus_department")

    def test_no_context_is_not_a_name_only_join(self):
        self.person["appointments"] = []
        self.facts = {}
        self.assertEqual(self.evaluate()["state"], "unresolved")

    def test_explicit_faculty_and_exact_campus_can_verify_without_recent_teaching_history(
        self,
    ):
        self.facts = {}
        self.identities = {}
        self.profile["department"] = "Science"
        self.assertEqual(self.evaluate(())["reason"], "verified_faculty_name_campus")

    def test_unrelated_explicit_academic_department_blocks_role_only_match(self):
        self.facts = {}
        self.identities = {}
        self.person["appointments"] = [
            {"title": "Professor", "organization": "Biology"}
        ]
        self.person["campuses"] = ["MNS"]
        self.assertEqual(self.evaluate(())["state"], "unresolved")

    def test_employee_affiliation_does_not_invent_a_faculty_appointment(self):
        self.facts = {}
        self.identities = {}
        self.person["roles"] = ["employee"]
        self.assertEqual(self.evaluate(())["state"], "unresolved")

    def test_two_fully_supported_accounts_stay_ambiguous(self):
        self.identities["example.2"] = self.identities["example.1"]
        self.facts["example.2"] = self.facts["example.1"]
        self.assertEqual(
            self.evaluate(("example.1", "example.2"))["state"], "ambiguous"
        )

    def test_own_course_evidence_outweighs_a_same_name_department_only_candidate(self):
        self.identities["example.2"] = self.identities["example.1"]
        self.facts["example.2"] = [("MNS", "MATH9999", "MATH")]
        result = self.evaluate(("example.1", "example.2"))
        self.assertEqual(result["state"], "confirmed")
        self.assertEqual(result["username"], "example.1")

    def test_incomplete_web_projection_does_not_erase_full_official_appointments(self):
        import copy

        weak = copy.deepcopy(self.person)
        weak.update(
            appointments=[],
            roles=[],
            source_url="https://math.osu.edu/people/example.1",
        )
        self.observation["candidates"].append(weak)
        result = self.evaluate()
        self.assertEqual(result["classification"]["category"], "lecturer")
        self.assertEqual(
            result["classification"]["appointments"][0]["title"], "Lecturer"
        )

    def test_current_central_appointments_take_priority_over_old_web_titles(self):
        import copy

        web = copy.deepcopy(self.person)
        web.update(
            roles=["professor"],
            appointments=[{"title": "Professor", "organization": "Mathematics"}],
            source_url="https://math.osu.edu/people/example.1",
        )
        self.observation["candidates"].append(web)
        self.assertEqual(self.evaluate()["classification"]["category"], "lecturer")

    def test_newest_positive_central_appointment_is_used(self):
        import copy
        self.person['observed_at']='2026-11-12T00:00:00Z'
        current=copy.deepcopy(self.person)
        current.update(observed_at='2026-11-13T00:00:00Z',roles=['professor'],appointments=[{'title':'Professor','organization':'Mathematics'}])
        self.observation['candidates'].append(current)
        self.assertEqual(self.evaluate()['classification']['category'],'professor')

    def test_source_failure_is_not_reported_as_not_found(self):
        self.observation = {"status": "unavailable", "candidates": []}
        self.assertEqual(self.evaluate(())["state"], "source_unavailable")

    def test_overfull_source_does_not_prove_uniqueness_without_own_course(self):
        self.observation["possibly_truncated"] = True
        self.profile["course_codes"] = []
        self.assertEqual(self.evaluate()["state"], "unresolved")

    def test_verified_past_teaching_survives_an_empty_current_directory(self):
        self.observation = {"status": "available", "candidates": []}
        self.assertEqual(self.evaluate()["state"], "confirmed")

    def test_classifier_preserves_explicit_retired_title(self):
        self.person["appointments"] = [
            {"title": "Associate Professor Emeritus", "organization": "Biology"}
        ]
        result = classification(self.person)
        self.assertEqual(result["category"], "emeritus")
        self.assertEqual(
            result["appointments"][0]["title"], "Associate Professor Emeritus"
        )


if __name__ == "__main__":
    unittest.main()
