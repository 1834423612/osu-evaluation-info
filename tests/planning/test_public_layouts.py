import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parents[2]/'scripts/planning'))
from course_codes import course_codes
from grid_adapter import structure_grid
from pdf_adapter import structure_pdf, structure_math_schedule

record={'url':'https://example.osu.edu/sample.pdf','sha256':'a'*64,'fetchedAt':'2026-11-16T00:00:00Z'}
metadata={'title':'Synthetic sample plan','documentKind':'sample-plan','geSystems':[],'academicYears':[],'publicationStatus':'unknown'}

class PublicLayoutTests(unittest.TestCase):
    def test_math_pdf_merged_year_labels_and_credit_columns(self):
        def row(*cells):
            return {'text':' '.join(t for x,t in cells),'cells':[{'x':x,'text':t,'width':36} for x,t in cells]}
        blocks=[row((20,'Sample Schedule')),row((212,'Autumn'),(416,'Spring'))]
        for year in range(1,5):
            blocks += [row((100,'MATH 1151'),(318,'5'),(350,'CSE 1223'),(540,'3')),
                       row((20,'Year '+str(year)),(100,'GE'),(318,'3'),(350,'Elective'),(540,'-')),
                       row((318,'8'),(540,'3'))]
        result=structure_math_schedule({'blocks':blocks},record,metadata)
        self.assertEqual(len(result[0]['semesters']),8)
        self.assertEqual(result[0]['semesters'][0]['entries'][0]['credits'],{'min':5,'max':5})
        self.assertIsNone(result[0]['semesters'][1]['entries'][1]['credits'])
        self.assertEqual(structure_math_schedule({'blocks':blocks[:-1]},record,metadata),[])
    def test_official_subject_names_are_normalized_without_inventing_abbreviations(self):
        codes=course_codes('Math 1151, Mathematics 1152, Music 1101, Chemistry 1210, Japanese 1101.01H, YEAR 2026')
        self.assertIn(('MATH','1151'),codes)
        self.assertIn(('MUSIC','1101'),codes)
        self.assertIn(('CHEM','1210'),codes)
        self.assertIn(('JAPANSE','1101.01H'),codes)
        self.assertNotIn(('YEAR','2026'),codes)
    def test_explicit_year_grid_preserves_alternatives_and_unknown_elective_credits(self):
        html='<h1>Sample</h1><table><tr><th>Year</th><th>Autumn Semester</th><th>Spring Semester</th></tr>'+''.join('<tr><td>Year %d</td><td><p>MATH 1151 or 1152 (3 cr)</p><p>Total: 3 Credits</p></td><td><p>Elective (credits unknown)</p></td></tr>'%y for y in range(1,5))+'</table>'
        candidates=structure_grid(html.encode(),{**record,'url':'https://example.osu.edu/sample'},metadata)
        self.assertEqual(len(candidates[0]['semesters']),8)
        self.assertIn('or 1152',candidates[0]['semesters'][0]['entries'][0]['evidence'])
        self.assertIsNone(candidates[0]['semesters'][1]['entries'][0]['credits'])
        self.assertEqual(structure_grid(html.replace('Year 4','Unknown year').encode(),record,metadata),[])
    def test_pdf_columns_require_eight_explicit_semesters_and_never_infer_blank_credits(self):
        def row(*cells):return {'text':' '.join(t for x,t in cells),'cells':[{'x':x,'text':t} for x,t in cells],'width':612,'page':1,'kind':'text'}
        blocks=[row((20,'Sample Curriculum Plan'))]
        for year in range(1,5):
            blocks += [row((20,'Year '+str(year))),row((20,'Autumn Course'),(270,'Credits'),(330,'Spring Course'),(570,'Credits')),row((20,'CSE 2999'),(270,'3'),(330,'Elective'),(570,'-')),row((20,'Total'),(270,'3'),(330,'Total'),(570,'16'))]
        result=structure_pdf({'blocks':blocks},record,metadata)
        self.assertEqual(len(result[0]['semesters']),8)
        self.assertEqual(result[0]['semesters'][0]['entries'][0]['credits'],{'min':3,'max':3})
        self.assertIsNone(result[0]['semesters'][1]['entries'][0]['credits'])
        self.assertEqual(result[0]['semesters'][1]['credits'],{'min':16,'max':16})
        self.assertEqual(structure_pdf({'blocks':blocks[:-4]},record,metadata),[])
