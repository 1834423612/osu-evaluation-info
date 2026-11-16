"""Pending sample candidates from explicit Year 1-4 / Autumn-Spring PDF columns."""
import re
from course_codes import course_codes
from grid_adapter import credits

YEAR = re.compile(r'\b(?:Year\s*([1-4])|([1-4])(?:st|nd|rd|th)\s+Year|((?:First|Second|Third|Fourth|Freshman|Sophomore|Junior|Senior))\s+Year)\b', re.I)
SEASON = re.compile(r'\b(Autumn|Fall|Spring)\b', re.I)


def year_number(text):
    match = YEAR.search(text)
    if not match:
        return None
    words = {'first':1,'second':2,'third':3,'fourth':4,'freshman':1,'sophomore':2,'junior':3,'senior':4}
    return int(match[1] or match[2]) if match[1] or match[2] else words[match[3].lower()]


def numeric(text):
    match = re.fullmatch(r'(\d{1,2}(?:\.\d+)?|\.\d+)(?:\s*[-–]\s*(\d{1,2}(?:\.\d+)?))?', text.strip())
    if not match:
        return None
    low, high = float(match[1]), float(match[2] or match[1])
    return {'min':low,'max':high} if 0 <= low <= high <= 99 else None


def structure_pdf(evidence, record, metadata):
    blocks = evidence.get('blocks', [])
    # A requirements sheet can contain a sample later in the document. Do not
    # interpret earlier requirement tables as planned attendance.
    started = False
    current_year = None
    columns = {}
    semesters = {}
    for block in blocks:
        line = block['text']
        if re.search(r'\bsample\s+(?:curriculum|plan|schedule)|\b(?:four|4)[- ]year\b', line, re.I):
            started = True
        if not started:
            continue
        cells = block.get('cells', [])
        width = block.get('width')
        if not cells or not width:
            continue
        if len(line) < 110 and not course_codes(line):
            found_years = set(filter(None, (year_number(c['text']) for c in cells)))
            if len(found_years) == 1:
                current_year = found_years.pop()
                columns = {}
        headers = []
        if current_year:
            for cell in cells:
                text = cell['text'].strip()
                season = SEASON.search(text)
                if season and len(text) < 70 and not course_codes(text) and re.search(r'semester|course|^(?:Autumn|Fall|Spring)$|Year', text, re.I):
                    headers.append((0 if cell['x'] < width / 2 else 1, 'Autumn' if season[1].lower() == 'fall' else season[1].capitalize()))
        if len(set(side for side, _ in headers)) == 2 and len(set(term for _, term in headers)) == 2:
            for side, term in headers:
                label = 'Year %d: %s' % (current_year, term)
                semester = semesters.setdefault(label, {'label':label,'credits':None,'entries':[]})
                columns[side] = {'semester':semester,'creditX':None,'closed':False}
        if not columns:
            continue
        header_row = any(re.fullmatch(r'(?:hours?|credits?)', c['text'].strip(), re.I) for c in cells)
        for side, column in columns.items():
            segment = [c for c in cells if (c['x'] < width / 2) == (side == 0)]
            for cell in segment:
                if re.fullmatch(r'(?:hours?|credits?)', cell['text'].strip(), re.I):
                    column['creditX'] = cell['x']
            if headers or header_row or column['closed']:
                continue
            text = ' '.join(c['text'] for c in segment).strip()
            if not text:
                continue
            value = None
            if column['creditX'] is not None:
                numeric_cells = sorted((c for c in segment if abs(c['x']-column['creditX']) < 20 and numeric(c['text']) is not None), key=lambda c:abs(c['x']-column['creditX']))
                if numeric_cells:
                    value = numeric(numeric_cells[0]['text'])
            value = value or credits(text)
            if re.match(r'^(?:semester\s+)?total\b', text, re.I):
                column['semester']['credits'] = value
                column['closed'] = True
                continue
            if re.match(r'^[*†‡]|^Note\b|^Updated\b', text, re.I):
                continue
            course_row = bool(course_codes(text) or re.match(r'^(?:GE\b|GenEd\b|Elective\b|[A-Z&]{2,12}\s+\d{4})', text))
            if course_row:
                if len(text) > 500 or len(column['semester']['entries']) >= 30:
                    return []
                column['semester']['entries'].append({'evidence':text,'credits':value})
    expected = ['Year %d: %s' % (year,term) for year in range(1,5) for term in ('Autumn','Spring')]
    if set(semesters) != set(expected) or any(not s['entries'] for s in semesters.values()):
        return []
    for semester in semesters.values():
        if semester['credits'] and sum(e['credits']['min'] for e in semester['entries'] if e['credits']) > semester['credits']['max'] + .01:
            return []
    return [{'schemaVersion':1,'id':'pdf-'+record['sha256'][:24],
        'source':{'url':record['url'],'sha256':record['sha256'],'fetchedAt':record['fetchedAt'],'validatedAt':None,'mediaType':'application/pdf'},
        'documentKind':'sample-plan','program':metadata['title'][:150],'specialization':None,'campus':None,
        'geSystem':metadata['geSystems'][0] if len(metadata['geSystems'])==1 else None,
        'version':record['sha256'][:16]+'-pdf-columns-v1','applicableFrom':None,'applicableUntil':None,
        'publicationStatus':metadata['publicationStatus'],'planScope':'unknown',
        'academicYear':metadata['academicYears'][0] if len(metadata['academicYears'])==1 else None,
        'evidence':[metadata['title'],'Explicit Year 1-4 and Autumn/Spring columns. Verify alternatives, footnotes, credit columns and applicability.'],
        'semesters':[semesters[label] for label in expected],'reviewStatus':'pending','reviewedAt':None,'reviewer':None}]


