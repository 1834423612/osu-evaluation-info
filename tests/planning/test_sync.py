import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('planning_sync', Path(__file__).parents[2] / 'scripts/planning/sync.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class SyncTests(unittest.TestCase):
    def test_public_urls_only(self):
        for value in ['https://osu.edu.evil.test/', 'http://osu.edu/', 'https://user:pass@osu.edu/', 'https://osu.edu/?token=secret', 'https://localhost/', 'https://osu.edu:8443/']:
            with self.assertRaises(ValueError):
                sync.official_url(value)
        self.assertEqual(sync.official_url('https://molgen.osu.edu/sample-curriculum#x'), 'https://molgen.osu.edu/sample-curriculum')
    def test_extracts_links_without_scripts(self):
        parser = sync.Links()
        parser.feed('<script>secret</script><a href="/curriculum">Curriculum</a>')
        self.assertEqual(parser.links, ['/curriculum'])

class StructureTests(unittest.TestCase):
    def test_unknown_layout_stays_unpublished(self):
        spec = importlib.util.spec_from_file_location('structure', Path(__file__).parents[2] / 'scripts/planning/structure.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        self.assertEqual(module.structure(b'<h2>New unsupported layout</h2>', {'url':'https://molgen.osu.edu/sample-curriculum'}), [])
        self.assertEqual(module.credit_range('Elective 2-3 credits'), {'min':2,'max':3})
        self.assertIsNone(module.credit_range('Elective -'))

class TableAdapterTests(unittest.TestCase):
    def test_captioned_public_tables_are_pending_and_unknown_layouts_are_rejected(self):
        spec = importlib.util.spec_from_file_location('tables', Path(__file__).parents[2] / 'scripts/planning/table_adapter.py')
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        html = '<h1>Sample four-year plan</h1>' + ''.join('<table><caption>Year %s: %s</caption><tr><th>Course</th><th>Credits</th></tr><tr><td>CSE 2999H</td><td>3-4</td></tr></table>' % (year, term) for year in range(1,5) for term in ['Autumn','Spring'])
        record={'url':'https://example.osu.edu/sample', 'sha256':'a'*64, 'fetchedAt':'2026-01-01T00:00:00Z'}
        candidate=adapter.structure_tables(html.encode(),record)[0]
        self.assertEqual(candidate['reviewStatus'],'pending')
        self.assertIsNone(candidate['semesters'][0]['credits'])
        self.assertEqual(candidate['semesters'][0]['entries'][0]['credits'],{'min':3,'max':4})
        self.assertEqual(adapter.structure_tables(html.replace('CSE 2999H','CSE 2999H or MATH 2999').encode(),record),[])
        self.assertEqual(adapter.structure_tables(html.encode(),{**record,'url':'https://evil.example/'}),[])
