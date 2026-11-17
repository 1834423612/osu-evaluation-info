#!/usr/bin/env python3
"""Checkpointed anonymous discovery of public OSU academic documents."""
import argparse
import hashlib
import ipaddress
import json
import re
import socket
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

AGENT = 'OSUCurriculumResearch/2.0'
MAX_BYTES = 8 * 1024 * 1024
DOMAINS = ('osu.edu', 'ohio-state.edu')
INTEREST = re.compile(r'curricul|program|major|four.year|4.year|sample|semester|advising|undergrad|bachelor|degree|\.pdf(?:\?|$)', re.I)
EXCLUDE = re.compile(r'/(?:user|login|logout|wp-admin|wp-json|news|events?|calendar|giving|donate|employment|research|graduate)(?:/|$)|\.pdf\.pdf$', re.I)


def official_url(value):
    value = value.strip()
    if any(ord(c) < 32 for c in value):
        raise ValueError("Control characters are not accepted")
    u = urlsplit(value)
    host = (u.hostname or '').lower()
    if (u.scheme != 'https' or not any(host == d or host.endswith('.' + d) for d in DOMAINS)
            or u.username or u.password or u.port not in (None, 443)
            or re.search(r'(?:^|\.)(?:degreeplanner|webauth|idp|shibboleth|buckeyelink)\.', host)
            or EXCLUDE.search(u.path)):
        raise ValueError('Only public OSU academic HTTPS URLs are accepted')
    query = parse_qsl(u.query, keep_blank_values=True)
    # Only explicit public PDF revision identifiers; never signed/authenticated links.
    if query and not (len(query) == 1 and query[0][0] == 'VersionId'
                      and re.fullmatch(r'[A-Za-z0-9_.-]{1,160}', query[0][1])
                      and u.path.lower().endswith('.pdf')):
        raise ValueError('Unrecognized public query')
    return urlunsplit(('https', host, u.path or '/', urlencode(query), ''))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.entries = []
        self.anchor = None
        self.parts = []
        self.ignored = 0
    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'nav', 'footer'):
            self.ignored += 1
        if tag == 'a' and not self.ignored:
            self.anchor = dict(attrs).get('href')
            self.parts = []
            if self.anchor:
                self.links.append(self.anchor)
    def handle_data(self, data):
        if self.anchor and not self.ignored:
            self.parts.append(data)
    def handle_endtag(self, tag):
        if tag == 'a' and self.anchor:
            self.entries.append({'href': self.anchor, 'label': ' '.join(' '.join(self.parts).split())[:240]})
            self.anchor = None
        if tag in ('script', 'style', 'nav', 'footer'):
            self.ignored = max(0, self.ignored - 1)


def discover(data, url):
    parser = Links()
    parser.feed(data.decode('utf-8', errors='replace'))
    found = {}
    for item in parser.entries:
        try:
            candidate = official_url(urljoin(url, item['href']))
        except ValueError:
            continue
        if candidate != url and INTEREST.search(candidate + ' ' + item['label']):
            found[candidate] = {'url': candidate, 'label': item['label']}
    return sorted(found.values(), key=lambda x: (not bool(re.search(r'/majors/detail/|\.pdf(?:\?|$)', x['url'])), x['url']))


def atomic_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    tmp.replace(path)


class PublicFetcher:
    def __init__(self, delay=2, opener=None):
        self.delay = delay
        self.opener = opener or build_opener(NoRedirect())
        self.robots = {}
        self.last_request = 0
    def raw(self, url, delay=None):
        for address in socket.getaddrinfo(urlsplit(url).hostname, 443, type=socket.SOCK_STREAM):
            if not ipaddress.ip_address(address[4][0]).is_global:
                raise ValueError('Non-public destination')
        time.sleep(max(0, max(self.delay, delay or 0) - (time.monotonic() - self.last_request)))
        self.last_request = time.monotonic()
        with self.opener.open(Request(url, headers={'User-Agent': AGENT, 'Accept': 'text/html,application/pdf;q=0.9,text/plain;q=0.5'}), timeout=20) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError('Source exceeds size limit')
            return data, response.headers.get_content_type()
    def policy(self, url):
        origin = urlsplit(url).netloc
        if origin not in self.robots:
            robot = RobotFileParser()
            try:
                data, _ = self.raw('https://' + origin + '/robots.txt')
                robot.parse(data.decode('utf-8', errors='replace').splitlines())
            except HTTPError as error:
                if error.code in (404, 410):
                    robot.parse([])
                else:
                    raise
            self.robots[origin] = robot
        robot = self.robots[origin]
        if not robot.can_fetch(AGENT, url):
            raise ValueError('robots denied')
        delay = robot.crawl_delay(AGENT) or robot.crawl_delay('*') or 0
        if delay > 60:
            raise ValueError('Crawl delay exceeds runner budget')
        return delay
    def fetch(self, url):
        visited = set()
        for _ in range(5):
            url = official_url(url)
            if url in visited:
                raise ValueError('Redirect loop')
            visited.add(url)
            delay = self.policy(url)
            try:
                data, media_type = self.raw(url, delay)
                return data, media_type, url
            except HTTPError as error:
                if error.code not in (301, 302, 303, 307, 308):
                    raise
                url = official_url(urljoin(url, error.headers.get('Location', '')))
        raise ValueError('Too many redirects')


