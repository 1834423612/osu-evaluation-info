# WahO! / 蛙O！ branding

WahO! / 蛙O！ uses the thinking campus mascot and four expression illustrations across navigation, status messages, browser icons, and sharing previews. `src/lib/brand.ts` is the shared source for the product name, description, scarlet theme color (`#BA0C2F`), warm background (`#FAF8F6`), and public asset paths. `src/components/brand/brand-mascot.tsx` renders the portrait, thinking artwork, and named expressions; `scene-mascot.tsx` selects artwork for random scenes.

## Confirmed identity and typography

- Chinese name: **蛙O！** (Latin uppercase O, full-width exclamation mark).
- English name: **WahO!** (uppercase W and O).
- Chinese slogan: **选课不迷路，毕业有蛙助。**
- English slogan: **Hop into better classes. Leap toward your degree.**

`brand.names`, `brand.slogan`, and `brand.context` supply localized copy. Navigation and the footer show the current language's name; browser metadata and the install manifest use the bilingual name. The short install name is WahO!.

`brand-wordmark.tsx` renders a bold, compact wordmark with the O and exclamation mark in scarlet. The homepage uses a two-line slogan, with the second sentence in scarlet, responsive type sizes, and a smaller course-search description below. Styles live in `brand-identity.module.css`; no external font download is required. The footer repeats the exact slogan in a compact layout.

The sharing card includes both names, both slogans, and the existing mascot. Rebuild the committed PNG with `node scripts/brand/generate-social.mjs` after changing brand copy. The renderer uses local fonts; a Chinese-capable system font is required to regenerate the Chinese text correctly.

Existing `course-atlas:*` browser-storage keys and events are retained so saved courses, preferences, and other device-local state survive the rename.

## Asset locations

The app's active image paths are centralized in `src/lib/brand.ts`. Complete original artwork and unused exports belong to the separate `../OSU_MilkyFrog_Assets` master kit. The website contains only the files it uses and can run and build without that sibling directory.

Previously, `assets/brand` held sources and unused exports while `public/brand` held browser-accessible files. Over time both directories accumulated duplicate images and unused public variants. The redundant website archive has been removed after verifying that every archived image already existed byte-for-byte in the master kit. Its three unique historical README files are preserved in the kit's `legacy/osu-eval-docs` directory.

| Location                   | Purpose                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `../OSU_MilkyFrog_Assets/` | Complete master kit: original PNGs, vectors, all expressions and alternate exports |
| `public/brand/mascot/`     | Active portrait, full mascot and four expression WebPs                             |
| `public/brand/icons/`      | Two application PNGs and two maskable PNGs                                         |
| `public/brand/social/`     | Final bilingual sharing card                                                       |
| `src/app/`                 | Next.js favicon, PNG icon and Apple icon convention files                          |
| `scripts/brand/`           | Reproducible icon conversion and sharing-card generation                           |

| Surface                             | Canonical asset                         |
| ----------------------------------- | --------------------------------------- |
| Navigation and compact identity     | `/brand/mascot/portrait.webp`           |
| Page illustrations and empty states | `/brand/mascot/full.webp`               |
| Expression illustrations            | `/brand/mascot/expressions/<pose>.webp` |
| Browser tab, PNG icon               | `src/app/icon.png` (128×128)            |
| Browser tab, ICO fallback           | `src/app/favicon.ico`                   |
| Apple home-screen icon              | `src/app/apple-icon.png` (180×180)      |
| Application icons                   | `/brand/icons/app-{192,512}.png`        |
| Maskable application icons          | `/brand/icons/maskable-{192,512}.png`   |
| Open Graph and Twitter sharing      | `/brand/social/og-image.png`            |

Next.js automatically emits the browser and Apple icon links from `src/app`. These three entry files remain there to use that convention; illustrations live together under `public/brand`. `src/app/manifest.ts` generates `/manifest.webmanifest`, using the shared brand paths and separate `any`/`maskable` icons. `src/app/layout.tsx` sets titles, social metadata, the application name, and theme color.

## Favicon source and conversion

The approved source is `../OSU_MilkyFrog_Assets/thinking-new-favicon.png` (1254×1254). All website favicon, Apple, application and maskable icons are generated from this exact PNG, without redrawing it. The old `src/app/icon.svg` has been removed so it cannot override the new artwork.

```sh
# Regenerate the seven website icon files.
pnpm brand:icons

# Also update all favicon and application-icon aliases in the master kit.
pnpm brand:icons --kit-root ../OSU_MilkyFrog_Assets

# Verify both sets against the source without writing files.
pnpm brand:icons --kit-root ../OSU_MilkyFrog_Assets --check
```

For a different source location, pass `--source /absolute/path/to/thinking-new-favicon.png`. A square PNG is required. The master kit is updated only when `--kit-root` is explicitly provided; normal application builds never run this converter.

ICO files contain six real PNG frames (16, 32, 48, 64, 128 and 256px), rather than a renamed PNG. The kit's two favicon SVG files embed the new PNG to preserve their existing URLs; these wrappers are raster artwork, not traced vectors. Apple icons use an opaque scarlet background. Maskable icons place the complete artwork in a central square at 56% of the image width, within the circular safe area, on an opaque scarlet background. The master PNG remains untouched.

## Expression scenes

Four action poses are published as one WebP per expression under `public/brand/mascot/expressions/`. The four paths are mapped in `src/lib/brand.ts`. Transparent source crops, PNGs and alternate sizes remain in the master kit.

| Scene                                  | Artwork                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| Empty saved list                       | Salute                                                      |
| Successful save toast                  | Belly laugh                                                 |
| Catalog loading                        | Tired typing                                                |
| Search with no matches                 | Thinking                                                    |
| 404 page                               | Random salute, belly laugh, pointing laugh, or tired typing |
| Page error and catalog request failure | Random thinking, tired typing, or salute                    |

The thinking mascot uses the original 256px portrait for compact placements and a 512px full WebP for page illustrations and the sharing card. All five unused SVG variants and their raster exports remain in the master kit's `vector-flat` directory. Normal status illustrations use a named `BrandMascot` expression, for example `<BrandMascot expression="salute" size={128} />`. Random states use `<SceneMascot scene="not-found" />` or `<SceneMascot scene="error" />`.

`SceneMascot` chooses after hydration and keeps one expression per scene for the current document, so language changes and retries do not redraw it. On refresh, `sessionStorage` excludes that scene's previous expression. When storage is unavailable, selection still works but can repeat. A fixed-size placeholder preserves layout before selection and avoids a server/client hydration mismatch.

Runtime images use the supplied 512-pixel WebP for salute and both laughing poses, and the 256-pixel WebP for tired typing. The website publishes only these four files; complete PNG/WebP size sets remain in the master kit.

## Public sharing URL

Set `SITE_URL` to the public site origin before a production build. Open Graph and Twitter image URLs use that origin. Only the origin is used because assets are served from the site root.

The resolution order is `SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, then `http://localhost:3000`. Vercel hostnames without a protocol use HTTPS; empty or invalid values are skipped. Local development works without this setting.

## Updating artwork

Keep original artwork and unused exports in the master kit. Copy only the chosen runtime variant into `public/brand` and update `src/lib/brand.ts` when a path changes. Run `pnpm brand:social` after updating the full mascot or brand copy. Browser icons are refreshed through `pnpm brand:icons`. Do not copy the complete master kit into the website.

The master kit's `README.md` records provenance and format details. Historical website asset notes remain in its `legacy/osu-eval-docs` directory. The artwork depicts an unofficial campus mascot with Ohio State Block O elements; the supplied kit's usage notice remains with the originals.
