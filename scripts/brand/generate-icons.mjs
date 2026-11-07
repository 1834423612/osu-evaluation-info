import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseArgs } from "node:util";
import sharp from "sharp";
import { brand } from "../../src/lib/brand.ts";

const { values } = parseArgs({
  options: {
    source: { type: "string" },
    "site-root": { type: "string" },
    "kit-root": { type: "string" },
    check: { type: "boolean", default: false },
  },
});
const siteRoot = path.resolve(
  values["site-root"] ?? fileURLToPath(new URL("../../", import.meta.url)),
);
const kitRoot = values["kit-root"] ? path.resolve(values["kit-root"]) : null;
const sourcePath = path.resolve(
  values.source ??
    path.join(
      kitRoot ?? path.join(siteRoot, "../OSU_MilkyFrog_Assets"),
      "thinking-new-favicon.png",
    ),
);
const source = await readFile(sourcePath);
const metadata = await sharp(source).metadata();
if (metadata.format !== "png" || metadata.width !== metadata.height) {
  throw new Error("The favicon source must be a square PNG.");
}

const outputs = new Map();
const pngs = new Map();
async function png(size) {
  if (!pngs.has(size)) {
    pngs.set(
      size,
      await sharp(source)
        .resize(size, size)
        .png({ compressionLevel: 9 })
        .toBuffer(),
    );
  }
  return pngs.get(size);
}
async function opaque(size) {
  return sharp(await png(size))
    .flatten({ background: brand.themeColor })
    .png({ compressionLevel: 9 })
    .toBuffer();
}
async function maskable(size) {
  // A 56% square fits entirely inside the central 80%-diameter safe circle.
  const artwork = await png(Math.floor(size * 0.56));
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: brand.themeColor,
    },
  })
    .composite([{ input: artwork, gravity: "centre" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ICO contains real PNG frames, with a directory entry for each native size.
const sizes = [16, 32, 48, 64, 128, 256];
const frames = await Promise.all(sizes.map(png));
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16;
  header[entry] = sizes[index] % 256;
  header[entry + 1] = sizes[index] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frame.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frame.length;
}
const ico = Buffer.concat([header, ...frames]);
outputs.set(path.join(siteRoot, "src/app/favicon.ico"), ico);
outputs.set(path.join(siteRoot, "src/app/icon.png"), await png(128));
outputs.set(path.join(siteRoot, "src/app/apple-icon.png"), await opaque(180));
for (const size of [192, 512]) {
  outputs.set(
    path.join(siteRoot, `public/brand/icons/app-${size}.png`),
    await png(size),
  );
  outputs.set(
    path.join(siteRoot, `public/brand/icons/maskable-${size}.png`),
    await maskable(size),
  );
}

if (kitRoot) {
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256"><title>WahO! 蛙O！</title><image width="256" height="256" href="data:image/png;base64,${(await png(256)).toString("base64")}"/></svg>\n`,
  );
  for (const file of ["favicon.ico", "favicon/favicon.ico"]) {
    outputs.set(path.join(kitRoot, file), ico);
  }
  for (const file of ["favicon.svg", "favicon/favicon-mark.svg"]) {
    outputs.set(path.join(kitRoot, file), svg);
  }
  for (const size of [16, 32, 48, 64, 96, 128, 256]) {
    for (const prefix of ["favicon", "photo-favicon"]) {
      outputs.set(
        path.join(kitRoot, `favicon/${prefix}-${size}x${size}.png`),
        await png(size),
      );
    }
  }
  for (const size of [16, 32]) {
    outputs.set(
      path.join(kitRoot, `favicon-${size}x${size}.png`),
      await png(size),
    );
  }
  for (const size of [64, 128, 180, 192, 256, 512, 1024]) {
    outputs.set(
      path.join(kitRoot, `icons/scarlet/app-icon-${size}.png`),
      await png(size),
    );
  }
  for (const size of [180, 192, 512]) {
    outputs.set(
      path.join(kitRoot, `icons/light/app-icon-${size}.png`),
      await png(size),
    );
  }
  for (const size of [192, 512]) {
    outputs.set(
      path.join(kitRoot, `android-chrome-${size}x${size}.png`),
      await png(size),
    );
    outputs.set(
      path.join(kitRoot, `icons/maskable/maskable-icon-${size}.png`),
      await maskable(size),
    );
  }
  outputs.set(path.join(kitRoot, "apple-touch-icon.png"), await opaque(180));
  outputs.set(
    path.join(kitRoot, "maskable-icon-512x512.png"),
    await maskable(512),
  );
}

for (const [target, content] of outputs) {
  if (values.check) {
    if (!(await readFile(target)).equals(content)) {
      throw new Error(`Icon is out of date: ${target}`);
    }
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}
const obsoleteSvg = path.join(siteRoot, "src/app/icon.svg");
if (values.check) {
  try {
    await readFile(obsoleteSvg);
    throw new Error(`Remove the obsolete favicon artwork: ${obsoleteSvg}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
} else {
  await rm(obsoleteSvg, { force: true });
}
console.log(
  `${values.check ? "Verified" : "Generated"} ${outputs.size} icons from ${sourcePath}`,
);
