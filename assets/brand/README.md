# Thinking campus mascot artwork

The original artwork and unused variants described below remain here. The latest hand-drawn vectors and action illustrations are available as standalone published assets under public/brand/mascot, alongside the existing source archive.

- `source/mascot-original-1254px.png`: original 1254×1254 RGBA artwork.
- `source/expressions/{salute,belly-laugh,pointing-laugh,tired-typing}.png`: the four native transparent expression originals.
- `variants/`: alternative sizes, backgrounds, PNG/WebP formats, and photo favicons that the app does not currently request.
- `variants/expressions/`: 21 supplied expression image variants and the two original README files.
- `public/brand/mascot/portrait.webp` and `public/brand/mascot/full.webp`: the active compact and full thinking mascot images.
- `public/brand/mascot/variants/`: five hand-drawn SVG variants and their PNG/WebP exports, retained for optional use.
- `public/brand/mascot/expressions/<pose>/`: all PNG/WebP sizes for four action illustrations. The app selects one WebP per pose.
- Active images and update instructions: [branding guide](../../docs/design/branding.md).

The original web kit depicts the thinking mascot in Ohio State scarlet and gray with a graduation cap and Block O. Its original artwork remains available in this folder. The active portrait, full thinking mascot, and action poses use raster artwork; hand-drawn SVG alternatives remain available separately.

The expression set adds a two-finger salute, belly laugh, pointing laugh, and tired typing at a laptop. Native PNG dimensions are 711×723, 537×721, 620×724, and 1242×1182 respectively. The app uses the 512-pixel WebP exports for the first three poses and the 256-pixel WebP export for tired typing. All 29 supplied image exports are included in the public pose directories.

The original README files under `variants/expressions/` remain byte-for-byte source documentation. Their `/assets/` examples describe the supplied pack, not the app's current URLs. Use `src/lib/brand.ts` and the linked branding guide for canonical paths, scene assignments, and refresh randomization behavior.

## Supplied usage notice

角色及 Block O 校园元素可能涉及角色著作权和 Ohio State 商标；向公众上线或作商业用途前，请自行核对授权和使用规范。图包不是大学官方认可的品牌资产。
