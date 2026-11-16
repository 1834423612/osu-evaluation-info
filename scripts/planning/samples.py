#!/usr/bin/env python3
"""Refresh only manually inspected, explicitly semester-based public samples."""
import argparse
import hashlib
import json
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from cse_adapter import structure_cse
from grid_adapter import structure_grid
from inventory import document_metadata, html_blocks
from pdf_adapter import structure_math_schedule
from structure import structure
from sync import MAX_BYTES, PublicFetcher, atomic_json, official_url

ROOT = Path(__file__).resolve().parents[2]


class SampleFetcher(PublicFetcher):
    def raw(self, url, delay=None):
        try:
            return super().raw(url, delay)
        except HTTPError as error:
            if error.code != 403:
                raise
        # Some public Drupal pages reject urllib's HTTP transport. The first
        # attempt already checked public DNS. This anonymous retry follows no
        # redirects, reads no curl config and sends no cookies or credentials.
        time.sleep(max(self.delay, delay or 0))
        self.last_request = time.monotonic()
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'source'
            result = subprocess.run(['curl', '--disable', '--silent', '--show-error',
                '--fail', '--max-time', '20', '--max-filesize', str(MAX_BYTES),
                '--proto', '=https', '--max-redirs', '0',
                '--output', str(target), '--write-out', '%{http_code}\n%{content_type}', url],
                capture_output=True, text=True, timeout=25, check=True)
            status, media = result.stdout.split('\n', 1)
            if status != '200':
                raise ValueError('Unexpected fallback status')
            data = target.read_bytes()
            if len(data) > MAX_BYTES:
                raise ValueError('Source exceeds size limit')
            return data, media.split(';')[0].strip()


