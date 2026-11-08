import assert from "node:assert/strict";
import test from "node:test";
import { inspectStylesheet } from "../../scripts/styles/check-css.mjs";

test("detects repeated selectors hidden in selector lists", () => {
  const issues = inspectStylesheet(
    ".heading, .identity { display: flex; }\n.heading { display: grid; }",
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Duplicate selector "\.heading"/);
  assert.equal(issues[0].line, 2);
});

test("detects duplicates across separate blocks of the same media query", () => {
  const issues = inspectStylesheet(`
    @media (max-width: 640px) { .row { gap: 8px; } }
    @media (max-width: 640px) { .row { gap: 10px; } }
  `);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Duplicate selector/);
});

test("allows responsive, state, nested, and keyframe scopes", () => {
  assert.deepEqual(
    inspectStylesheet(`
    .row { display: grid; }
    .row[data-state="open"] { color: red; }
    .parent { .row { gap: 2px; } }
    @keyframes enter { from { opacity: 0; } to { opacity: 1; } }
    @keyframes exit { from { opacity: 1; } to { opacity: 0; } }
    @media (max-width: 640px) { .row { display: flex; } }
    @media (max-width: 480px) { .row { gap: 4px; } }
    @supports (display: grid) { .row { display: grid; } }
  `),
    [],
  );
});

test("detects duplicate declarations and tokens while respecting custom-property case", () => {
  const issues = inspectStylesheet(`
    :root { --ink: black; --ink: gray; --Ink: white; }
    .row { color: red; COLOR: blue; padding: 8px; padding-left: 10px; }
    @font-face { font-family: one; font-family: two; }
  `);
  assert.equal(issues.length, 3);
  assert.ok(
    issues.every((issue) => issue.message.startsWith("Duplicate property")),
  );
});

test("prevents later base rules from silently overriding responsive rules", () => {
  const issues = inspectStylesheet(`
    @media (max-width: 640px) { .row { display: flex; } }
    .row { display: grid; }
  `);
  assert.equal(issues.length, 1);
  assert.match(
    issues[0].message,
    /Base rule appears after conditional overrides/,
  );
});