def structure_math_schedule(evidence, record, metadata):
    """Verified Mathematics layout with four year labels and paired totals."""
    started, boundary, label_seen, calibrated = False, None, False, False
    collected, semesters, year = [[], []], [], 1
    for block in evidence.get('blocks', []):
        line, cells = block['text'], block.get('cells', [])
        if re.search(r'\bSample Schedule\b', line, re.I):
            started = True
            continue
        if not started or year > 4:
            continue
        autumn = next((c for c in cells if c['text'].strip() == 'Autumn'), None)
        spring = next((c for c in cells if c['text'].strip() == 'Spring'), None)
        if autumn and spring and autumn.get('width') and spring.get('width'):
            boundary = (autumn['x'] + autumn['width']/2 + spring['x'] + spring['width']/2)/2
            continue
        if boundary is None:
            continue
        if not calibrated:
            anchors = sorted((c for c in cells if course_codes(c['text'])), key=lambda c:c['x'])
            if len(anchors) == 2 and anchors[1]['x'] - anchors[0]['x'] > 100:
                left_numbers = [c for c in cells if anchors[0]['x'] < c['x'] < anchors[1]['x'] and numeric(c['text']) is not None]
                right_numbers = [c for c in cells if c['x'] > anchors[1]['x'] and numeric(c['text']) is not None]
                if left_numbers and right_numbers:
                    end = max(c['x'] + c.get('width', 0) for c in left_numbers)
                    if end < anchors[1]['x']:
                        boundary = (end + anchors[1]['x']) / 2
                        calibrated = True
        for cell in cells:
            if re.fullmatch(r'Year [1-4]', cell['text'].strip()):
                if year_number(cell['text']) != year:
                    return []
                label_seen = True
        segments = [[c for c in cells if (c['x'] < boundary) == (side == 0) and not re.fullmatch(r'Year [1-4]', c['text'].strip())] for side in (0, 1)]
        text = [' '.join(c['text'] for c in segment).strip() for segment in segments]
        totals = [numeric(t) for t in text]
        if all(totals):
            if not label_seen or any(not entries for entries in collected):
                return []
            for side, term in enumerate(('Autumn', 'Spring')):
                credit_x = max(c['x'] for c in segments[side] if numeric(c['text']))
                entries = []
                for row in collected[side]:
                    value = next((numeric(c['text']) for c in row if abs(c['x'] - credit_x) < 20 and numeric(c['text']) is not None), None)
                    entries.append({'evidence': ' '.join(c['text'] for c in row), 'credits': value})
                if sum(e['credits']['min'] for e in entries if e['credits']) > totals[side]['max'] + .01:
                    return []
                semesters.append({'label': 'Year %d: %s' % (year, term), 'credits': totals[side], 'entries': entries})
            year += 1
            label_seen = False
            collected = [[], []]
        else:
            for side in (0, 1):
                if course_codes(text[side]) or re.match(r'^(?:GE|Actuarial Elective|Elective)\b', text[side], re.I):
                    collected[side].append(segments[side])
    if len(semesters) != 8 or not calibrated:
        return []
    return [{'schemaVersion': 1, 'id': 'math-pdf-v2-' + record['sha256'][:24],
        'source': {'url': record['url'], 'sha256': record['sha256'], 'fetchedAt': record['fetchedAt'], 'validatedAt': None, 'mediaType': 'application/pdf'},
        'documentKind': 'sample-plan', 'program': metadata['title'][:150], 'specialization': None, 'campus': None, 'geSystem': None,
        'version': record['sha256'][:16] + '-math-columns-v2', 'applicableFrom': None, 'applicableUntil': None,
        'publicationStatus': metadata['publicationStatus'], 'planScope': 'unknown', 'academicYear': None,
        'evidence': [metadata['title'], 'Year labels, two semester columns and four paired reported totals. Verify alternatives and footnotes; additional degree coursework may be omitted.'],
        'semesters': semesters, 'reviewStatus': 'pending', 'reviewedAt': None, 'reviewer': None}]
