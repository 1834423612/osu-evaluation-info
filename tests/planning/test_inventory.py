import importlib.util
import sys
import unittest
from pathlib import Path
from urllib.error import HTTPError
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parents[2] / 'scripts/planning'))
import inventory
from sync import PublicFetcher, discover, official_url


class InventoryTests(unittest.TestCase):
    def test_college_index_preserves_rows_and_ignores_surrounding_navigation(self):
        html = '<nav><h2>Ignored</h2></nav><h1>Majors by college</h1><h2>Engineering</h2><p>Learn more about the College.<br>Computer Science and Engineering<br>Mechanical Engineering</p><h2>Arts and Sciences</h2><h3>Arts</h3><div>Music</div><h2>Undecided/Exploring</h2><p>Not a major</p>'
        rows = inventory.program_inventory(html.encode())
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0]['college'], 'Engineering')
        self.assertEqual(rows[2]['category'], 'Arts')
        self.assertEqual(rows, inventory.program_inventory(html.encode()))

    def test_document_year_does_not_become_an_applied_version(self):
        record = {'url': 'https://example.osu.edu/2026-2027/curriculum.pdf'}
        data = inventory.document_metadata(record, [{'kind': 'h1', 'text': 'Sample four-year curriculum 2026-2027'}, {'kind': 'text', 'text': 'Effective Term: AU 22. CSE 2999H. MATH 2153. GEN.'}])
        self.assertEqual(data['academicYears'], ['2026-2027'])
        self.assertEqual(data['effectiveTerms'], ['AU2022'])
        self.assertEqual(data['appliedVersions'], [])
        self.assertEqual(data['documentKind'], 'sample-plan')
        self.assertEqual(len(data['courseReferences']), 2)

    def test_public_revisions_and_official_aliases_only(self):
        self.assertIn('VersionId=v1', official_url('https://files.fisher.osu.edu/x.pdf?VersionId=v1'))
        self.assertEqual(official_url('https://students.cfaes.ohio-state.edu/curriculum'), 'https://students.cfaes.ohio-state.edu/curriculum')
        for url in ['https://degreeplanner.osu.edu/app', 'https://osu.edu/login', 'https://example.osu.edu/x.pdf?token=secret', 'https://files.fisher.osu.edu/x?VersionId=abc']:
            with self.assertRaises(ValueError):
                official_url(url)

    def test_discovery_excludes_login_and_carries_link_labels(self):
        result = discover(b'<nav><a href="/curriculum-navigation">Ignore</a></nav><a href="/curriculum.pdf">2026 Curriculum</a><a href="https://evil.test/major">Bad</a><a href="/login">Major Login</a>', 'https://example.osu.edu/')
        self.assertEqual(result, [{'url': 'https://example.osu.edu/curriculum.pdf', 'label': '2026 Curriculum'}])

    def test_redirects_recheck_policy_and_cannot_escape_to_private_origins(self):
        fetcher = PublicFetcher()
        with patch.object(fetcher, 'policy', return_value=0) as policy, patch.object(fetcher, 'raw', side_effect=[HTTPError('https://example.osu.edu/a', 302, 'redirect', {'Location': 'https://other.osu.edu/b'}, None), (b'ok', 'text/html')]):
            self.assertEqual(fetcher.fetch('https://example.osu.edu/a')[2], 'https://other.osu.edu/b')
            self.assertEqual(policy.call_count, 2)
        with patch.object(fetcher, 'policy', return_value=0), patch.object(fetcher, 'raw', side_effect=HTTPError('https://example.osu.edu/a', 302, 'redirect', {'Location': 'http://localhost/'}, None)):
            with self.assertRaises(ValueError):
                fetcher.fetch('https://example.osu.edu/a')
