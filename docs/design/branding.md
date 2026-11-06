# Course Atlas branding

Course Atlas uses the thinking campus mascot across navigation, empty states, browser icons, and sharing previews. `src/lib/brand.ts` is the shared source for the product name, description, scarlet theme color (`#BA0C2F`), warm background (`#FAF8F6`), and public asset paths. `src/components/brand/brand-mascot.tsx` renders both mascot variants.

## Asset locations

Each distinct image is stored once. The supplied kit's duplicate aliases and copied public directories have been consolidated without changing image contents.

| Location                 | Purpose                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `public/brand/`          | Only the seven images requested by the app and generated manifest |
| `src/app/`               | Next.js browser and Apple icon convention files                   |
| `assets/brand/source/`   | Original 1254-pixel transparent artwork                           |
| `assets/brand/variants/` | Unused sizes, formats, and alternate artwork, outside public URLs |

| Surface                             | Canonical asset                       |
| ----------------------------------- | ------------------------------------- |
| Navigation and compact identity     | `/brand/mascot/portrait.webp`         |
| Page illustrations and empty states | `/brand/mascot/full.webp`             |
| Browser tab, scalable icon          | `src/app/icon.svg`                    |
| Browser tab, ICO fallback           | `src/app/favicon.ico`                 |
| Apple home-screen icon              | `src/app/apple-icon.png` (180×180)    |
| Application icons                   | `/brand/icons/app-{192,512}.png`      |
| Maskable application icons          | `/brand/icons/maskable-{192,512}.png` |
| Open Graph and Twitter sharing      | `/brand/social/og-image.png`          |

Next.js automatically emits the browser and Apple icon links from `src/app`. These filenames must remain there. `src/app/manifest.ts` generates `/manifest.webmanifest`, using the shared brand paths and separate `any`/`maskable` icons. `src/app/layout.tsx` sets titles, social metadata, the application name, and theme color. The kit's unused HTML head snippet and template manifest have been removed.

## Public sharing URL

Set `SITE_URL` to the public site origin before a production build. Open Graph and Twitter image URLs use that origin. Only the origin is used because assets are served from the site root.

The resolution order is `SITE_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, then `http://localhost:3000`. Vercel hostnames without a protocol use HTTPS; empty or invalid values are skipped. Local development works without this setting.

## Updating artwork

Replace the canonical image in its existing location and update `src/lib/brand.ts` if a path, name, or color changes. Keep original artwork and unused alternatives under `assets/brand`; promote an alternative into `public/brand` only when the app uses it. Move files rather than copying them into multiple directories.

See [the artwork notes](../../assets/brand/README.md) for provenance, format details, and the supplied usage notice.
