"""Conservative Year/Autumn/Spring public sample-table adapter."""
import re
from html.parser import HTMLParser


class Grids(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self.table = None
        self.row = None
        self.parts = None
        self.unsupported = False
    def handle_starttag(self, tag, attrs):
        if tag == 'table':
            if self.table is not None:
                self.unsupported = True
            self.table = []
        elif tag == 'tr' and self.table is not None:
            self.row = []
        elif tag in ('th', 'td') and self.row is not None:
            self.parts = []
            if any(k in ('colspan', 'rowspan') and v != '1' for k, v in attrs):
                self.unsupported = True
        elif tag in ('br', 'p', 'li', 'div') and self.parts is not None:
            self.parts.append('\n')
    def handle_data(self, data):
        if self.parts is not None:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag in ('p', 'li', 'div') and self.parts is not None:
            self.parts.append('\n')
        elif tag in ('td', 'th') and self.parts is not None:
            self.row.append([' '.join(line.split()) for line in ''.join(self.parts).splitlines() if line.strip()])
            self.parts = None
        elif tag == 'tr' and self.row is not None:
            self.table.append(self.row)
            self.row = None
        elif tag == 'table' and self.table is not None:
            self.tables.append(self.table)
            self.table = None


def credits(text):
    match = re.search(r'(\d{1,2}(?:\.\d+)?)(?:\s*[-–]\s*(\d{1,2}(?:\.\d+)?))?\s*(?:cr(?:edits?)?|hours?)\b', text, re.I)
    if not match:
        return None
    low, high = float(match[1]), float(match[2] or match[1])
    return {'min': low, 'max': high} if 0 <= low <= high <= 99 else None


def structure_grid(data, record, metadata):
    if metadata['documentKind'] != 'sample-plan':
        return []
    parser = Grids()
    parser.feed(data.decode('utf-8'))
    if parser.unsupported:
        return []
    candidates = []
    year_words = {'first':1, 'second':2, 'third':3, 'fourth':4, 'freshman':1, 'sophomore':2, 'junior':3, 'senior':4}
    for ordinal, table in enumerate(parser.tables):
        if not table or len(table[0]) != 3:
            continue
        header = [' '.join(c).lower() for c in table[0]]
        if header[0] != 'year' or not re.fullmatch(r'(?:autumn|fall)(?: semester)?', header[1]) or not re.fullmatch(r'spring(?: semester)?', header[2]):
            continue
        semesters = []
        for row in table[1:]:
            if len(row) != 3:
                semesters = []
                break
            label = ' '.join(row[0]).lower()
            match = re.fullmatch(r'(?:year\s*)?([1-4])(?:st|nd|rd|th)?(?:\s*year)?', label)
            year = int(match[1]) if match else year_words.get(label.replace(' year', ''))
            if not year:
                semesters = []
                break
            for term, cell in zip(('Autumn', 'Spring'), row[1:]):
                entries = [{'evidence': line, 'credits': credits(line)} for line in cell if not re.match(r'^(?:semester\s+)?total\s*:', line, re.I)]
                if not entries or len(entries) > 30 or any(len(e['evidence']) > 500 for e in entries):
                    semesters = []
                    break
                total = next((credits(line) for line in cell if re.match(r'^(?:semester\s+)?total\s*:', line, re.I)), None)
                semesters.append({'label': 'Year %d: %s' % (year, term), 'credits': total, 'entries': entries})
        if len(semesters) != 8 or len(set(s['label'] for s in semesters)) != 8:
            continue
        candidates.append({'schemaVersion':1,'id':'grid-'+record['sha256'][:24]+'-'+str(ordinal),
            'source':{'url':record['url'],'sha256':record['sha256'],'fetchedAt':record['fetchedAt'],'validatedAt':None,'mediaType':'text/html'},
            'documentKind':'sample-plan','program':metadata['title'][:150],'specialization':None,'campus':None,
            'geSystem':metadata['geSystems'][0] if len(metadata['geSystems'])==1 else None,
            'version':record['sha256'][:16]+'-grid-v1','applicableFrom':None,'applicableUntil':None,
            'publicationStatus':metadata['publicationStatus'],'planScope':'unknown',
            'academicYear':metadata['academicYears'][0] if len(metadata['academicYears'])==1 else None,
            'evidence':[metadata['title'],'Explicit Year/Autumn/Spring table; alternatives and footnotes remain source evidence.'],
            'semesters':semesters,'reviewStatus':'pending','reviewedAt':None,'reviewer':None})
    return candidates
