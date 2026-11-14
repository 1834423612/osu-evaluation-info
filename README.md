# WahO!

Hop into better classes. Leap toward your degree.

[Documentation](docs/README.md) · [Testing](docs/testing.md) · [简体中文](README.zh-CN.md)

A responsive, bilingual course explorer built with Next.js App Router, React, TypeScript, Tailwind CSS, and shadcn/ui primitives.

## Run

Node.js 24+ and PostgreSQL are required for historical evaluations and unrestricted catalog browsing.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

On a new installation, create `.env.local` from `.env.example` and set `DATABASE_URL` for your imported `osu_eval` database before starting.

Open http://localhost:3000. Keep database credentials outside version control. Live official course search still works without the database, with explicit unavailable ratings and official search limits.

`pnpm dev` also detects the machine's Tailscale IPv4 address, allows that development origin, and prints a Tailscale link (like `http://100.101.11.11:3000`). Other devices on the tailnet can open it, subject to your existing Tailscale access rules. Localhost remains available. The dev server listens on `0.0.0.0`, so ordinary LAN interfaces are also reachable where the firewall permits.

On WSL2 with Tailscale installed on Windows, the launcher uses the Windows Tailscale CLI and creates a TCP Serve forward through Windows localhost to WSL (WSL's default localhost forwarding must be enabled). It removes its own forward when dev exits normally or receives Ctrl+C/SIGTERM, and leaves existing Serve ports unchanged. This uses tailnet-only Serve, not public Funnel. After a forced kill or machine crash, a stale forward may need manual removal with Windows `tailscale.exe serve --tcp 3000 off` (use the port printed at startup). If detection or forwarding fails, local development still starts and prints a diagnostic.

`pnpm dev --port 3000` and `PORT=3000 pnpm dev` are supported; the Tailscale link follows Next.js's actual selected port. An explicit `--hostname`/`-H` overrides the listen address and skips automatic Tailscale sharing. Restart dev after the Tailscale IP changes.

```sh
pnpm test
pnpm test:python
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

CSS is checked by `pnpm lint:css`; paired documentation, links and the test inventory by `pnpm lint:docs`. Both run as part of `pnpm lint`. Keep each selector in a single rule per scope, with one declaration per property. Put base styles before conditional overrides; media queries, interaction states, and keyframes remain separate scopes. CSS Modules isolate component class names, so the same local name in different modules is safe. Reuse shared UI components for repeated visual elements such as data-source badges, and avoid broad descendant rules that override their typography or colors.

## Refresh the complete catalog

Run `pnpm catalog:migrate` once when provisioning or upgrading the catalog database. See the [operations guide](docs/catalog/operations.md) for publication, retention, locking, and enrollment freshness.

```sh
pnpm catalog:discover
pnpm catalog:sync
```

The synchronizer discovers current searchable terms and all campuses, then imports the complete official catalog into a separate `osu_catalog` schema. It pages by subject, reconciles counts, deduplicates class numbers, retries failures, and resumes an interrupted run. A completed run is required for the unrestricted catalog mirror. `--new-run` creates a new refresh instead of resuming an unfinished run. The GitHub workflow runs only on its four-hour schedule (America/New_York), with no push, PR, or manual trigger. Run `pnpm catalog:migrate` explicitly before enabling it on a database; the scheduled job never performs schema migrations.

Complete codes first try one official result page; titles, descriptions and typo-tolerant queries use the published catalog index. Results show their sync time and match evidence; opening a course refreshes official details directly in the browser. Broad browsing still uses the live official service with a verified snapshot fallback. Enrollment status and counts come only from separate fresh official reads. Historical SEI and SSLE evaluations come from `osu_eval`, retain source metadata, and are never combined across instruments. Existing evaluation import commands remain available as `db:validate` / `db:import`.

[The search engine](docs/catalog/search.md) derives subject abbreviations and spelling alternatives from the whole catalog, combines field-weighted BM25 retrieval with explicit match evidence, and supports wrong/reversed numbers, descriptions and split/joined words. Its read-only evaluator sweeps complete published terms instead of testing only manually chosen examples. Search suggestions never alter rating identities.

## Navigation and controls

The Courses menu contains course search (the default homepage) and the RMP faculty library. Guides groups the OSU field guide and data methods. Current pages and parent groups remain selected, including teacher detail routes. Menus and shared choice controls support keyboard navigation and narrow screens.

## Course syllabi

Course cards and details include term- and section-matched Simple Syllabus documents, the official OSU layout, responsive reading, source excerpts, and browser-local US Letter PDF downloads. Browser requests prefer the official service, then an anonymous compatibility relay and versioned PostgreSQL backups. Initialize with `pnpm syllabus:migrate`; `pnpm syllabus:sync` discovers published terms and resumes archival work. The [syllabus operations guide](docs/syllabus/operations.md) covers verified endpoints, daily scheduling, matching, limitations, and recovery.

## Project layout

- `src/app`: pages `/`, `/rmp`, `/rmp/[id]`, `/saved`, `/reference`, `/methodology`, and API route handlers.
- `src/components/catalog`: course search, cards, section/week views, and filters.
- `src/components/layout` and `src/components/brand`: shared navigation, footer, notifications, and mascot.
- `src/components/evaluations`, `people`, `rmp`, `saved`, and `translation`: feature components with colocated CSS modules.
- `src/components/ui`: the shadcn primitives used by the app.
- `src/hooks/use-preferences.ts`: versioned device-local language and saved-course snapshots.
- `src/lib/catalog`: official service adapter, typed data contracts, and bounded snapshot browsing.
- `src/lib/evaluations`: database aggregates, exact faculty identity matching, and versioned scoring policy.
- `src/lib/translation`: on-demand Chrome/NAS/Google adapters, batch transport, load-aware fallback, and daily usage aggregates; no separate process is required.
- `public/brand`: only the images actively served by the app; paths are centralized in `src/lib/brand.ts`. Next.js browser and Apple icon entry files live in `src/app`.
- `scripts/brand`: favicon/ICO conversion and social-card generation. Complete source artwork and unused exports live in the separate `../OSU_MilkyFrog_Assets` master kit; they are not needed to run or build the website.
- `scripts/{catalog,evaluations,people,rmp}`: maintenance tools grouped by data source; `scripts/dev.mjs` starts development.
- `db/schemas` and `db/migrations`: SQL definitions and explicit additive migrations. Existing ignored local database archives remain in `db/`.
- `tests/{catalog,evaluations,people,rmp,translation}`: JavaScript and Python tests grouped by feature.
- `docs`: [guides organized by area](docs/README.md).

Search and filters are stored in the URL. Heavy evaluation charts load on demand. Requests cancel on query changes. Automatic loading covers the first result windows, followed by an explicit load-more control; mounted course results are capped at 96 and old windows are replaced. Saved courses are device-local snapshots, capped at 100. Neither all catalog data nor the SQL export is shipped to the browser.

## Data references

- [Brand assets, browser icons, and sharing configuration](docs/design/branding.md)
- [Official service and synchronization](docs/catalog/api.md)
- [Evaluation methods, identity matching, and score thresholds](docs/evaluations/methodology.md)
- [Original evaluation import instructions](docs/evaluations/import.md)
- [Authorized Rate My Professors collection](docs/rmp/import.md)
- [Legacy SQLite supplements](docs/rmp/supplement.md)
- [Umami analytics, replays, and heatmaps](docs/analytics/umami.md)
- [Official course content and instructor photos](docs/catalog/content-and-photos.md)
- [Translation configuration, fallback, and usage statistics](docs/translation.md)
- [Translation node states, recovery, and management commands](docs/translation-operations.md)

The verified November 3, 2026 import covered Summer 2026, Autumn 2026 and Spring 2027: 713 partitions, 70,454 official hits and 70,435 distinct term/class-number sections. The 19 duplicate official hits were preserved in audit counts and removed from section identity. These are import-time facts, not hardcoded UI counts.
