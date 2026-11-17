#!/usr/bin/env python3
"""Convert cached Molecular Genetics sample HTML to pending candidates only."""
import argparse
import hashlib
import json
import re
import importlib.util
import sys
from html.parser import HTMLParser
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from inventory import html_blocks, document_metadata
from grid_adapter import structure_grid
from pdf_adapter import structure_pdf, structure_math_schedule
from sync import official_url

class Blocks(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tag = None
        self.parts = []
        self.blocks = []
    def handle_starttag(self, tag, attrs):
        if tag in ('h2', 'h3', 'li'):
            self.tag = tag
            self.parts = []
    def handle_data(self, data):
        if self.tag:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == self.tag:
            self.blocks.append((tag, ' '.join(''.join(self.parts).split())))
            self.tag = None

def credit_range(text):
    match = re.search(r'(\d+)(?:\s*[-–]\s*(\d+))?\s+credits?\b', text)
    return {'min':int(match[1]), 'max':int(match[2] or match[1])} if match else None

def structure(data, record):
    if record['url'] != 'https://molgen.osu.edu/sample-curriculum':
        spec = importlib.util.spec_from_file_location('planning_tables', Path(__file__).with_name('table_adapter.py'))
        adapter = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(adapter)
        strict = adapter.structure_tables(data, record)
        return strict or structure_grid(data, record, document_metadata(record, html_blocks(data)))
    parser = Blocks()
    parser.feed(data.decode('utf-8'))
    candidates = []
    current = None
    semester = None
    for tag, text in parser.blocks:
        if tag == 'h2':
            if text.startswith('Example '):
                current = {'schemaVersion':1, 'id':'molgen-v2-'+str(len(candidates)+1)+'-'+record['sha256'][:16], 'source':{'url':record['url'], 'sha256':record['sha256'], 'fetchedAt':record['fetchedAt'], 'validatedAt':None, 'mediaType':'text/html'}, 'documentKind':'sample-plan', 'program':'Molecular Genetics', 'specialization':None, 'campus':None, 'geSystem':None, 'version':record['sha256'][:16]+'-example-'+str(len(candidates)+1)+'-v2', 'applicableFrom':None, 'applicableUntil':None, 'evidence':[text], 'semesters':[], 'reviewStatus':'pending', 'reviewedAt':None, 'reviewer':None}
                candidates.append(current)
            else:
                current = None
            semester = None
        elif current and tag == 'h3' and re.fullmatch(r'Year [1-4]: (Autumn|Spring)',text):
            semester = {'label':text,'credits':None,'entries':[]}
            current['semesters'].append(semester)
        elif semester and tag == 'li':
            if text.startswith('Semester Total:'):
                semester['credits'] = credit_range(text)
            elif not re.match(r'(Year \d Total:|Degree Total:)',text):
                semester['entries'].append({'evidence':text,'credits':credit_range(text)})
    # Layout drift is not a usable curriculum. Keep source in pending crawler state.
    return [c for c in candidates if len(c['semesters']) == 8 and all(s['entries'] and s['credits'] for s in c['semesters'])]

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--cache', default='.planning-cache')
    p.add_argument('--output', help='Public candidate-array output; every result remains pending')
    args = p.parse_args()
    folder = Path(args.cache)
    state = json.loads((folder / 'state.json').read_text())
    count = 0
    all_candidates = {}
    for record in state['sources'].values():
        if record.get('contentType') not in ('text/html', 'application/pdf') or not record.get('sha256'):
            continue
        record = {**record, 'url':official_url(record['url'])}
        if record['contentType'] == 'application/pdf':
            extracted = folder / 'extracted' / (record['sha256']+'.json')
            evidence = json.loads(extracted.read_text()) if extracted.is_file() else {}
            metadata = document_metadata(record,evidence.get('blocks',[]))
            candidates = structure_pdf(evidence,record,metadata)
            if not candidates and record['url'].startswith('https://math.osu.edu/'):
                candidates = structure_math_schedule(evidence,record,metadata)
        else:
            candidates = structure((folder / record['sha256']).read_bytes(), record)
        for candidate in candidates:
            (folder / (candidate['id']+'.json')).write_text(json.dumps(candidate,indent=2)+'\n')
            all_candidates[candidate['id']] = candidate
    if args.output:
        Path(args.output).write_text(json.dumps(list(all_candidates.values()), ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'pendingCandidates':len(all_candidates),'published':0}))
