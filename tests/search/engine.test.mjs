import test from "node:test";
import assert from "node:assert/strict";
import { CourseSearchEngine } from "../../src/lib/search/engine.ts";
const doc = (subject, subjectName, catalogNumber, title, description = "") => ({
  id: `${subject}-${catalogNumber}`,
  subject,
  subjectName,
  catalogNumber,
  campusCode: "COL",
  title,
  description,
  instructors: "",
});
const documents = [
  doc(
    "BIOCHEM",
    "Biochemistry",
    "4511",
    "Principles of Biochemistry",
    "Proteins catalyze chemical reactions and regulate cellular metabolism.",
  ),
  doc(
    "ASTRON",
    "Astronomy",
    "1140",
    "Planets and the Solar System",
    "Explore planets, moons and other objects in our solar system.",
  ),
  doc(
    "LING",
    "Linguistics",
    "2000",
    "Introduction to Language",
    "The structure of human languages and how children acquire language.",
  ),
  doc(
    "PHS",
    "Planetary Health Sciences",
    "3300",
    "Water and Living Systems",
    "How water pollution affects ecosystems and public health.",
  ),
  doc(
    "CSE",
    "Computer Science and Engineering",
    "2221",
    "Software I",
    "Design algorithms using classes and object oriented programming. Prereq: Math 1151.",
  ),
  doc(
    "CSE",
    "Computer Science and Engineering",
    "2231",
    "Software II",
    "Data structures, graphs, trees and algorithm design.",
  ),
  doc("MATH", "Mathematics", "1151", "Calculus I"),
  doc(
    "ISE",
    "Industrial and Systems Engineering",
    "3300",
    "Engineering Statistics",
    "Statistical modeling for industrial processes.",
  ),
];
const engine = new CourseSearchEngine(documents);
const ids = (query, filter) =>
  engine.search(query, filter).hits.map((hit) => hit.id);
test("retrieves unseen subjects and whole descriptions without an official-query candidate gate", () => {
  assert.equal(ids("biochemstry")[0], "BIOCHEM-4511");
  assert.equal(ids("proteins catalzye chemical reactions")[0], "BIOCHEM-4511");
  assert.equal(ids("how children acquire language")[0], "LING-2000");
  assert.equal(ids("planets solra system")[0], "ASTRON-1140");
});
test("derives arbitrary initials, word prefixes and consonant abbreviations from metadata", () => {
  for (const query of [
    "phs3300",
    "plan health sci 3300",
    "plnthlthsci3300",
    "health planetary sciences 3300",
  ])
    assert(ids(query).includes("PHS-3300"), query);
  assert.equal(ids("industrial systems eng3300")[0], "ISE-3300");
});
test("handles reversed code order, numeric transposition and wrong numbers with visible evidence", () => {
  for (const query of ["2221cse", "c.s.e_2221", "cse 2212", "cse1222"]) {
    const result = engine.search(query);
    assert.equal(result.hits[0]?.id, "CSE-2221", query);
  }
  assert.equal(
    engine.search("cse2212").hits[0].evidence.corrections[0].kind,
    "number",
  );
  assert.deepEqual(
    ids("1151"),
    ["MATH-1151"],
    "a prerequisite never counts as this course's code",
  );
});
test("splits joined words and joins accidental spaces using the corpus vocabulary", () => {
  assert.equal(ids("datastructures")[0], "CSE-2231");
  assert.equal(ids("bio chemistry")[0], "BIOCHEM-4511");
});
test("filters apply before ranking and nonsense never forces a match", () => {
  assert.deepEqual(
    ids("proteins", (doc) => doc.subject === "ASTRON"),
    [],
  );
  for (const query of ["zxqvjkplmno", "calculus zqvtwx"])
    assert.deepEqual(ids(query), []);
});
test("whole-title equality, Roman levels and dimensional titles outrank incidental title fragments", () => {
  const engine = new CourseSearchEngine([
    doc("CHEM", "Chemistry", "1210", "General Chemistry I"),
    doc("CHEM", "Chemistry", "1220", "General Chemistry II"),
    doc(
      "GENCHEM",
      "General Chemistry",
      "1100",
      "Introduction to General Chemistry",
    ),
    doc("ART", "Art", "2300", "2D Art"),
    doc("THEATRE", "Theatre", "2000.02", "Theatre Arts"),
  ]);
  assert.equal(engine.search("general chemistry I").hits[0].id, "CHEM-1210");
  assert.equal(engine.search("2D art").hits[0].id, "ART-2300");
  assert.equal(engine.search("the2000.02").hits[0].id, "THEATRE-2000.02");
});
test("valid but possibly mistyped numbers keep their exact identity and offer separate nearby choices", () => {
  const withCollision = new CourseSearchEngine([
    ...documents,
    doc(
      "CSE",
      "Computer Science and Engineering",
      "1222",
      "Introduction to Programming",
    ),
  ]);
  const result = withCollision.search("CSE1222");
  assert.equal(result.hits[0].id, "CSE-1222");
  assert(result.alternatives.some((hit) => hit.id === "CSE-2221"));
  assert.equal(engine.search("CSE2212").hits[0].id, "CSE-2221");
  const competing = new CourseSearchEngine([
    ...documents,
    doc("CSE", "Computer Science and Engineering", "2112", "Modeling"),
  ]);
  assert.equal(competing.search("CSE2212").hits[0].id, "CSE-2221");
});
test("mixed course codes and title words can recover a wrong number without changing course identity", () => {
  const result = engine.search("CSE 2122 software");
  assert.equal(result.hits[0].id, "CSE-2221");
  assert.equal(
    engine.search("CSE2221 software").hits[0].evidence.corrections.length,
    0,
  );
  assert(
    engine.search("CSE22 software").hits.some((hit) => hit.id === "CSE-2221"),
  );
  assert(
    result.hits[0].evidence.corrections.some(
      (item) => item.from === "2122" && item.to === "2221",
    ),
  );
});
test("corrections display actual query and catalog words rather than internal stems", () => {
  const spelling = new CourseSearchEngine([
    doc("DATA", "Data Sciences", "2100", "Statistical Analysis"),
  ]);
  const evidence = spelling.search("statistical anlysis").hits[0].evidence;
  assert.deepEqual(evidence.corrections[0], {
    from: "anlysis",
    to: "analysis",
    kind: "word",
  });
});
