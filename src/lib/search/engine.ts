import MiniSearch, { type Query, type SearchResult } from "minisearch";
import SearchableMap from "minisearch/SearchableMap";
import {
  compact,
  editDistance,
  fold,
  processTerm,
  prose,
  terms,
  tokenize,
  typoBudget,
} from "./analyzer.ts";
import { SubjectResolver } from "./subjects.ts";
import type {
  SearchDocument,
  SearchEvidence,
  SearchHit,
  SubjectMatch,
} from "./types";

type Option = { words: string[]; cost: number };
type Group = { source: string; display: string; options: Option[] };
const FIELDS = [
  "title",
  "subjectName",
  "subject",
  "description",
  "instructors",
];
const BOOST = {
  title: 8,
  subjectName: 4,
  subject: 5,
  description: 1,
  instructors: 2,
};

const MAX_SPELLING_VARIANTS = 16;
/** Full-corpus BM25+ retrieval followed by explicit coverage/typo/identity ranking. */
export class CourseSearchEngine {
  readonly documents: Map<string, SearchDocument>;
  readonly subjects: SubjectResolver;
  readonly vocabulary = new SearchableMap<number>();
  private index: MiniSearch<SearchDocument>;
  private fieldTerms = new Map<string, Map<string, Set<string>>>();
  private phrases = new Map<string, { title: string; description: string }>();
  private exactTitles = new Set<string>();
  constructor(documents: SearchDocument[]) {
    if (documents.length > 50000)
      throw new Error(
        "Catalog search corpus exceeds its configured memory bound",
      );
    this.documents = new Map(
      documents.map((doc) => [
        doc.id,
        { ...doc, description: prose(doc.description) },
      ]),
    );
    this.subjects = new SubjectResolver(documents);
    this.index = new MiniSearch({
      fields: FIELDS,
      tokenize,
      processTerm,
      searchOptions: { boost: BOOST, weights: { fuzzy: 0.45, prefix: 0.65 } },
    });
    for (const doc of this.documents.values()) {
      const fields = new Map(
        FIELDS.map((field) => [
          field,
          new Set(terms(doc[field as keyof SearchDocument])),
        ]),
      );
      this.fieldTerms.set(doc.id, fields);
      this.phrases.set(doc.id, {
        title: terms(doc.title).join(" "),
        description: terms(doc.description).join(" "),
      });
      this.exactTitles.add(terms(doc.title).join(" "));
      for (const word of new Set(
        [...fields.values()].flatMap((set) => [...set]),
      ))
        this.vocabulary.set(word, (this.vocabulary.get(word) ?? 0) + 1);
    }
    this.index.addAll([...this.documents.values()]);
  }
  private groups(query: string): Group[] {
    const displays = new Map(
      tokenize(query).map((word) => [processTerm(word), word]),
    );
    const input = terms(query).slice(0, 12),
      joined: string[] = [];
    for (let i = 0; i < input.length; i++) {
      const pair = input[i] + (input[i + 1] ?? "");
      if (
        !this.vocabulary.has(input[i]) &&
        input[i + 1] &&
        this.vocabulary.has(pair)
      ) {
        joined.push(pair);
        i++;
      } else joined.push(input[i]);
    }
    return joined.map((source) => {
      const options: Option[] = [{ words: [source], cost: 0 }];
      if (!this.vocabulary.has(source) && source.length >= 6) {
        for (let i = 3; i <= source.length - 3; i++) {
          const left = source.slice(0, i),
            right = source.slice(i);
          if (this.vocabulary.has(left) && this.vocabulary.has(right))
            options.push({ words: [left, right], cost: 1 });
        }
      }
      const budget =
        typoBudget(source) ||
        (source.length === 3 && joined.length >= 2 ? 1 : 0);
      if (budget) {
        const corrections = [...this.vocabulary.fuzzyGet(source, 2)]
          .map(([word, [frequency]]) => ({
            word,
            frequency,
            cost: editDistance(word, source, budget),
          }))
          .filter((item) => item.cost <= budget && item.word !== source);
        corrections.sort(
          (a, b) =>
            a.cost - b.cost ||
            b.frequency - a.frequency ||
            a.word.localeCompare(b.word),
        );
        options.push(
          ...corrections
            .slice(0, MAX_SPELLING_VARIANTS)
            .map((item) => ({ words: [item.word], cost: item.cost })),
        );
      }
      return { source, display: displays.get(source) ?? source, options };
    });
  }
  private evidence(
    id: string,
    groups: Group[],
    relaxed: boolean,
  ): SearchEvidence | null {
    const fields = this.fieldTerms.get(id)!;
    const doc = this.documents.get(id)!;
    const surface = (word: string) => {
      for (const field of FIELDS) {
        const actual = tokenize(doc[field as keyof SearchDocument]).find(
          (token) => processTerm(token) === word,
        );
        if (actual) return actual;
      }
      return word;
    };
    const all = new Set([...fields.values()].flatMap((set) => [...set]));
    const corrections: SearchEvidence["corrections"] = [],
      matchedFields = new Set<string>();
    let covered = 0,
      prefix = false,
      matchedWeight = 0,
      totalWeight = 0;
    for (const group of groups) {
      const weight = Math.log(
        1 + this.documents.size / (this.vocabulary.get(group.source) ?? 1),
      );
      totalWeight += weight;
      let chosen: { option: Option; actual: string[] } | undefined;
      for (const option of group.options) {
        const actual = option.words.map((word) =>
          all.has(word)
            ? word
            : word.length >= 3
              ? [...all].find((token) => token.startsWith(word))
              : undefined,
        );
        if (actual.every(Boolean)) {
          chosen = { option, actual: actual as string[] };
          break;
        }
      }
      if (!chosen) continue;
      covered++;
      matchedWeight += weight;
      for (const [field, words] of fields)
        if (chosen.actual.some((word) => words.has(word)))
          matchedFields.add(field);
      if (chosen.option.cost)
        corrections.push({
          from: group.display,
          to: chosen.actual.map(surface).join(" "),
          kind: "word",
        });
      else if (chosen.actual.join(" ") !== group.source) prefix = true;
    }
    if (
      !covered ||
      (covered < groups.length &&
        (!relaxed ||
          groups.length < 3 ||
          covered < Math.ceil(groups.length * 0.7) ||
          matchedWeight / totalWeight < 0.65))
    )
      return null;
    const body =
      matchedFields.has("description") && !matchedFields.has("title")
        ? doc.description
        : doc.title;
    const targets = groups.map(
      (group) =>
        corrections.find(
          (correction) => terms(correction.from).join(" ") === group.source,
        )?.to ?? group.source,
    );
    const positions = targets
      .map((target) => fold(body).indexOf(target))
      .filter((position) => position >= 0);
    const starts = positions.length
      ? positions.map((position) => Math.max(0, position - 45))
      : [0];
    starts.sort(
      (a, b) =>
        targets.filter((target) =>
          fold(body.slice(b, b + 190)).includes(target),
        ).length -
          targets.filter((target) =>
            fold(body.slice(a, a + 190)).includes(target),
          ).length || a - b,
    );
    const start = starts[0];
    return {
      mode:
        covered < groups.length
          ? "relaxed"
          : corrections.length
            ? "fuzzy"
            : prefix
              ? "prefix"
              : "exact",
      coverage: covered / groups.length,
      fields: [...matchedFields],
      corrections,
      snippet: `${start ? "…" : ""}${body.slice(start, start + 190)}${body.length > start + 190 ? "…" : ""}`,
    };
  }
  private codeHits(
    number: string,
    subjects: SubjectMatch[],
    filter: (doc: SearchDocument) => boolean,
    subjectInput: string,
  ): SearchHit[] {
    const scope = [...this.documents.values()].filter(
      (doc) =>
        filter(doc) &&
        (!subjects.length ||
          subjects.some((subject) => subject.code === doc.subject)),
    );
    const exact = scope.filter((doc) => fold(doc.catalogNumber) === number);
    const prefix = exact.length
      ? []
      : scope.filter((doc) => fold(doc.catalogNumber).startsWith(number));
    const matches = exact.length
      ? exact
      : prefix.length
        ? prefix
        : scope.filter((doc) => {
            const catalog = fold(doc.catalogNumber);
            return (
              number.length >= 3 &&
              (editDistance(catalog, number, number.length >= 5 ? 2 : 1) <=
                (number.length >= 5 ? 2 : 1) ||
                catalog === [...number].reverse().join(""))
            );
          });
    return matches.map((doc) => {
      const mode = exact.length
        ? ("exact" as const)
        : prefix.length
          ? ("prefix" as const)
          : ("fuzzy" as const);
      let distance =
        mode === "fuzzy" ? editDistance(fold(doc.catalogNumber), number, 3) : 0;
      if (mode === "fuzzy") {
        for (let i = 0; i < number.length - 1; i++)
          if (
            number.slice(0, i) +
              number[i + 1] +
              number[i] +
              number.slice(i + 2) ===
            fold(doc.catalogNumber)
          )
            distance = 0.7;
        if ([...number].reverse().join("") === fold(doc.catalogNumber))
          distance = Math.min(distance, 1.25);
      }
      const subject = subjects.find((item) => item.code === doc.subject);
      const corrections: SearchEvidence["corrections"] =
        mode === "fuzzy"
          ? [{ from: number, to: doc.catalogNumber, kind: "number" }]
          : [];
      if (subject && subject.score < 1)
        corrections.push({
          from: subjectInput,
          to: doc.subject,
          kind: "subject",
        });
      return {
        id: doc.id,
        score: 1000 - distance * 100 + (subject?.score ?? 1) * 100,
        evidence: {
          mode: corrections.length ? "fuzzy" : mode,
          coverage: 1,
          fields: ["catalogNumber", ...(subjects.length ? ["subject"] : [])],
          corrections,
          snippet: doc.title,
        },
      };
    });
  }
  search(
    value: string,
    filter: (doc: SearchDocument) => boolean = () => true,
    repairSpaces = true,
  ): {
    hits: SearchHit[];
    alternatives: SearchHit[];
    subjects: SubjectMatch[];
    kind: "course" | "number" | "subject" | "keyword";
  } {
    const query = value.normalize("NFKC").trim().slice(0, 200);
    const codeQuery = query.replace(/[_:/#-]+/g, " ");
    const code = /^([\p{L} &.']*?)\s*(\d{1,6}(?:\.\d+)?[a-z]{0,2})$/iu.exec(
      codeQuery,
    );
    const reverse =
      /^(\d{1,6}(?:\.\d+)?[a-z]{0,2})\s+([\p{L} &.']+)$/iu.exec(codeQuery) ??
      /^(\d{1,6}(?:\.\d+)?)([\p{L}&.']+)$/iu.exec(codeQuery);
    const subjectInput = code?.[1] ?? reverse?.[2] ?? query;
    const number = fold(code?.[2] ?? reverse?.[1] ?? "");
    const subjects = this.subjects.resolve(subjectInput);
    const exactTitle = this.exactTitles.has(terms(query).join(" "));
    const codeIntent = Boolean(
      number &&
      !/^\d{1,2}[a-z]+$/i.test(number) &&
      (!subjectInput.trim() || subjects.length) &&
      !(number.length < 3 && exactTitle),
    );
    let hits: SearchHit[] = [];
    if (codeIntent)
      hits = this.codeHits(
        number,
        subjects.filter(
          (subject) =>
            subject.score >=
            (subjects[0]?.score ?? 0) - (subjects[0]?.score === 1 ? 0 : 0.15),
        ),
        filter,
        subjectInput,
      );
    else {
      const groups = this.groups(query);
      if (groups.length) {
        const groupQuery = (group: Group): Query => ({
          combineWith: "OR",
          queries: group.options.map((option) => ({
            combineWith: "AND",
            queries: option.words,
            prefix: (word: string) => word.length >= 3,
          })),
        });
        const search = (combineWith: "AND" | "OR") =>
          this.index.search(
            { combineWith, queries: groups.map(groupQuery) },
            { filter: (hit) => filter(this.documents.get(String(hit.id))!) },
          );
        let candidates: SearchResult[] = search("AND");
        let relaxed = false;
        if (!candidates.length && groups.length >= 3) {
          candidates = search("OR");
          relaxed = true;
        }
        hits = candidates.flatMap((candidate) => {
          const evidence = this.evidence(String(candidate.id), groups, relaxed);
          if (!evidence) return [];
          const streams = this.phrases.get(String(candidate.id))!;
          const phraseWords = groups
            .map((group) => {
              const correction = evidence.corrections.find(
                (item) => terms(item.from).join(" ") === group.source,
              );
              return correction ? terms(correction.to).join(" ") : group.source;
            })
            .join(" ");
          const phrase = streams.title.includes(phraseWords);
          const descriptionPhrase =
            groups.length >= 3 && streams.description.includes(phraseWords);
          const tier =
            streams.title === phraseWords
              ? 5
              : evidence.mode === "exact"
                ? 4
                : evidence.mode === "prefix"
                  ? 3
                  : evidence.mode === "fuzzy"
                    ? 2
                    : 1;
          return [
            {
              id: String(candidate.id),
              evidence,
              score:
                tier * 100000 +
                evidence.coverage * 10000 -
                evidence.corrections.length * 200 +
                (evidence.fields.includes("title") ? 1000 : 0) +
                (phrase ? 8000 : descriptionPhrase ? 4000 : 0) +
                candidate.score,
            },
          ];
        });
      }
      if (subjects[0]?.score >= 0.84)
        for (const doc of this.documents.values()) {
          const subject = subjects.find((item) => item.code === doc.subject);
          if (
            !subject ||
            subject.score < subjects[0].score - 0.1 ||
            !filter(doc)
          )
            continue;
          if (!hits.some((hit) => hit.id === doc.id))
            hits.push({
              id: doc.id,
              score: subject.score * 300000,
              evidence: {
                mode: subject.score === 1 ? "exact" : "fuzzy",
                coverage: 1,
                fields: ["subject"],
                corrections:
                  compact(subjectInput) === compact(subject.code)
                    ? []
                    : [
                        {
                          from: subjectInput,
                          to: subject.code,
                          kind: "subject",
                        },
                      ],
                snippet: doc.title,
              },
            });
        }
    }
    if (!hits.length && !codeIntent && repairSpaces) {
      const words = terms(query);
      for (
        let i = 0, attempted = 0;
        i < words.length - 1 && attempted < 3;
        i++
      ) {
        const joined = words[i] + words[i + 1];
        if (!this.vocabulary.has(joined)) continue;
        attempted++;
        const repaired = [
          ...words.slice(0, i),
          joined,
          ...words.slice(i + 2),
        ].join(" ");
        const result = this.search(repaired, filter, false);
        if (result.hits.length) {
          hits = result.hits.map((hit): SearchHit => ({
            ...hit,
            evidence: {
              ...hit.evidence,
              mode: "fuzzy",
              corrections: [
                {
                  from: `${words[i]} ${words[i + 1]}`,
                  to: joined,
                  kind: "word",
                },
                ...hit.evidence.corrections,
              ],
            },
          }));
          break;
        }
      }
    }
    // Mixed input such as "CSE 2122 software": retrieve its text first, then
    // evaluate the number against the candidate's own identity. Numeric noise
    // cannot block useful title/description evidence or become a prerequisite hit.
    if (!hits.length && !codeIntent) {
      const words = terms(query),
        numbers = words.filter((word) =>
          /^\d{1,6}(?:\.\d+)?[a-z]{0,2}$/.test(word),
        );
      const text = words.filter((word) => !numbers.includes(word));
      if (numbers.length === 1 && text.length) {
        const number = numbers[0];
        hits = this.search(text.join(" "), filter, false).hits.flatMap(
          (hit): SearchHit[] => {
            if (hit.evidence.coverage < 1) return [];
            const doc = this.documents.get(hit.id)!,
              catalog = fold(doc.catalogNumber);
            const distance = editDistance(number, catalog, 2);
            const prefix = catalog.startsWith(number) && catalog !== number;
            if (number.length < 3 && catalog !== number && !prefix) return [];
            if (
              distance > 2 &&
              !prefix &&
              catalog !== [...number].reverse().join("")
            )
              return [];
            const corrections: SearchEvidence["corrections"] = [
              ...hit.evidence.corrections,
              ...(distance && !prefix
                ? [
                    {
                      from: number,
                      to: doc.catalogNumber,
                      kind: "number" as const,
                    },
                  ]
                : []),
            ];
            return [
              {
                ...hit,
                score: hit.score - distance * 500,
                evidence: {
                  ...hit.evidence,
                  mode: corrections.length
                    ? "fuzzy"
                    : prefix
                      ? "prefix"
                      : hit.evidence.mode,
                  fields: [...hit.evidence.fields, "catalogNumber"],
                  corrections,
                },
              },
            ];
          },
        );
      }
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const alternatives: SearchHit[] =
      codeIntent &&
      hits.some(
        (hit) =>
          this.documents.get(hit.id)!.catalogNumber.toLowerCase() === number,
      )
        ? this.codeHits(
            number,
            subjects.filter(
              (subject) =>
                subject.score >=
                (subjects[0]?.score ?? 0) -
                  (subjects[0]?.score === 1 ? 0 : 0.15),
            ),
            (doc) => filter(doc) && fold(doc.catalogNumber) !== number,
            subjectInput,
          )
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
            .slice(0, 24)
        : [];
    return {
      hits,
      alternatives,
      subjects,
      kind: codeIntent
        ? subjectInput.trim()
          ? ("course" as const)
          : ("number" as const)
        : subjects[0]?.score === 1
          ? ("subject" as const)
          : ("keyword" as const),
    };
  }
}
