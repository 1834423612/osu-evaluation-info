from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts/rmp"))
from research_pdf_profiles import (
    official_pdf_url,
    pdf_contact_evidence,
    clean_organization,
)
from identity_research import classification, merge_people


class PdfResearchTests(unittest.TestCase):
    profile = {"id": 1, "first_name": "Alex", "last_name": "Example"}
    url = "https://math.osu.edu/sites/default/files/example-cv.pdf"

    def test_accepts_one_name_and_its_canonical_account_with_historical_provenance(
        self,
    ):
        text = "Alex Taylor Example\nAssociate Professor\nDepartment of Mathematics\nColumbus, Ohio\nexample.12@osu.edu"
        row = pdf_contact_evidence(text, [self.profile], self.url, 2)[0]
        self.assertEqual(row["person"]["user"], "example.12")
        self.assertEqual(row["person"]["source_page"], 2)
        self.assertEqual(row["person"]["campuses"], ["COL"])
        self.assertEqual(row["person"]["source_kind"], "historical-document")

    def test_rejects_a_different_persons_nearest_email(self):
        text = "Alex Example\nJordan Other\nother.2@osu.edu\nexample.12@osu.edu"
        self.assertEqual(pdf_contact_evidence(text, [self.profile], self.url, 1), [])

    def test_rejects_an_intervening_same_family_person(self):
        self.assertEqual(
            pdf_contact_evidence(
                "Alex Example\nJordan Example\nexample.12@osu.edu",
                [self.profile],
                self.url,
                1,
            ),
            [],
        )

    def test_does_not_invent_an_account_for_a_person_without_one(self):
        self.assertEqual(
            pdf_contact_evidence(
                "Alex Example\nProfessor\nColumbus", [self.profile], self.url, 1
            ),
            [],
        )

    def test_official_document_hosts_and_https_upgrade_are_bounded(self):
        self.assertEqual(
            official_pdf_url("http://math.osu.edu/a.pdf"), "https://math.osu.edu/a.pdf"
        )
        self.assertIsNone(official_pdf_url("https://math.osu.edu.evil.test/a.pdf"))
        self.assertIsNone(official_pdf_url("https://user:pass@math.osu.edu/a.pdf"))

    def test_historical_title_is_not_a_current_appointment(self):
        value = classification(
            {
                "appointment_source_kind": "historical-document",
                "appointments": [{"title": "Professor", "organization": "Mathematics"}],
                "roles": ["professor"],
            }
        )
        self.assertEqual(value["category"], "unknown")
        self.assertEqual(value["appointments"], [])
        self.assertEqual(value["historical_appointments"][0]["title"], "Professor")

    def test_current_directory_position_outweighs_more_recently_fetched_old_pdf(self):
        base = {
            "user": "example.12",
            "first": "Alex",
            "last": "Example",
            "name": "Alex Example",
            "roles": ["lecturer"],
            "appointments": [{"title": "Lecturer", "organization": "Mathematics"}],
            "observed_at": "2026-11-12",
        }
        old = {
            **base,
            "roles": ["professor"],
            "appointments": [{"title": "Professor", "organization": "Mathematics"}],
            "source_url": self.url,
            "source_kind": "historical-document",
            "observed_at": "2026-11-13",
        }
        merged = merge_people(
            {"first_name": "Alex", "last_name": "Example"}, [base, old]
        )["example.12"]
        self.assertEqual(classification(merged)["category"], "lecturer")

    def test_department_fields_exclude_contact_numbers_and_addresses(self):
        self.assertEqual(
            clean_organization("Department of Political Science office: 614-292-0000"),
            "Department of Political Science",
        )
        self.assertEqual(
            clean_organization("Department of Germanic Languages example.1@osu.edu"),
            "Department of Germanic Languages",
        )

    def test_cv_address_below_email_column_stays_in_the_same_header(self):
        text = "Alex Example\nDepartment of Mathematics email: example.12@osu.edu\n100 Example Hall\nColumbus, Ohio\n\nEDUCATION"
        self.assertEqual(
            pdf_contact_evidence(text, [self.profile], self.url, 1)[0]["person"][
                "campuses"
            ],
            ["COL"],
        )


if __name__ == "__main__":
    unittest.main()
