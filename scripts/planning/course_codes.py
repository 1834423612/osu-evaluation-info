"""Recognize official catalog subject codes and names without guessing abbreviations."""
import json
import re
from pathlib import Path

vocabulary = json.loads((Path(__file__).parents[2] / 'data/planning/subjects.json').read_text(encoding='utf-8'))
ALIASES = {}
for subject in vocabulary['subjects']:
    for label in (subject['code'], subject['title']):
        ALIASES[' '.join(label.casefold().split())] = subject['code']
PATTERN = re.compile(r'\b(' + '|'.join(re.escape(a).replace(r'\ ', r'\s+') for a in sorted(ALIASES, key=len, reverse=True)) + r')\s*(\d{4}(?:\.\d{1,2})?[A-Z]?)\b', re.I)


def course_codes(text):
    return sorted(set((ALIASES[' '.join(m[1].casefold().split())], m[2].upper()) for m in PATTERN.finditer(text)))
