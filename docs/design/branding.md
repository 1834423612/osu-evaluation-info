# Course Atlas branding

Course Atlas uses the thinking campus mascot and four expression illustrations across navigation, status messages, browser icons, and sharing previews. `src/lib/brand.ts` is the shared source for the product name, description, scarlet theme color (`#BA0C2F`), warm background (`#FAF8F6`), and public asset paths. `src/components/brand/brand-mascot.tsx` renders the portrait, thinking artwork, and named expressions; `scene-mascot.tsx` selects artwork for random scenes.

## Asset locations

The app's active image paths are centralized in `src/lib/brand.ts`. Runtime images are copied into stable `public/brand` directories and do not depend on the separately distributable mascot kit.

| Location                 | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `public/brand/`          | Active mascot, expression, app icon, and sharing images            |
| `src/app/`               | Next.js browser and Apple icon convention files                   |
| `assets/brand/source/`   | Original thinking artwork and four native expression PNGs         |
| `assets/brand/variants/` | Unused sizes, formats, and alternate artwork, outside public URLs |

| Surface                             | Canonical asset                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------- |
| Navigation and compact identity     | `/brand/mascot/portrait.webp` |
| Page illustrations and empty states | `/brand/mascot/full.webp` |
| Expression illustrations            | `/brand/mascot/expressions/<pose>/<pose>-{512,256}.webp` |
| Browser tab, scalable icon          | `src/app/icon.svg`                                                                |
| Browser tab, ICO fallback           | `src/app/favicon.ico`                                                             |
| Apple home-screen icon              | `src/app/apple-icon.png` (180×180)                                                |
| Application icons                   | `/brand/icons/app-{192,512}.png`                                                  |
| Maskable application icons          | `/brand/icons/maskable-{192,512}.png`                                             |
| Open Graph and Twitter sharing      | `/brand/social/og-image.png`                                                      |

Next.js automatically emits the browser and Apple icon links from `src/app`. These filenames must remain there. `src/app/manifest.ts` generates `/manifest.webmanifest`, using the shared brand paths and separate `any`/`maskable` icons. `src/app/layout.tsx` sets titles, social metadata, the application name, and theme color. The kit's unused HTML head snippet and template manifest have been removed.

## Expression scenes

Four action poses are published as complete, per-pose image sets under `public/brand/mascot/expressions/`. Every pose has its transparent source crop and the supplied PNG/WebP sizes. The four app-selected WebPs are mapped in `src/lib/brand.ts`; their full exports can be used directly without referencing the distributable kit.

| Scene                                  | Artwork                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| Empty saved list                       | Salute                                                      |
| Successful save toast                  | Belly laugh                                                 |
| Catalog loading                        | Tired typing                                                |
| Search with no matches                 | Thinking                                                    |
| 404 page                               | Random salute, belly laugh, pointing laugh, or tired typing |
| Page error and catalog request failure | Random thinking, tired typing, or salute                    |

The thinking mascot uses the original portrait and full WebP artwork in compact and full placements. All five SVG variants and their raster exports remain available under `/brand/mascot/variants/`; `brand.assets.vectorVariants` lists the five SVG paths for optional use. Normal status illustrations continue to use a named `BrandMascot` expression, for example `<BrandMascot expression="salute" size={128} />`. Random states use `<SceneMascot scene="not-found" />` or `<SceneMascot scene="error" />`.

`SceneMascot` chooses after hydration and keeps one expression per scene for the current document, so language changes and retries do not redraw it. On refresh, `sessionStorage` excludes that scene's previous expression. When storage is unavailable, selection still works but can repeat. A fixed-size placeholder preserves layout before selection and avoids a server/client hydration mismatch.

Runtime images use the supplied 512-pixel WebP for salute and both laughing poses, and the 256-pixel WebP for tired typing. Current runtime paths are defined in `src/lib/brand.ts`; the complete PNG/WebP size sets are also available in each pose directory.

## Public sharing URL

Set `SITE_URL` to the public site origin before a production build. Open Graph and Twitter image URLs use that origin. Only the origin is used because assets are served from the site root.

The resolution order is `SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, then `http://localhost:3000`. Vercel hostnames without a protocol use HTTPS; empty or invalid values are skipped. Local development works without this setting.

## Updating artwork

Update `src/lib/brand.ts` when the active path, name, or color changes. Keep original artwork under `assets/brand`; publish the image variants needed by the app under `public/brand`. Runtime paths must remain independent of the portable mascot kit.

See [the artwork notes](../../assets/brand/README.md) for provenance, format details, and the supplied usage notice.
