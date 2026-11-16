"""Conservative public HTML table adapter; every result still requires human review."""
import re
from html.parser import HTMLParser
from urllib.parse import urlsplit


class Tables(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.cell = None
        self.parts = []
        self.caption = False
        self.text = []
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            self.table = {'caption': '', 'rows': []}
        elif self.table is not None and tag == 'caption':
            self.caption = True
        elif self.table is not None and tag == 'tr':
            self.row = []
        elif self.row is not None and tag in ('th', 'td'):
            self.cell = tag
            self.parts = []
    def handle_data(self, data):
        self.text.append(data)
        if self.caption and self.table is not None:
            self.table['caption'] += data
        if self.cell:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == 'caption':
            self.caption = False
        elif self.cell == tag:
            self.row.append(' '.join(''.join(self.parts).split()))
            self.cell = None
        elif tag == 'tr' and self.row is not None:
            self.table['rows'].append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def structure_tables(data, record):
    url = urlsplit(record['url'])
    if url.scheme != 'https' or not (url.hostname == 'osu.edu' or (url.hostname or '').endswith('.osu.edu')):
        return []
    parser = Tables()
    parser.feed(data.decode('utf-8'))
    if not re.search(r'\b(?:sample|four[- ]year|4[- ]year)\b', ' '.join(parser.text), re.I):
        return []
    semesters = []
    labels = set()
    for table in parser.tables:
        label = ' '.join(table['caption'].split())
        if not re.fullmatch(r'Year [1-4]: (Autumn|Spring)', label) or label in labels or not table['rows']:
            continue
        header = [x.lower() for x in table['rows'][0]]
        if header.count('course') != 1 or header.count('credits') != 1:
            continue
        course_index, credit_index = header.index('course'), header.index('credits')
        entries = []
        for row in table['rows'][1:]:
            if len(row) != len(header):
                return []  # colspan/rowspan and unknown columns require a dedicated adapter.
            code = row[course_index]
            if not re.fullmatch(r'[A-Z][A-Z& ]{1,11} \d{4}(?:\.\d{1,2})?[A-Z]?', code):
                return []  # Never flatten alternatives, electives or hidden footnotes.
            match = re.fullmatch(r'(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?', row[credit_index])
            credits = {'min': int(match[1]), 'max': int(match[2] or match[1])} if match else None
            if credits and credits['min'] > credits['max']:
                return []
            entries.append({'evidence': code, 'credits': credits})
        if entries:
            semesters.append({'label': label, 'credits': None, 'entries': entries})
            labels.add(label)
    if len(semesters) != 8:
        return []
    return [{'schemaVersion': 1, 'id': 'table-' + record['sha256'][:24],
             'source': {'url': record['url'], 'sha256': record['sha256'], 'fetchedAt': record['fetchedAt'], 'validatedAt': None, 'mediaType': 'text/html'},
             'publicationStatus': 'draft' if re.search(r'\bdraft\b', ' '.join(parser.text), re.I) else 'unknown',
             'planScope': 'multi-program' if re.search(r'\b(?:double|dual) major', ' '.join(parser.text), re.I) else 'unknown',
             'academicYear': None,
             'documentKind': 'sample-plan', 'program': 'Unassigned; review source', 'specialization': None,
             'campus': None, 'geSystem': None, 'version': record['sha256'][:16], 'applicableFrom': None, 'applicableUntil': None,
             'evidence': ['Eight explicitly captioned semester tables; verify program, footnotes and applicability.'],
             'semesters': semesters, 'reviewStatus': 'pending', 'reviewedAt': None, 'reviewer': None}]