def fetch_sources(registry, folder, refresh, delay):
    folder.mkdir(parents=True, exist_ok=True)
    checkpoint = folder / 'state.json'
    state = json.loads(checkpoint.read_text()) if checkpoint.exists() else {'sources': {}}
    fetcher = SampleFetcher(delay)
    failures = []
    urls = [s['url'] for s in registry['sources']]
    urls.extend(s['downloadUrl'] for s in registry['sources'] if s.get('downloadUrl'))
    for value in dict.fromkeys(urls):
        url = official_url(value)
        old = state['sources'].get(url, {})
        if old.get('sha256') and not refresh and (folder / old['sha256']).exists():
            continue
        checked = datetime.now(timezone.utc).isoformat()
        try:
            data, media, resolved = fetcher.fetch(url)
            allowed = ('text/html', 'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
            if media not in allowed:
                raise ValueError('Unexpected document type')
            digest = hashlib.sha256(data).hexdigest()
            (folder / digest).write_bytes(data)
            versions = old.get('versions', [])
            if old.get('sha256') and old['sha256'] != digest:
                versions = versions + [{k: v for k, v in old.items() if k != 'versions'}]
            state['sources'][url] = {'url': url, 'resolvedUrl': resolved, 'sha256': digest,
                'contentType': media, 'fetchedAt': checked, 'checkedAt': checked,
                'status': 'downloaded', 'versions': versions}
        except Exception as error:
            state['sources'][url] = {**old, 'url': url, 'checkedAt': checked,
                'status': 'pending', 'failure': type(error).__name__}
            failures.append(url)
        atomic_json(checkpoint, state)
    if failures:
        raise RuntimeError('Refresh incomplete. Existing outputs retained. Failed sources: ' + ', '.join(failures))
    print(json.dumps({'registeredSources': len(urls), 'cachedVersions': len(state['sources'])}))


def group_choices(candidate):
    for semester in candidate['semesters']:
        grouped = []
        for entry in semester['entries']:
            if entry['evidence'].startswith('•'):
                if not grouped or ':' not in grouped[-1]['evidence']:
                    raise ValueError('Unattached source alternative')
                grouped[-1]['evidence'] += ' ' + entry['evidence']
            else:
                grouped.append(entry.copy())
        semester['entries'] = grouped
    return candidate


def build_samples(registry, folder):
    state = json.loads((folder / 'state.json').read_text())
    candidates, documents, programs = [], [], []
    for source in registry['sources']:
        record = state['sources'][source['url']]
        if record.get('status') != 'downloaded':
            raise ValueError('Source refresh incomplete')
        data = (folder / record['sha256']).read_bytes()
        if hashlib.sha256(data).hexdigest() != record['sha256']:
            raise ValueError('Cached source digest mismatch')
        extracted = {}
        if record['contentType'] == 'application/pdf':
            extracted = json.loads((folder / 'extracted' / (record['sha256'] + '.json')).read_text())
            blocks = extracted['blocks']
        else:
            blocks = html_blocks(data)
        metadata = document_metadata(record, blocks, source['program'])
        metadata['documentKind'] = 'sample-plan'
        adapter = source['adapter']
        if adapter.startswith('cse-'):
            found = structure_cse(data, record, source)
        elif adapter == 'earth-grid':
            found = [group_choices(c) for c in structure_grid(data, record, metadata)]
        elif adapter == 'math-pdf':
            found = structure_math_schedule(extracted, record, metadata)
        elif adapter == 'molgen-list':
            found = structure(data, record)
        else:
            raise ValueError('Unimplemented inspected adapter')
        if len(found) != source['expectedSamples'] or any(len(c['semesters']) != 8 or not all(s['entries'] for s in c['semesters']) for c in found):
            raise ValueError('Sample layout changed: ' + source['id'])
        for candidate in found:
            candidate['program'] = source['program']
            candidate['geSystem'] = source.get('geSystem')
            candidate['id'] += '-inspected-v2'
            candidate['version'] += '-inspected-v2'
            candidate['evidence'].append(source['structure'])
            if source.get('comparison'):
                candidate['evidence'].append(source['comparison'])
        candidates.extend(found)
        identity = hashlib.sha256((record['url'] + '\n' + record['sha256']).encode()).hexdigest()[:24]
        program_id = hashlib.sha256(source['id'].encode()).hexdigest()[:16]
        documents.append({'id': identity, 'url': record['url'], 'resolvedUrl': record['resolvedUrl'],
            'sha256': record['sha256'], 'fetchedAt': record['fetchedAt'], 'mediaType': record['contentType'],
            'programIds': [program_id], 'reviewStatus': 'pending', **metadata,
            'pageCount': extracted.get('pageCount')})
        programs.append({'id': program_id, 'name': source['program'], 'college': source['college'],
            'category': None, 'indexUrl': source.get('landingUrl', source['url']),
            'documentIds': [identity], 'coverage': 'references'})
    first = documents[0]
    directory = {'schemaVersion': 1, 'coverage': 'partial',
        'generatedAt': max(d['fetchedAt'] for d in documents),
        'index': {k: first[k] for k in ('url', 'sha256', 'fetchedAt')},
        'programs': programs, 'documents': documents, 'pending': [],
        'counts': {'inspectedPrograms': len(programs), 'semesterSamples': len(candidates)}}
    return candidates, directory


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('fetch', 'structure'))
    parser.add_argument('--cache', default='.planning-cache/samples')
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--delay', type=float, default=2)
    args = parser.parse_args()
    if args.delay < 1:
        parser.error('delay must be at least one second')
    registry = json.loads((ROOT / 'data/planning/sample-sources.json').read_text())
    folder = Path(args.cache)
    if args.action == 'fetch':
        fetch_sources(registry, folder, args.refresh, args.delay)
    else:
        candidates, directory = build_samples(registry, folder)
        atomic_json(ROOT / 'data/planning/curricula.json', candidates)
        atomic_json(ROOT / 'data/planning/sample-directory.json', directory)
        print(json.dumps({'samples': len(candidates), 'semesters': sum(len(c['semesters']) for c in candidates)}))
