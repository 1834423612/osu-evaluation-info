# Editing data and methods

- Edit `en.ts` or `zh.ts` independently. All article text, section order, facts and source links live here; the shared renderer is `src/components/evaluations/methodology.tsx`.
- Each language imports its own CSS module. Change its typography variables or add scoped rules, for example `.article :global(h2) { ... }`, to customize only that language.
- Keep section IDs stable for existing anchor links. `facts` adds a compact callout list; `link` adds a source link.
- Verify behavioral statements against the catalog transport, evaluation scoring policy and syllabus implementation when those change.
