import {
  academicRequirementTree,
  compareRequirementTree,
} from "./private-har.mjs";
// Optional local-only regression. Never log paths, content, errors or plan values.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parsePlanLines,
  detectPlanLayout,
} from "../../src/lib/planning/parser.ts";
import {
  academicRoster,
  compareAcademicRoster,
  academicResponses,
  academicEvidence,
  compareAcademicEvidence,
} from "./private-har.mjs";
import { planningLines } from "../../src/lib/planning/pdf-lines.ts";
import { mergeSnapshots } from "../../src/lib/planning/snapshots.ts";
import { boardCourses } from "../../src/lib/planning/workspace.ts";
const representatives = new Map();
let responseRoster = [];
const directory = process.env.PLANNING_PRIVATE_PDF_DIR;
if (!directory)
  throw Error(
    "PLANNING_PRIVATE_PDF_DIR is required for this opt-in local test",
  );
console.warn = () => {};
const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
async function walk(path, extension = /\.pdf$/i) {
  const files = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(file, extension)));
    else if (entry.isFile() && extension.test(entry.name)) files.push(file);
  }
  return files;
}
const groups = {};
let responseTree;
let harEvidence = null;
if (process.env.PLANNING_PRIVATE_HAR_COMPARE === "1") {
  try {
    const responses = [];
    for (const file of await walk(directory, /\.har$/i))
      responses.push(
        ...academicResponses(JSON.parse(await readFile(file, "utf8"))),
      );
    harEvidence = academicEvidence(responses);
    responseRoster = academicRoster(responses);
    responseTree = academicRequirementTree(responses);
  } catch {
    console.log(JSON.stringify({ localHarReadFailure: true }));
    process.exit(1);
  }
}
const comparisons = [];
const treeComparisons = [];
const files = await walk(directory).catch(() => {
  console.log(JSON.stringify({ localReadFailure: true }));
  process.exitCode = 1;
  return [];
});
for (const file of files) {
  const type = /compact/i.test(file)
    ? "compact-audit"
    : /expanded/i.test(file)
      ? "expanded-audit"
      : /standard/i.test(file)
        ? "standard-audit"
        : "student-plan";
  const group = (groups[type] ??= {
    documents: 0,
    pages: 0,
    pagesWithText: 0,
    candidates: 0,
    assignedSemesters: 0,
    knownCourseCredits: 0,
    unknownCourseCredits: 0,
    nonAttendanceGroups: 0,
    appliedVersionDetected: 0,
    catalogTermDetected: 0,
    failures: 0,
    programRecords: 0,
    requirementCandidates: 0,
    allocationCandidates: 0,
  });
  group.documents++;
  let task;
  try {
    task = getDocument({
      data: new Uint8Array(await readFile(file)),
      verbosity: 0,
    });
    const pdf = await task.promise;
    group.pages += pdf.numPages;
    const lines = [];
    for (let page = 1; page <= pdf.numPages; page++) {
      const pageLines = planningLines(
        (await (await pdf.getPage(page)).getTextContent()).items,
        page,
      );
      group.pagesWithText += Number(pageLines.length > 0);
      lines.push(...pageLines);
    }
    const detected = detectPlanLayout(lines);
    if (!detected || detected !== type) throw Error("layout classification");
    const { plan } = parsePlanLines(lines, detected);
    if (responseTree && type.includes("audit"))
      treeComparisons.push({
        type,
        ...compareRequirementTree(plan, responseTree),
      });
    const key = type + (/planned/i.test(file) ? "-planned" : "");
    if (!representatives.has(key)) representatives.set(key, plan);
    if (harEvidence && type === "student-plan")
      comparisons.push(compareAcademicEvidence(plan, harEvidence));
    group.programRecords += plan.programs.length;
    group.requirementCandidates += plan.requirements.length;
    group.allocationCandidates += plan.allocations.length;
    for (const semester of plan.semesters) {
      group.assignedSemesters += Number(!!semester.term);
      group.nonAttendanceGroups += Number(
        ["exam", "transfer"].includes(semester.creditOrigin),
      );
      for (const course of semester.courses) {
        group.candidates++;
        group[
          course.credits === null
            ? "unknownCourseCredits"
            : "knownCourseCredits"
        ]++;
      }
    }
    group.appliedVersionDetected += Number(!!plan.appliedVersion);
    group.catalogTermDetected += Number(!!plan.catalogTerm);
  } catch {
    group.failures++;
  } finally {
    await task?.destroy();
  }
}
let rosterComparison;
if (responseRoster.length) {
  const selection = [
    representatives.get("student-plan"),
    representatives.get("expanded-audit"),
    representatives.get("standard-audit-planned"),
  ].filter(Boolean);
  if (selection.length)
    rosterComparison = compareAcademicRoster(
      boardCourses(selection.reduce((a, b) => mergeSnapshots(a, b))),
      responseRoster,
    );
  if (
    rosterComparison &&
    (rosterComparison.missing ||
      rosterComparison.matchingStatus !== rosterComparison.comparable ||
      rosterComparison.matchingCredits !== rosterComparison.comparable)
  )
    process.exitCode = 1;
}
console.log(
  JSON.stringify({
    rosterComparison,
    treeComparisons,
    groups,
    ...(harEvidence ? { responseOnlyComparisons: comparisons } : {}),
  }),
);
if (
  Object.values(groups).some((g) => g.failures) ||
  comparisons.some((comparison) => comparison.conflictingCredits > 0) ||
  treeComparisons.some((c) => c.comparableEdges !== c.matchingEdges)
)
  process.exitCode = 1;