def run(args):
    seeds = json.loads(Path(args.seeds).read_text(encoding='utf-8-sig'))
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    state_path = out / 'state.json'
    state = json.loads(state_path.read_text(encoding='utf-8')) if state_path.exists() else {'sources': {}}
    queue = [official_url(x['url']) for x in seeds['sources']]
    for url in state.get('discovered', []):
        try:
            queue.append(official_url(url))
        except ValueError:
            continue  # Older checkpoints may include now-excluded links.
    queue = list(dict.fromkeys(queue))
    queued = set(queue)
    def enqueue(record, data):
        if record.get('contentType') != 'text/html':
            return
        record['links'] = discover(data, record.get('resolvedUrl', record['url']))
        for link in record['links']:
            if link['url'] not in queued:
                queued.add(link['url'])
                queue.append(link['url'])
    for record in list(state['sources'].values()):
        if record.get('sha256') and (out / record['sha256']).is_file():
            enqueue(record, (out / record['sha256']).read_bytes())
    if args.refresh:
        # Bounded scheduled runs must eventually revisit every known source.
        # Oldest checks precede recent ones; new discoveries are checked first.
        queue.sort(key=lambda url: state['sources'].get(url, {}).get('checkedAt', ''))
    fetcher = PublicFetcher(args.delay)
    attempted = 0
    for url in queue:
        old = state['sources'].get(url, {})
        if old.get('status') == 'downloaded' and not args.refresh:
            continue
        if old.get('status') == 'pending' and not args.retry and not args.refresh:
            continue
        if attempted >= args.limit:
            break
        attempted += 1
        record = {'url': url, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'reviewStatus': 'pending', 'parserStatus': 'unsupported'}
        try:
            data, media_type, resolved = fetcher.fetch(url)
            if media_type not in ('text/html', 'application/pdf'):
                raise ValueError('Unsupported public document type')
            digest = hashlib.sha256(data).hexdigest()
            (out / digest).write_bytes(data)
            record.update(status='downloaded', sha256=digest, contentType=media_type, resolvedUrl=resolved, fetchedAt=record['checkedAt'])
            enqueue(record, data)
        except Exception as error:
            record.update(status='pending', failure=type(error).__name__)
            if isinstance(getattr(error, 'code', None), int):
                record['httpStatus'] = error.code
        history = old.get('versions', [])
        if old.get('sha256') and old['sha256'] != record.get('sha256'):
            history = history + [{k: v for k, v in old.items() if k != 'versions'}]
        record['versions'] = history
        state['sources'][url] = record
        state['discovered'] = queue
        atomic_json(state_path, state)
    atomic_json(state_path, state)
    counts = {status: sum(r['status'] == status for r in state['sources'].values()) for status in ('downloaded', 'pending')}
    print(json.dumps({**counts, 'attempted': attempted, 'discovered': len(queue), 'unvisited': len(queued - state['sources'].keys()), 'reviewed': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seeds', default='data/planning/sources.json')
    parser.add_argument('--output', default='.planning-cache')
    parser.add_argument('--delay', type=float, default=2)
    parser.add_argument('--limit', type=int, default=100)
    parser.add_argument('--refresh', action='store_true')
    parser.add_argument('--retry', action='store_true', help='Explicitly retry failed URLs')
    args = parser.parse_args()
    if args.delay < 1 or not 1 <= args.limit <= 2000:
        parser.error('delay must be >=1 second; limit must be 1..2000')
    run(args)
