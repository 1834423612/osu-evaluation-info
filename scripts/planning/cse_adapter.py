"""Adapters for the manually inspected CSE department sample schedules."""
import re
from table_adapter import Tables


def credit_range(text):
    match = re.fullmatch(r'(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?', text.strip())
    if not match:
        return None
    low, high = int(match[1]), int(match[2] or match[1])
    return {'min': low, 'max': high} if low <= high else None


def caption_terms(tables):
    semesters = []
    for table in tables:
        match = re.fullmatch(r'Year ([1-4]) (Autumn|Spring): (.+) hours', table['caption'].strip())
        if not match:
            continue
        if not table['rows'] or table['rows'][0] != ['Course', 'Hours']:
            return []
        entries = []
        for row in table['rows'][1:]:
            if len(row) != 2 or not all(row):
                return []
            entries.append({'evidence': row[0] + ' — ' + row[1] + ' hours',
                            'credits': credit_range(row[1]) if not row[0].startswith('[') else None})
        semesters.append({'label': f'Year {match[1]}: {match[2]}',
                          'credits': credit_range(match[3]), 'entries': entries})
    return semesters


def grid_terms(tables):
    matches = [table for table in tables if table['rows'] and table['rows'][0] == ['Autumn', 'Spring']]
    if len(matches) != 1:
        return []
    semesters = []
    pair = None
    for row in matches[0]['rows'][1:]:
        if len(row) == 1 and re.fullmatch(r'Year [1-4]', row[0]):
            pair = [{'label': row[0] + ': ' + season, 'credits': None, 'entries': []}
                    for season in ('Autumn', 'Spring')]
            semesters.extend(pair)
            continue
        if len(row) != 2 or pair is None:
            return []
        for cell, semester in zip(row, pair):
            if not cell:
                continue
            total = re.fullmatch(r'Total of (.+) credits', cell)
            if total:
                if semester['credits'] is not None:
                    return []
                semester['credits'] = credit_range(total[1])
                continue
            match = re.search(r' - (\d+(?:-\d+)?) credits?$', cell)
            semester['entries'].append({'evidence': cell,
                'credits': credit_range(match[1]) if match and '[' not in cell and ' or ' not in cell else None})
    return semesters


def structure_cse(data, record, source):
    parser = Tables()
    parser.feed(data.decode('utf-8'))
    semesters = caption_terms(parser.tables) if source['adapter'] == 'cse-caption' else grid_terms(parser.tables)
    expected = [f'Year {year}: {season}' for year in range(1, 5) for season in ('Autumn', 'Spring')]
    if [s['label'] for s in semesters] != expected or not all(s['entries'] and s['credits'] for s in semesters):
        return []
    return [{'schemaVersion': 1, 'id': source['id'] + '-' + record['sha256'][:24] + '-v1',
             'source': {'url': record['url'], 'sha256': record['sha256'], 'fetchedAt': record['fetchedAt'],
                        'validatedAt': None, 'mediaType': 'text/html'},
             'documentKind': 'sample-plan', 'program': source['program'], 'specialization': None,
             'campus': None, 'geSystem': source.get('geSystem'), 'version': record['sha256'][:16] + '-cse-v1',
             'applicableFrom': None, 'applicableUntil': None, 'publicationStatus': 'unknown',
             'planScope': 'single-program', 'academicYear': None,
             'evidence': ['Eight semester assignments from the Sample Schedule / Sample Graduation Plan section.',
                          'Conditional GE entries, course choices and incomplete course codes retain their source wording.'],
             'semesters': semesters, 'reviewStatus': 'pending', 'reviewedAt': None, 'reviewer': None}]
