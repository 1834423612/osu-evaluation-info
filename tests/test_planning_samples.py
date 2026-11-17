import importlib.util
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts/planning'))
from cse_adapter import caption_terms, grid_terms
from samples import group_choices


class InspectedSamplesTests(unittest.TestCase):
    def test_caption_preserves_conditions_and_alternatives(self):
        tables = [{'caption': 'Year 3 Autumn: 14-15 hours', 'rows': [
            ['Course', 'Hours'], ['CSE 2501 or PHILOS 2338', '1 or 4'],
            ['[GE-Theme if not PHILOS 2338]', '[4]'], ['CSE 390x', '4']]}]
        term = caption_terms(tables)[0]
        self.assertEqual(term['credits'], {'min': 14, 'max': 15})
        self.assertIsNone(term['entries'][0]['credits'])
        self.assertIsNone(term['entries'][1]['credits'])
        self.assertIn('390x', term['entries'][2]['evidence'])

    def test_grid_requires_known_columns(self):
        self.assertEqual(grid_terms([{'rows': [['Fall', 'Spring'], ['Year 1']]}]), [])
        semesters = grid_terms([{'rows': [['Autumn', 'Spring'], ['Year 1'],
            ['MATH 1151 - 5 credits', 'CSE 2221 - 4 credits'],
            ['Total of 5 credits', 'Total of 4 credits']]}])
        self.assertEqual([s['label'] for s in semesters], ['Year 1: Autumn', 'Year 1: Spring'])
        self.assertEqual(semesters[0]['credits']['min'], 5)

    def test_bulleted_choices_remain_one_requirement(self):
        result = group_choices({'semesters': [{'entries': [
            {'evidence': 'One Additional Supporting Science (4-5 cr):', 'credits': {'min': 4, 'max': 5}},
            {'evidence': '• CHEM 1210 (5 cr)', 'credits': {'min': 5, 'max': 5}},
            {'evidence': '• BIOLOGY 1113 or 1114 (4 cr)', 'credits': {'min': 4, 'max': 4}},
            {'evidence': 'GE Course (3 cr)', 'credits': {'min': 3, 'max': 3}},
        ]}]})
        self.assertEqual(len(result['semesters'][0]['entries']), 2)
        self.assertEqual(result['semesters'][0]['entries'][0]['credits'], {'min': 4, 'max': 5})


if __name__ == '__main__':
    unittest.main()
