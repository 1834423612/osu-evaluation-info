"""Evidence-based course identity resolution. Never fuzzy-match catalog numbers."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from functools import lru_cache
from typing import Iterable

VERSION = "catalog-evidence-v3"
STOP = {"and", "of", "the", "department", "school", "college", "for", "in"}


def course_token(value: str | None) -> str:
    return re.sub(r"[^A-Z0-9.]", "", unicodedata.normalize("NFKC", value or "").upper())


def course_parts(value: str | None) -> tuple[str, str] | None:
    match = re.fullmatch(r"([A-Z]{0,40})(\d{3,5}(?:\.\d{1,3})?[A-Z]{0,2})", course_token(value))
    return (match[1], match[2]) if match else None


def words(value: str) -> tuple[str, ...]:
    folded = unicodedata.normalize("NFKD", value).casefold()
    return tuple(word for word in re.findall(r"[a-z]+", folded) if word not in STOP)


def prefix_alignment(value: str, pieces: tuple[str, ...]) -> bool:
    """Initials and ordered word prefixes, with no invented synonym dictionary."""
    @lru_cache(None)
    def visit(index: int, offset: int) -> bool:
        if offset == len(value):
            return index >= 2
        if index == len(pieces):
            return False
        return any(
            value.startswith(pieces[index][:length], offset) and visit(index + 1, offset + length)
            for length in range(1, min(len(pieces[index]), len(value) - offset) + 1)
        )
    return bool(pieces) and len(value) >= 2 and visit(0, 0)


class SubjectLexicon:
    def __init__(self, labels: Iterable[tuple[str, str]]):
        self.labels: dict[str, set[str]] = defaultdict(set)
        for code, label in labels:
            self.labels[course_token(code)].add(label or code)
        self.codes = set(self.labels)

    @lru_cache(maxsize=4096)
    def resolve(self, value: str) -> frozenset[str]:
        token = course_token(value)
        if not token:
            return frozenset()
        if token in self.codes:
            return frozenset({token})
        query_words = words(value)
        compact = "".join(query_words) or token.lower()
        matches, exact_labels = set(), set()
        for code, labels in self.labels.items():
            if len(token) >= 2 and code.startswith(token):
                matches.add(code)
            for label in labels:
                pieces = words(label)
                full = "".join(pieces)
                if compact == full:
                    exact_labels.add(code)
                if compact == full or (len(compact) >= 3 and full.startswith(compact)):
                    matches.add(code)
                elif len(pieces) > 1 and prefix_alignment(compact, pieces):
                    matches.add(code)
        return frozenset(exact_labels or matches)


def resolve_course(
    raw: str, available: set[str], lexicon: SubjectLexicon, *,
    department: str = "", taught: set[str] | None = None,
) -> dict:
    """An alias needs the exact number and a unique catalog-backed subject.

    Taught-course evidence can disambiguate abbreviations; known official subject
    codes never expand into another subject. Number-only values additionally need
    an academic department. Decimal/honors suffixes are not stripped or guessed.
    """
    parsed = course_parts(raw)
    result = {"state": "unresolved", "course_key": None, "reason": "invalid_course", "candidates": []}
    if not parsed:
        return result
    prefix, number = parsed
    if prefix in lexicon.codes:
        canonical = prefix + number
        if canonical in available:
            return {**result, "state": "accepted", "course_key": canonical, "reason": "exact"}
        return {**result, "reason": "outside_official_evidence"}
    subjects = lexicon.resolve(prefix) if prefix else lexicon.resolve(department)
    if not subjects:
        return {**result, "reason": "unknown_subject" if prefix else "missing_subject"}
    if prefix:
        academic = lexicon.resolve(department)
        taught_subjects = {parts[0] for key in taught or set() if (parts := course_parts(key))}
        context = academic | taught_subjects
        if context:
            subjects = subjects & context
            if not subjects:
                return {**result, "reason": "conflicting_subject_evidence"}
        elif len(subjects) > 1:
            # A mistyped number must not turn a Biology review into a Biomedical
            # Science review just because that other subject offers the number.
            return {**result, "state": "ambiguous", "reason": "ambiguous_subject",
                    "candidates": sorted(subject + number for subject in subjects)}
    candidates = {subject + number for subject in subjects} & available
    supported = candidates & (taught or set())
    if len(supported) == 1:
        candidates = supported
    if len(candidates) == 1:
        return {
            **result, "state": "accepted", "course_key": next(iter(candidates)),
            "reason": "subject_alias" if prefix else "number_with_department",
            "candidates": sorted(candidates),
        }
    return {
        **result, "state": "ambiguous" if candidates else "unresolved",
        "reason": "ambiguous_subject" if candidates else "outside_official_evidence",
        "candidates": sorted(candidates),
    }
