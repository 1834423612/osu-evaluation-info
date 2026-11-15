#!/usr/bin/env python3
"""Convert cached Molecular Genetics sample HTML to pending candidates only."""
import argparse
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path

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
        return []
    parser = Blocks()
    parser.feed(data.decode('utf-8'))
    candidates = []
    current = None
    semester = None
    for tag, text in parser.blocks:
        if tag == 'h2':
            if text.startswith('Example '):
                current = {'schemaVersion':1, 'id':'molgen-'+str(len(candidates)+1)+'-'+record['sha256'][:16], 'source':{'url':record['url'], 'sha256':record['sha256'], 'fetchedAt':record['fetchedAt'], 'validatedAt':None, 'mediaType':'text/html'}, 'documentKind':'sample-plan', 'program':'Molecular Genetics', 'specialization':None, 'campus':None, 'geSystem':None, 'version':record['sha256'][:16], 'applicableFrom':None, 'applicableUntil':None, 'evidence':[text], 'semesters':[], 'reviewStatus':'pending', 'reviewedAt':None, 'reviewer':None}
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
    args = p.parse_args()
    folder = Path(args.cache)
    state = json.loads((folder / 'state.json').read_text())
    count = 0
    for record in state['sources'].values():
        if record.get('status') != 'downloaded' or record.get('contentType') != 'text/html':
            continue
        data = (folder / record['sha256']).read_bytes()
        if hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError('Source hash mismatch')
        for candidate in structure(data,record):
            (folder / (candidate['id']+'.json')).write_text(json.dumps(candidate,indent=2)+'\n')
            count += 1
    print(json.dumps({'pendingCandidates':count,'published':0}))
