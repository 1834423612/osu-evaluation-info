# Thinking campus mascot artwork

Imported from the supplied `OSU-MilkyFrog-Thinking_Web-Logo-Kit` and `OSU_Frog_Expression_Assets`. All 44 distinct images from the original kit are preserved across this archive, `public/brand`, and the Next.js metadata icon files. Duplicate copies and aliases from that kit have been removed. All 29 expression images and both supplied expression README files are also preserved without changes.

- `source/mascot-original-1254px.png`: original 1254×1254 RGBA artwork.
- `source/expressions/{salute,belly-laugh,pointing-laugh,tired-typing}.png`: the four native transparent expression originals.
- `variants/`: alternative sizes, backgrounds, PNG/WebP formats, and photo favicons that the app does not currently request.
- `variants/expressions/`: 21 supplied expression image variants and the two original README files.
- `public/brand/mascot/expressions/` in the project root: four active WebP expression images. Together with the original seven runtime images, `public/brand/` contains eleven active images.
- Active images and update instructions: [branding guide](../../docs/design/branding.md).

The original design is the thinking mascot in Ohio State scarlet and gray with a graduation cap and Block O. Images contain no text. PNG files are lossless; WebP versions use high-quality compression. The SVG favicon is a separately simplified vector illustration; the main character remains raster artwork. Image contents were not modified during consolidation.

The expression set adds a two-finger salute, belly laugh, pointing laugh, and tired typing at a laptop. Native PNG dimensions are 711×723, 537×721, 620×724, and 1242×1182 respectively. The app uses the supplied 512×512 WebP files for the first three poses and the 256×256 WebP file for tired typing. Every one of the 31 supplied files was retained exactly once and checked against its original SHA256 before the temporary directory was removed.

The original README files under `variants/expressions/` remain byte-for-byte source documentation. Their `/assets/` examples describe the supplied pack, not the app's current URLs. Use `src/lib/brand.ts` and the linked branding guide for canonical paths, scene assignments, and refresh randomization behavior.

## Supplied usage notice

角色及 Block O 校园元素可能涉及角色著作权和 Ohio State 商标；向公众上线或作商业用途前，请自行核对授权和使用规范。图包不是大学官方认可的品牌资产。
