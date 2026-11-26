import unittest
from scripts.rmp.reconcile_courses import semantic_diff, plan_fingerprint, before_fingerprint, safe_diagnostic


class ReconciliationPlanTests(unittest.TestCase):
    def test_diff_includes_new_withdrawn_changed_and_removed_labels(self):
        def row(token, key=None, state="unresolved"):
            return {"professor_id": 1, "campus_code": "COL", "raw_course_token": token,
                    "state": state, "course_key": key, "reason": "test", "candidates": []}
        changes = semantic_diff([row("1131", "MATH1131", "accepted"), row("OLD")],
                                [row("1131", None, "ambiguous"), row("NEW", "STAT1350", "accepted")])
        by_token = {r["raw_course_token"]: r for r in changes}
        self.assertEqual(by_token["1131"]["after"]["state"], "ambiguous")
        self.assertIsNone(by_token["NEW"]["before"])
        self.assertEqual(by_token["OLD"]["after"]["state"], "stale")

    def test_plan_sha_ignores_transient_before_marker_but_tracks_evidence(self):
        a = [{"state": "accepted", "evidence": {"before_available": True, "official_teaching_courses": ["MATH1131"]}}]
        b = [{"state": "accepted", "evidence": {"before_available": False, "official_teaching_courses": ["MATH1131"]}}]
        self.assertEqual(plan_fingerprint(a), plan_fingerprint(b))
        b[0]["evidence"]["official_teaching_courses"] = ["STAT1131"]
        self.assertNotEqual(plan_fingerprint(a), plan_fingerprint(b))

    def test_before_hash_changes_for_manual_decision_and_safe_errors_omit_credentials(self):
        before = [{"state": "accepted", "course_key": "MATH1131"}]
        self.assertNotEqual(before_fingerprint(before, []), before_fingerprint(before, [{"version": 1}]))
        diagnostic = safe_diagnostic(Exception("postgres://secret:password@host/db"), "read-source")
        self.assertNotIn("password", str(diagnostic))
        self.assertEqual(diagnostic["stage"], "read-source")
