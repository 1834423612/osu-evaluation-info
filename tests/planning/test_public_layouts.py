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
            return {'text':' '.join(t for x,t in cells),'cells':[{'x':x,'text':t,'width':6 if t.isdigit() else 36} for x,t in cells]}
        blocks=[row((20,'Sample Schedule')),row((212,'Autumn'),(416,'Spring'))]
        for year in range(1,5):
            blocks += [row((100,'MATH 1151'),(318,'5'),(327,'CSE 1223'),(540,'3')),
                       row((20,'Year '+str(year)),(100,'GE'),(318,'3'),(327,'Elective'),(540,'-')),
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

from html_schedule_adapter import structure_html
from inspected_pdf_adapter import structure_music, structure_engineering

class InspectedLayoutTests(unittest.TestCase):
    def source(self, adapter):
        return {'id':'synthetic','adapter':adapter,'program':'Synthetic degree','structure':'Synthetic fixture'}
    def test_lists_do_not_import_footer_or_subsequent_graduate_program(self):
        html='<article>'+''.join('<h2>Year %d</h2><h3>Autumn</h3><p>MATH 2999 - 3 cr</p><h3>Spring</h3><p>Elective - 3 cr</p>'%y for y in range(1,5))+'<h2>Graduate program</h2><p>CSE 9999 - 3 cr</p></article><footer>MATH 9999</footer>'
        result=structure_html(html.encode(),record,self.source('year-lists'))
        self.assertEqual(len(result[0]['semesters']),8)
        self.assertNotIn('9999',str(result))
        with self.assertRaises(ValueError):structure_html(html.replace('<h3>Spring</h3>', '<h3>Unknown</h3>').encode(),record,self.source('year-lists'))
    def test_combined_year_season_list_excludes_year_and_degree_totals(self):
        html='<article>'+''.join(f'<h3>Year {y}: {season}</h3><ul><li>MATH 2999 (3 credits)</li><li>Semester Total: 3 credits</li><li>Year Total: 6 credits</li></ul>' for y in range(1,5) for season in ['Autumn','Spring'])+'</article>'
        result=structure_html(html.encode(),record,self.source('year-lists'))[0]
        self.assertEqual([len(s['entries']) for s in result['semesters']],[1]*8)
    def test_music_superscripts_and_wrapped_ranges_do_not_become_course_digits(self):
        def row(*cells):return {'page':1,'text':' '.join(c[1] for c in cells),'cells':[{'x':c[0],'text':c[1],'height':c[2] if len(c)>2 else 8} for c in cells]}
        blocks=[]
        for year in range(4):
            blocks += [row((100,'Autumn Semester'),(287,'Cr'),(365,'Spring Semester'),(494,'Cr')),
              row((78,'Music 2999'),(140,'5',5),(288,'3'),(307,'GE Theme'),(495,'4')),
              row((495,'(3)')),row((78,'Total Hours'),(285,'13-'),(492,'16')),row((286,'15'))]
        result=structure_music({'blocks':blocks},record,self.source('music-pdf'))[0]
        self.assertEqual(result['semesters'][0]['entries'][0]['evidence'],'Music 2999 [3 credits]')
        self.assertEqual(result['semesters'][0]['credits'],{'min':13,'max':15})
        self.assertIsNone(result['semesters'][1]['entries'][0]['credits'])
        self.assertIn('alternative credits',result['semesters'][1]['entries'][0]['evidence'])
    def test_engineering_requires_registered_year_anchors(self):
        source={**self.source('engineering-pdf'),'yearStarts':['MATH 2991','MATH 2992','MATH 2993','MATH 2994']}
        def row(*cells):return {'page':1,'width':612,'text':' '.join(t for x,t in cells),'cells':[{'x':x,'text':t,'height':11} for x,t in cells]}
        blocks=[row((50,'Year'),(180,'Autumn'),(430,'Spring'))]
        for y in range(1,5):blocks += [row((100,f'MATH 299{y}'),(300,'3 hr'),(350,'Elective'),(550,'3 hr')),row((55,str(y)))]
        blocks += [row((30,'Total Hours to complete the degree program = 24'))]
        result=structure_engineering({'blocks':blocks},record,source)[0]
        self.assertEqual(sum(len(s['entries']) for s in result['semesters']),8)
        with self.assertRaises(ValueError):structure_engineering({'blocks':blocks[:-2]+blocks[-1:]},record,source)

from inspected_pdf_adapter import structure_nursing, structure_knowlton, structure_public_health

class FurtherInspectedPdfTests(unittest.TestCase):
    def row(self,*cells,page=1):
        return {'page':page,'text':' '.join(t for x,t in cells),'cells':[{'x':x,'text':t,'height':9} for x,t in cells]}
    def test_nursing_credit_between_wrapped_lines_and_blank_ge(self):
        blocks=[]
        for y in range(1,5):
            blocks += [self.row((49,f'Year {y}: Fall Semester Coursework'),(337,f'Year {y}: Spring Semester Coursework')),
                self.row((49,'N2999 Nursing care'),(337,'General Education Course')),
                self.row((28,'4')), self.row((49,'for patients'))]
        blocks += [self.row((28,'Fulfills a General Education requirement')),
                   self.row((49,'N9999 Footer'))]
        source={'program':'Synthetic','id':'synthetic','structure':'Synthetic inspected layout','expectedEntries':[1]*8}
        result=structure_nursing({'blocks':blocks},record,source)[0]
        self.assertEqual(result['semesters'][0]['entries'][0],{'evidence':'NURSING 2999 Nursing care for patients','credits':{'min':4,'max':4}})
        self.assertIsNone(result['semesters'][1]['entries'][0]['credits'])
        self.assertNotIn('9999',str(result))
    def test_knowlton_two_pages_and_wrapped_alternative(self):
        blocks=[]
        for y in range(1,5):
            blocks += [self.row((24,f'Year {y}'),page=1 if y<3 else 2),self.row((24,'Autumn'),(312,'Spring')),
                self.row((24,'ARCH 2990 or'),(108,'Seminar'),(289,'3'),(312,'Open Elective'),(577,'3')),
                self.row((24,'ARCH 2991')),self.row((283,'3'),(571,'3')),
                self.row((24,'ARCH 9999 Footer'))]
        result=structure_knowlton({'blocks':blocks},record,{'program':'Synthetic','id':'synthetic','structure':'Synthetic inspected layout'})[0]
        self.assertIn('ARCH 2991',result['semesters'][0]['entries'][0]['evidence'])
        self.assertNotIn('9999',str(result))
    def test_public_health_keeps_printed_total_and_ignores_requirement_pages(self):
        blocks=[self.row((128,'CHEM 9999'),(479,'5'),page=1)]
        for y in range(1,5):
            for season in ('Autumn','Spring'):
                blocks += [self.row((63,f'{season} {y}'),(128,'CHEM 2999'),(479,'5'),page=3),
                           self.row((63,'(14 credit'),page=3)]
        blocks += [self.row((276,'Total Minimum Credit Hours for Degree:'),(473,'121'),page=3)]
        result=structure_public_health({'blocks':blocks},record,{'program':'Synthetic','id':'synthetic','structure':'Synthetic inspected layout','samplePage':3})[0]
        self.assertNotIn('9999',str(result))
        self.assertEqual(result['semesters'][0]['credits'],{'min':14,'max':14})
        self.assertEqual(result['semesters'][0]['entries'][0]['credits'],{'min':5,'max':5})
