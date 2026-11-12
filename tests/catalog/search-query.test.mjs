import assert from "node:assert/strict";
import test from "node:test";
import {
  planCatalogSearch,
  courseSearchScore,
  officialKeywordQuery,
  editDistance,
} from "../../src/lib/catalog/search-query.ts";
const facets = [
  {
    slug: "subject",
    items: [
      ["cse", "Computer Science & Engineering"],
      ["math", "Mathematics"],
      ["philos", "Philosophy"],
      ["earthsc", "Earth Sciences"],
      ["mecheng", "Mechanical Engineering"],
      ["agrcomm", "Agricultural Communication"],
      ["civicll", "Civics, Law, and Leadership"],
      ["english", "English"],
      ["engr", "Engineering"],
      ["animsci", "Animal Sciences"],
      ["psych", "Psychology"],
      ["stat", "Statistics"],
    ].map(([value, label]) => ({ value, label })),
  },
];
test("recognizes real subject names, abbreviations and the observed spelling variants", () => {
  for (const [query, subject, canonical] of [
    ["philosophy 2465", "PHILOS", "PHILOS 2465"],
    ["earth science", "EARTHSC", ""],
    ["earthsc", "EARTHSC", ""],
    ["MECH 2040", "MECHENG", "MECHENG 2040"],
    ["ME 639", "MECHENG", "MECHENG 639"],
    ["AGCOMM 2330", "AGRCOMM", "AGRCOMM 2330"],
    ["MAT 1151", "MATH", "MATH 1151"],
    ["civics, law, and leadership", "CIVICLL", ""],
    ["psychology", "PSYCH", ""],
    ["statistics", "STAT", ""],
    ["ＣＳＥ－２２２１", "CSE", "CSE 2221"],
  ]) {
    const plan = planCatalogSearch(query, facets);
    assert.equal(plan.subject, subject, query);
    assert.equal(plan.canonicalQuery, canonical, query);
  }
});
test("keeps ambiguity, prefixes and filter conflicts explicit", () => {
  const ambiguous = planCatalogSearch("ENG 2040", facets);
  assert.equal(ambiguous.subject, undefined);
  assert.equal(ambiguous.suggestions.length, 2);
  const partial = planCatalogSearch("cse 22", facets);
  assert.equal(partial.canonicalQuery, "22");
  assert.equal(partial.subject, "CSE");
  const fragment = planCatalogSearch("ani", facets);
  assert.equal(fragment.kind, "keyword");
  assert.equal(fragment.canonicalQuery, "ani");
  assert.equal(fragment.suggestions[0].query, "ANIMSCI");
  assert.equal(planCatalogSearch("PHILOS 2465", facets, "MATH").conflict, true);
  assert.equal(
    planCatalogSearch("MATH 11011", facets).canonicalQuery,
    "MATH 11011",
    "never silently repair a number",
  );
  assert.equal(
    planCatalogSearch("math 110151", facets).canonicalQuery,
    "110151",
  );
});
const course = (subject, catalogNumber, title, description = "") => ({
  subject,
  catalogNumber,
  title,
  description,
  subjectName: "",
  sections: [],
});
test("requires shared query words and ranks titles ahead of incidental descriptions", () => {
  const target = course("PHILOS", "2465", "Death and the Meaning of Life");
  const incidental = course(
    "ENGR",
    "1181",
    "Engineering Foundations",
    "A discussion of death, meaning and life",
  );
  assert(
    courseSearchScore(target, "death meaning life") >
      courseSearchScore(incidental, "death meaning life"),
  );
  assert.equal(
    courseSearchScore(
      course("ART", "3004", "Life Studio Drawing I"),
      "death meaning life",
    ),
    0,
  );
  assert(
    courseSearchScore(course("ACCAD", "5001", "Animation Techniques"), "ani") >
      0,
  );
  assert.equal(
    courseSearchScore(
      course(
        "ACCTMIS",
        "3300",
        "Cost Accounting",
        "management of organizations",
      ),
      "ani",
    ),
    0,
  );
  assert.equal(
    courseSearchScore(
      course("COMM", "4511", "User-Centered Design", "Prereq: 2511"),
      "2511",
    ),
    0,
  );
  assert.equal(
    courseSearchScore(course("COMM", "2511", "Visual Design"), "2511"),
    150,
  );
  assert.equal(
    courseSearchScore(course("CSE", "1222", "Programming"), "22"),
    0,
  );
  assert.equal(
    officialKeywordQuery("civics, law, and leadership"),
    "civics AND law AND leadership",
  );
  assert.equal(editDistance("ces", "cse"), 1);
});
