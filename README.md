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

## Refresh the complete catalog

```sh
pnpm catalog:discover
pnpm catalog:sync
```

The synchronizer discovers current searchable terms and all campuses, then imports the complete official catalog into a separate `osu_catalog` schema. It pages by subject, reconciles counts, deduplicates class numbers, retries failures, and resumes an interrupted run. A completed run is required for the unrestricted catalog mirror. `--new-run` creates a new refresh instead of resuming an unfinished run. No recurring automation has been installed.

Official search is queried live with a short cache for text searches and detailed filters. Broad queries that exceed the official 10,000-hit ceiling use a verified complete database snapshot; the interface labels the source and sync time. Expanding a course retrieves fresh official sections. Historical SEI and SSLE evaluations come from `osu_eval`, retain source metadata, and are never combined across instruments. Existing evaluation import commands remain available as `db:validate` / `db:import`.

## Project layout

- `src/app`: pages `/`, `/saved`, `/methodology`, and API route handlers.
- `src/components/catalog`: course search, cards, section/week views, and filters.
- `src/components/layout` and `src/components/brand`: shared navigation, footer, notifications, and mascot.
- `src/components/evaluations`, `people`, `rmp`, `saved`, and `translation`: feature components with colocated CSS modules.
- `src/components/ui`: the shadcn primitives used by the app.
- `src/hooks/use-preferences.ts`: versioned device-local language and saved-course snapshots.
- `src/lib/catalog`: official service adapter, typed data contracts, and bounded snapshot browsing.
- `src/lib/evaluations`: database aggregates, exact faculty identity matching, and versioned scoring policy.
- `public/brand`: the images actively served by the app; paths are centralized in `src/lib/brand.ts`.
- `assets/brand`: original artwork and unused variants, with duplicate image copies removed.
- `scripts/{catalog,evaluations,people,rmp}`: maintenance tools grouped by data source; `scripts/dev.mjs` starts development.
- `db/schemas`: versioned SQL schema definitions. Existing ignored local database archives remain in `db/`.
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
- [Official course content and instructor photos](docs/catalog/content-and-photos.md)

The verified November 3, 2026 import covered Summer 2026, Autumn 2026 and Spring 2027: 713 partitions, 70,454 official hits and 70,435 distinct term/class-number sections. The 19 duplicate official hits were preserved in audit counts and removed from section identity. These are import-time facts, not hardcoded UI counts.
