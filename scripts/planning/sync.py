#!/usr/bin/env python3
"""Public OSU source discovery. No credentials; no auto-publication or deletion."""
import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.robotparser import RobotFileParser

AGENT = 'OSUCurriculumResearch/1.0'
MAX_BYTES = 8 * 1024 * 1024


def official_url(value):
    u = urlsplit(value)
    if (u.scheme != 'https' or not u.hostname or
        not (u.hostname == 'osu.edu' or u.hostname.endswith('.osu.edu')) or
        u.username or u.password or u.port not in (None, 443) or u.query):
        raise ValueError('Only public HTTPS osu.edu URLs without queries are accepted')
    return urlunsplit((u.scheme, u.netloc, u.path or '/', '', ''))


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # Redirects need a new explicit robots and origin check.


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        if tag == 'a':
            self.links.extend(v for k, v in attrs if k == 'href' and v)


def atomic_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, indent=2) + '\n')
    tmp.replace(path)


def run(args):
    seeds = json.loads(Path(args.seeds).read_text())
    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    state_path = out / 'state.json'
    state = json.loads(state_path.read_text()) if state_path.exists() else {'sources': {}}
    queue = list(dict.fromkeys([official_url(x['url']) for x in seeds['sources']] + [official_url(x) for x in state.get('discovered', [])]))
    opener = build_opener(NoRedirect())
    robots = {}
    last_request = 0
    def fetch(url):
        nonlocal last_request
        time.sleep(max(0, args.delay - (time.monotonic() - last_request)))
        last_request = time.monotonic()
        with opener.open(Request(url, headers={'User-Agent': AGENT}), timeout=25) as response:
            data = response.read(MAX_BYTES + 1)
            if len(data) > MAX_BYTES:
                raise ValueError('Source exceeds size limit')
            return data, response.headers.get_content_type()
    count = 0
    for url in queue:
        old = state['sources'].get(url, {})
        if old.get('status') == 'downloaded' and not args.refresh:
            continue
        if count >= args.limit:
            break
        count += 1
        record = {'url': url, 'checkedAt': datetime.now(timezone.utc).isoformat(), 'reviewStatus': 'pending', 'parserStatus': 'unsupported'}
        try:
            origin = urlsplit(url).netloc
            if origin not in robots:
                raw, _ = fetch('https://' + origin + '/robots.txt')
                robot = RobotFileParser()
                robot.parse(raw.decode('utf-8', errors='replace').splitlines())
                robots[origin] = robot
            robot = robots[origin]
            if not robot.can_fetch(AGENT, url):
                raise ValueError('robots denied')
            crawl_delay = robot.crawl_delay(AGENT) or robot.crawl_delay('*') or 0
            if crawl_delay > 60:
                raise ValueError('Crawl delay exceeds this bounded runner budget')
            if crawl_delay > args.delay:
                time.sleep(crawl_delay)
            data, content_type = fetch(url)
            digest = hashlib.sha256(data).hexdigest()
            (out / digest).write_bytes(data)
            record.update(status='downloaded', sha256=digest, contentType=content_type, fetchedAt=record['checkedAt'])
            if content_type == 'text/html':
                links = Links()
                links.feed(data.decode('utf-8', errors='replace'))
                discovered = []
                for href in links.links:
                    try:
                        candidate = official_url(urljoin(url, href))
                    except ValueError:
                        continue
                    if re.search(r'curricul|program|major|four.year|\.pdf$', candidate, re.I):
                        discovered.append(candidate)
                        if candidate not in queue:
                            queue.append(candidate)
                record['discovered'] = sorted(set(discovered))
        except Exception as error:
            # Only exception class is stored; HTTP errors can include sensitive redirect URLs.
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
    counts = {status: sum(r['status'] == status for r in state['sources'].values()) for status in ['downloaded', 'pending']}
    print(json.dumps({**counts, 'discovered': len(queue), 'reviewed': 0, 'published': 0}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--seeds', default='data/planning/sources.json')
    parser.add_argument('--output', default='.planning-cache')
    parser.add_argument('--delay', type=float, default=2)
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--refresh', action='store_true')
    args = parser.parse_args()
    if args.delay < 1 or not 1 <= args.limit <= 500:
        parser.error('delay must be >=1 second; limit must be 1..500')
    run(args)
