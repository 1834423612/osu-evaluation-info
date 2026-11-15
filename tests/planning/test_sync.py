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
