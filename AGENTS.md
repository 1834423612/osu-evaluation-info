<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git commit scope

- Commit every new feature or fix independently after the relevant checks pass.
- Use Conventional Commits with a concrete scope, such as `feat(search): ...`, `fix(nav): ...`, `docs(testing): ...`, or `test(rmp): ...`. Do not omit the type or scope.
- Keep unrelated features, styles, maintenance tools, and documentation in separate commits.
- Stage individual changes when a file contains more than one feature.
- Include feature-specific tests with their feature; keep cross-feature regression suites in a clearly named test commit when appropriate.
- Give each commit a concrete scope and description so its behavior can be traced later.

## Product copy

- Use short, concrete labels for state, facts and actions in both languages.
- Do not add routine paragraphs describing search internals, repeating source badges,
  praising features, or asking users to interpret information already marked on each result.
- Show warnings when the current data or action needs one. Put longer source and
  calculation explanations in the methods page or contextual info panel.

## Documentation

- English is the default for `README.md`, `docs/`, and source-content guides. Keep Simplified Chinese prose in `README.zh-CN.md` and the matching `docs/zh-CN/` categories.
- Every public guide must have a language switch and a corresponding Chinese guide. Keep paths, commands, configuration names, tables, caveats, and observed dates consistent between languages.
- Update both language indexes when adding or moving a guide. Fix repository-relative links; never publish local machine paths, temporary evidence paths, credentials, or session identifiers.
- Write documentation for a new reader: state behavior, setup, operations, and limitations directly. Omit conversation history, user instructions, assistant task lists, ornamental filler, and unverified claims.
- Keep historical audits dated and distinguish their observations from current behavior. Do not turn snapshot counts or local benchmarks into current guarantees.
- Document each test script's purpose, how to run it, required services or flags, and whether it can write data or call external services. Update `docs/testing.md` and its Chinese counterpart when tests change.
- Run `pnpm lint:docs` after documentation edits. Keep documentation changes separate from implementation commits.
