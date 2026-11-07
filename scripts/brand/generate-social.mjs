import { mkdir, readFile } from "node:fs/promises";
import sharp from "sharp";
import { brand } from "../../src/lib/brand.ts";

const root = new URL("../../", import.meta.url);
const escapeXml = (value) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const mascot = await sharp(
  await readFile(new URL(`public${brand.assets.mascot}`, root)),
)
  .resize(408, 470, { fit: "contain", background: "#00000000" })
  .png()
  .toBuffer();
const [enFirst, enSecond] = brand.slogan.en.map(escapeXml);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="${brand.backgroundColor}"/>
  <rect x="24" y="24" width="1152" height="582" rx="32" fill="#fff" stroke="#e7dfe2"/>
  <defs><clipPath id="card"><rect x="24" y="24" width="1152" height="582" rx="32"/></clipPath></defs>
  <g clip-path="url(#card)">
    <circle cx="1104" cy="164" r="295" fill="#fcf0f2"/>
    <circle cx="1044" cy="584" r="220" fill="${brand.themeColor}"/>
  </g>
  <g font-family="Arial, sans-serif">
    <rect x="72" y="76" width="32" height="5" rx="2.5" fill="${brand.themeColor}"/>
    <text x="72" y="186" font-size="80" font-weight="800" letter-spacing="-4" fill="#29252a">${escapeXml(brand.names.en.slice(0, -2))}<tspan fill="${brand.themeColor}">${escapeXml(brand.names.en.slice(-2))}</tspan></text>
    <text x="412" y="180" font-size="34" font-weight="700" fill="#6d6269">${escapeXml(brand.names.zh)}</text>
    <text x="72" y="290" font-size="43" font-weight="700" letter-spacing="-1.5" fill="#29252a">${enFirst}</text>
    <text x="72" y="350" font-size="43" font-weight="700" letter-spacing="-1.5" fill="${brand.themeColor}">${enSecond}</text>
    <text x="72" y="414" font-size="28" fill="#53484e">${escapeXml(brand.slogan.zh.join(""))}</text>
    <text x="72" y="536" font-size="14" font-weight="700" letter-spacing="1.2" fill="#6d6269">${escapeXml(brand.context.en)}</text>
  </g>
</svg>`;

const output = new URL(`public${brand.assets.social}`, root);
await mkdir(new URL("./", output), { recursive: true });
await sharp(Buffer.from(svg))
  .composite([{ input: mascot, left: 760, top: 118 }])
  .png()
  .toFile(output.pathname);
console.log(`Generated ${brand.assets.social} (1200 × 630)`);
