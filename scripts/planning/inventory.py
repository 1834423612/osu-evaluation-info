#!/usr/bin/env python3
"""Build a public-only program coverage ledger and versioned document index offline."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
from sync import atomic_json, official_url

INDEX = 'https://undergrad.osu.edu/majors-and-academics/majors-by-college'
CODE = re.compile(r'\b([A-Z][A-Z&]{1,11})\s+(\d{4}(?:\.\d{1,2})?[A-Z]?)\b')


def normalize(value):
    return re.sub(r'[^a-z0-9]+', ' ', value.lower().replace('&', ' and ').replace('\xad', '')).strip()


class Content(HTMLParser):
    def __init__(self):
        super().__init__()
        self.blocks = []
        self.parts = []
        self.kind = 'text'
        self.ignored = 0
        self.started = False
    def flush(self):
        text = ' '.join(''.join(self.parts).replace('\xad', '').split())
        if text and self.started and not self.ignored:
            self.blocks.append({'kind': self.kind, 'text': text})
        self.parts = []
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer', 'noscript'):
            self.flush()
            self.ignored += 1
        if self.ignored:
            return
        if tag == 'h1':
            self.started = True
        if tag in ('h1', 'h2', 'h3', 'h4', 'p', 'li', 'div', 'tr', 'br'):
            self.flush()
            self.kind = tag if tag.startswith('h') else 'text'
        elif tag in ('td', 'th'):
            self.parts.append(' | ')
    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'nav', 'footer', 'noscript'):
            self.ignored = max(0, self.ignored - 1)
        elif tag in ('h1', 'h2', 'h3', 'h4', 'p', 'li', 'div', 'tr') and not self.ignored:
            self.flush()
            self.kind = 'text'
    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def html_blocks(data):
    parser = Content()
    parser.feed(data.decode('utf-8', errors='replace'))
    parser.flush()
    return parser.blocks


def program_inventory(data):
    college = None
    category = None
    result = []
    for block in html_blocks(data):
        label = block['text']
        if block['kind'] == 'h2':
            college, category = label, None
            if college == 'Undecided/Exploring':
                break
        elif block['kind'] == 'h3':
            category = label
        elif college and block['kind'] == 'text' and len(label) < 150:
            if re.match(r'Learn more|The College|SELECT|First.year|Transfer applicants|International applicants', label, re.I):
                continue
            identity = normalize(college) + ':' + normalize(label)
            result.append({'id': hashlib.sha256(identity.encode()).hexdigest()[:16], 'name': label,
                           'college': college, 'category': category, 'indexUrl': INDEX})
    # Each index row is retained as published; degree variants are not invented.
    return list({r['id']: r for r in result}.values())


def document_metadata(record, blocks, label=''):
    title = next((b['text'] for b in blocks if b['kind'] == 'h1'), label)
    title = title[:240] or unquote(urlsplit(record['url']).path.rsplit('/', 1)[-1])[:240]
    text = '\n'.join(b['text'] for b in blocks)
    heading = '\n'.join(b['text'] for b in blocks if b['kind'] in ('h1', 'h2', 'h3'))
    years = sorted(set(re.findall(r'\b(20\d{2})\s*[-–/]\s*(20\d{2}|\d{2})\b', title + '\n' + heading + '\n' + unquote(record['url']))))
    academic_years = sorted(set(a + '-' + (b if len(b) == 4 else a[:2] + b) for a, b in years if int(b[-2:]) == (int(a) + 1) % 100))
    terms = sorted(set(m[0].upper() + m[1] for m in re.findall(r'\bEffective(?:\s+Term)?\s*:?\s*(AU|SP|SU)\s*[\x27’]?\s*(20\d{2}|\d{2})\b', text, re.I)))
    terms = [t[:2] + ('20' + t[2:] if len(t) == 4 else t[2:]) for t in terms]
    applied = sorted(set(re.findall(r'\bApplied Version\s*:?\s*((?:AU|SP|SU)20\d{2})\b', text, re.I)))
    codes = sorted(set((m[1], m[2]) for m in CODE.finditer(text) if m[1] not in ('AU', 'SP', 'SU')))
    kind = ('sample-plan' if re.search(r'\b(?:sample|four[- ]year|4[- ]year)\b', title + ('\n' + text[:500] if record.get('contentType') == 'application/pdf' else ''), re.I)
            else 'requirements' if re.search(r'requirement|curriculum sheet', title, re.I) and codes else 'source')
    return {'title': title, 'documentKind': kind, 'academicYears': academic_years,
            'effectiveTerms': terms, 'appliedVersions': applied,
            'geSystems': [v for v, pattern in [('GEN', r'\bGEN\b|General Education.{0,5}New'), ('GEL', r'\bGEL\b|General Education.{0,5}Legacy')] if re.search(pattern, text, re.I)],
            'publicationStatus': 'draft' if re.search(r'\bdraft\b', title, re.I) else 'unknown',
            'courseReferences': [{'subject': s, 'number': n} for s, n in codes[:1000]],
            'pageCount': record.get('pageCount'), 'extractionStatus': 'references' if codes else 'unstructured'}


def build(cache):
    state = json.loads((cache / 'state.json').read_text(encoding='utf-8'))
    index = state['sources'].get(INDEX)
    if not index or not index.get('sha256'):
        raise ValueError('University college index must be downloaded before building the coverage ledger')
    programs = program_inventory((cache / index['sha256']).read_bytes())
    if len(programs) < 100:
        raise ValueError('Program index layout changed; refusing an incomplete replacement')
    labels = {}
    for parent in state['sources'].values():
        for link in parent.get('links', []):
            labels.setdefault(link['url'], []).append(link['label'])
    documents = {}
    pending = []
    for record in state['sources'].values():
        versions = record.get('versions', []) + [record]
        for version in versions:
            if not version.get('sha256'):
                continue
            url = official_url(version['url'])
            raw = cache / version['sha256']
            if not raw.is_file() or hashlib.sha256(raw.read_bytes()).hexdigest() != version['sha256']:
                raise ValueError('Cached source content does not match its digest')
            if version['contentType'] == 'text/html':
                blocks = html_blocks(raw.read_bytes())
            else:
                extracted = cache / 'extracted' / (version['sha256'] + '.json')
                evidence = json.loads(extracted.read_text(encoding='utf-8')) if extracted.is_file() else {}
                blocks = evidence.get('blocks', [])
                version = {**version, 'pageCount': evidence.get('pageCount')}
            metadata = document_metadata(version, blocks, next(iter(labels.get(url, [])), ''))
            identity = hashlib.sha256((url + '\n' + version['sha256']).encode()).hexdigest()[:24]
            matches = []
            context = normalize(metadata['title'] + ' ' + ' '.join(labels.get(url, [])))
            for program in programs:
                name = normalize(program['name']).split(' (')[0]
                if len(name) >= 8 and re.search(r'(?:^| )' + re.escape(name) + r'(?: |$)', context):
                    matches.append(program['id'])
            documents[identity] = {'id': identity, 'url': url, 'resolvedUrl': version.get('resolvedUrl', url),
                                   'sha256': version['sha256'], 'fetchedAt': version['fetchedAt'], 'mediaType': version['contentType'],
                                   'programIds': matches, 'reviewStatus': 'pending', **metadata}
        if record.get('status') == 'pending':
            pending.append({'url': record['url'], 'checkedAt': record['checkedAt'], 'httpStatus': record.get('httpStatus'), 'reason': record.get('failure', 'unvisited')})
    resources = sorted(documents.values(), key=lambda x: (x['title'].lower(), x['url'], x['sha256']))
    for p in programs:
        p['documentIds'] = [d['id'] for d in resources if p['id'] in d['programIds'] and d['courseReferences']]
        p['coverage'] = 'references' if p['documentIds'] else 'unresolved'
    return {'schemaVersion': 1, 'generatedAt': max(r['checkedAt'] for r in state['sources'].values()),
            'index': {'url': INDEX, 'sha256': index['sha256'], 'fetchedAt': index['fetchedAt']},
            'coverage': 'partial', 'programs': programs, 'documents': resources, 'pending': pending,
            'counts': {'indexEntries': len(programs), 'downloadedVersions': len(resources),
                       'withCourseReferences': sum(bool(d['courseReferences']) for d in resources),
                       'programsWithReferences': sum(bool(p['documentIds']) for p in programs),
                       'blockedOrFailed': len(pending), 'unvisited': len(set(state['discovered']) - state['sources'].keys()), 'approved': 0}}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', default='.planning-cache')
    parser.add_argument('--output', default='data/planning/directory.json')
    args = parser.parse_args()
    result = build(Path(args.cache))
    atomic_json(Path(args.output), result)
    print(json.dumps(result['counts']))
