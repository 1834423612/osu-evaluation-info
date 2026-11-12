import {
  abbreviationCost,
  compact,
  editDistance,
  fold,
  terms,
} from "./analyzer.ts";
import type { SearchDocument, SubjectMatch } from "./types";

export class SubjectResolver {
  readonly subjects: {
    code: string;
    label: string;
    words: string[];
    name: string;
    key: string;
  }[];
  constructor(documents: SearchDocument[]) {
    this.subjects = [
      ...new Map(
        documents.map((doc) => [
          doc.subject,
          {
            code: doc.subject,
            label: doc.subjectName || doc.subject,
            words: terms(doc.subjectName),
            name: compact(doc.subjectName),
            key: compact(doc.subject),
          },
        ]),
      ).values(),
    ];
  }
  resolve(value: string): SubjectMatch[] {
    const input = compact(value) || fold(value).replace(/[^\p{L}\p{N}]/gu, "");
    if (!input) return [];
    return this.subjects
      .map((subject) => {
        let score = input === subject.key || input === subject.name ? 1 : 0;
        if (input.length >= 2 && subject.key.startsWith(input))
          score = Math.max(
            score,
            0.86 + (0.1 * input.length) / subject.key.length,
          );
        if (input.length >= 3 && subject.name.startsWith(input))
          score = Math.max(
            score,
            0.84 + (0.1 * input.length) / subject.name.length,
          );
        const cost = abbreviationCost(input, subject.words);
        if (Number.isFinite(cost)) score = Math.max(score, 0.97 - cost);
        if (input.length >= 4) {
          const consonants = (value: string) => value.replace(/[aeiou]/g, "");
          const reduced = abbreviationCost(
            consonants(input),
            subject.words.map(consonants),
          );
          if (Number.isFinite(reduced)) score = Math.max(score, 0.88 - reduced);
        }
        const pieces = terms(value);
        if (
          pieces.length >= 2 &&
          pieces.length <= subject.words.length &&
          pieces.every((piece) =>
            subject.words.some((word) => word.startsWith(piece)),
          )
        )
          score = Math.max(score, 0.88);
        if (input.length >= 3) {
          const maximum = input.length >= 7 ? 2 : 1;
          const distance = Math.min(
            editDistance(input, subject.key, maximum),
            editDistance(input, subject.name, maximum),
          );
          if (distance <= maximum)
            score = Math.max(score, 0.91 - distance * 0.07);
        }
        return { code: subject.code, label: subject.label, score };
      })
      .filter((subject) => subject.score >= 0.7)
      .sort((a, b) => b.score - a.score || a.code.localeCompare(b.code))
      .slice(0, 12);
  }
}
