import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { searchOfficial } from "../catalog/upstream.mjs";
const { values } = parseArgs({ options: { term: { type: "string" } } });
if (!/^\d{4}$/.test(values.term ?? ""))
  throw Error(
    "Pass an explicitly selected public catalog --term, for example 1272",
  );
const data = await searchOfficial({ term: values.term, campus: "col", p: "1" });
const items = data.filters?.find((f) => f.slug === "subject")?.items;
if (!Array.isArray(items) || items.length < 100)
  throw Error("Official subject list is incomplete");
const subjects = items
  .map((s) => ({ code: String(s.term).toUpperCase(), title: s.title }))
  .filter(
    (s) => /^[A-Z][A-Z& ]{1,11}$/.test(s.code) && typeof s.title === "string",
  );
await writeFile(
  new URL("../../data/planning/subjects.json", import.meta.url),
  JSON.stringify(
    {
      schemaVersion: 1,
      sourceUrl: "https://content.osu.edu/v2/classes/search",
      observedTerm: values.term,
      fetchedAt: new Date().toISOString(),
      subjects,
    },
    null,
    2,
  ) + "\n",
);
console.log(
  JSON.stringify({ subjects: subjects.length, observedTerm: values.term }),
);
