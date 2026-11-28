// Renders the Windows package assets (apps/windows/MusicPortal/Assets) from the
// brand icon SVG: tile and store logos, the splash screen and AppIcon.ico.
//
//   node apps/windows/scripts/rasterize-assets.mjs [path/to/icon.svg]
//
// Defaults to brand/music-portal-icon.svg when it exists, else the current icon.
// Needs Playwright (not a repo dependency, like brand/rasterize.mjs): set
// PLAYWRIGHT_MODULE to its index.mjs, or have it resolvable from here.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const out = path.join(root, "apps/windows/MusicPortal/Assets");
const candidates = [process.argv[2], "brand/music-portal-icon.svg", "brand/midivory-icon.svg"].filter(Boolean);
const source = candidates.map((file) => path.resolve(root, file)).find((file) => fs.existsSync(file));
if (!source) throw new Error("No icon SVG found");

const { chromium } = process.env.PLAYWRIGHT_MODULE
  ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
  : createRequire(import.meta.url)("playwright");

// Comments in the SVG are design notes; they never go into an image.
const svg = fs.readFileSync(source, "utf8").replace(/<!--[\s\S]*?-->/g, "");
const sized = (px) => svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);

/** [file, width, height, icon size] — the icon centred on a transparent canvas. */
const assets = [
  ["Square44x44Logo.png", 44, 44, 44],
  ["Square150x150Logo.png", 150, 150, 120],
  ["Wide310x150Logo.png", 310, 150, 120],
  ["StoreLogo.png", 50, 50, 50],
  ["SplashScreen.png", 620, 300, 220],
];
const icoSizes = [16, 24, 32, 48, 256];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function render(width, height, icon) {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<html><body style="margin:0;background:transparent;display:flex;align-items:center;justify-content:center;width:${width}px;height:${height}px">${sized(icon)}</body></html>`,
  );
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width, height } });
}

fs.mkdirSync(out, { recursive: true });
for (const [file, width, height, icon] of assets) {
  fs.writeFileSync(path.join(out, file), await render(width, height, icon));
}

// ICO with PNG-compressed entries (supported since Windows Vista).
const images = [];
for (const size of icoSizes) images.push({ size, png: await render(size, size, size) });
await browser.close();
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach(({ size, png }, index) => {
  const entry = 6 + 16 * index;
  header.writeUInt8(size >= 256 ? 0 : size, entry);
  header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
  header.writeUInt8(0, entry + 2);
  header.writeUInt8(0, entry + 3);
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
fs.writeFileSync(path.join(out, "AppIcon.ico"), Buffer.concat([header, ...images.map(({ png }) => png)]));
console.log(`Wrote ${assets.length} PNGs and AppIcon.ico from ${path.relative(root, source)}`);
