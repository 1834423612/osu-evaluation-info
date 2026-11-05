# Course Atlas / OSU Eval

A responsive, bilingual course explorer built with Next.js App Router, React, TypeScript, Tailwind CSS, and shadcn/ui primitives. The previous application and API were replaced. Existing SEI/SSLE collection and import scripts, raw data, database export, and database contents are retained.

## Run

Node.js 24+ and PostgreSQL are required for historical evaluations and unrestricted catalog browsing.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

On a new installation, create `.env.local` from `.env.example` and set `DATABASE_URL` for your imported `osu_eval` database before starting.

Open http://localhost:3000. The local environment already has a working database connection; never commit its credentials. Live official course search still works without the database, with explicit unavailable ratings and official search limits.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

## Refresh the complete catalog

```sh
pnpm catalog:discover
pnpm catalog:sync
```

The synchronizer discovers current searchable terms and all campuses, then imports the complete official catalog into a separate `osu_catalog` schema. It pages by subject, reconciles counts, deduplicates class numbers, retries failures, and resumes an interrupted run. A completed run is required for the unrestricted catalog mirror. `--new-run` creates a new refresh instead of resuming an unfinished run. No recurring automation has been installed.

Official search is queried live with a short cache for text searches and detailed filters. Broad queries that exceed the official 10,000-hit ceiling use a verified complete database snapshot; the interface labels the source and sync time. Expanding a course retrieves fresh official sections. Historical SEI and SSLE evaluations come from `osu_eval`, retain source metadata, and are never combined across instruments. Existing evaluation import commands remain available as `db:validate` / `db:import`.

## Project layout

- `src/app`: pages `/`, `/saved`, `/methodology`, and API route handlers.
- `src/components/catalog`: reusable course cards, section/week views, filters, evaluations and app shell.
- `src/components/ui`: shadcn primitives and shared interaction foundations.
- `src/hooks/use-preferences.ts`: versioned device-local language and saved-course snapshots.
- `src/lib/catalog`: official service adapter, typed data contracts, and bounded snapshot browsing.
- `src/lib/evaluations`: database aggregates, exact faculty identity matching, and versioned scoring policy.
- `scripts`: original evaluation tools plus the resumable course synchronizer.
- `tests/scoring.test.mjs`: deterministic scoring tests, independent of network and database.

Search and filters are stored in the URL. Heavy evaluation charts load on demand. Requests cancel on query changes. Automatic loading covers the first result windows, followed by an explicit load-more control; mounted course results are capped at 96 and old windows are replaced. Saved courses are device-local snapshots, capped at 100. Neither all catalog data nor the SQL export is shipped to the browser.

## Data references

- [Official service and synchronization](docs/catalog-api.md)
- [Evaluation methods, identity matching, and score thresholds](docs/evaluation-methodology.md)
- [Original evaluation import instructions](docs/data-import.md)
- [Authorized Rate My Professors collection](docs/rmp-import.md)
- [Legacy SQLite supplements](docs/rmp-supplement.md)
- [Official course content and instructor photos](docs/osu-content-and-photos.md)

The verified November 3, 2026 import covered Summer 2026, Autumn 2026 and Spring 2027: 713 partitions, 70,454 official hits and 70,435 distinct term/class-number sections. The 19 duplicate official hits were preserved in audit counts and removed from section identity. These are import-time facts, not hardcoded UI counts.
