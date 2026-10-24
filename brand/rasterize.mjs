// Rasterises the OctaviApp icon PNGs from the SVG sources.
//
//   node brand/generate-sources.mjs
//   PLAYWRIGHT_MODULE=/path/to/node_modules/playwright/index.mjs node brand/rasterize.mjs [contact-sheet-dir]
//
// Playwright is deliberately not a repo dependency: install it in a scratch directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright"
);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "apps/mobile/android/app/src/main/res");
const pub = path.join(root, "apps/web/public");
const master = fs.readFileSync(path.join(root, "brand/octaviapp-icon.svg"), "utf8");
const favicon = fs.readFileSync(path.join(pub, "favicon.svg"), "utf8");

/** The master with its width/height replaced, optionally with the mark shrunk into the safe zone. */
function sized(svg, px, { safe = false } = {}) {
  let out = svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`);
  if (safe) out = out.replace('<g id="foreground">', '<g id="foreground" transform="translate(5.4 5.4) scale(0.9)">');
  return out;
}

/** Wraps an svg in a div with a corner radius (fraction of the side) for legacy launcher shapes. */
function shaped(svg, px, radius) {
  return `<div style="width:${px}px;height:${px}px;border-radius:${radius * px}px;overflow:hidden">${svg}</div>`;
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();

async function png(html, px, file) {
  await page.setViewportSize({ width: px, height: px });
  await page.setContent(`<body style="margin:0;background:transparent">${html}</body>`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: px, height: px } });
}

// Web and iOS.
await png(sized(master, 192), 192, path.join(pub, "icon-192.png"));
await png(sized(master, 512), 512, path.join(pub, "icon-512.png"));
await png(sized(master, 512, { safe: true }), 512, path.join(pub, "icon-maskable-512.png"));
await png(sized(master, 180), 180, path.join(pub, "apple-touch-icon.png"));
await png(sized(favicon, 32), 32, path.join(pub, "favicon-32.png"));
await png(sized(favicon, 16), 16, path.join(pub, "favicon-16.png"));

// Android legacy launcher icons (pre-adaptive devices): rounded square and circle.
const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [density, px] of Object.entries(legacy)) {
  const dir = path.join(res, `mipmap-${density}`);
  await png(shaped(sized(master, px, { safe: true }), px, 0.18), px, path.join(dir, "ic_launcher.png"));
  await png(shaped(sized(master, px, { safe: true }), px, 0.5), px, path.join(dir, "ic_launcher_round.png"));
}

// Contact sheet.
const sheetDir = process.argv[2];
if (sheetDir) {
  const cell = (bg, fg) => {
    const tile = (svg, px, radius) => `<div style="margin:6px;display:inline-block;border-radius:${radius * px}px;overflow:hidden;line-height:0">${sized(svg, px)}</div>`;
    const small = (svg, px) => `<span style="display:inline-block;margin:6px;line-height:0;vertical-align:middle">${sized(svg, px)}</span>`;
    return `<section style="background:${bg};color:${fg};padding:24px;font:600 13px -apple-system,system-ui,sans-serif">
      <p style="margin:0 0 8px">Master 512 / 192 / 96 (squircle, circle, teardrop masks)</p>
      ${tile(master, 192, 0.22)}${tile(master, 192, 0.5)}
      <div style="display:inline-block;margin:6px;width:192px;height:192px;overflow:hidden;border-radius:50% 50% 50% 8%;line-height:0;transform:rotate(-45deg) scale(.72);transform-origin:center"><div style="transform:rotate(45deg) scale(1.38)">${sized(master, 192, { safe: true })}</div></div>
      ${tile(sized(master, 96, { safe: true }), 96, 0.22)}
      <p style="margin:12px 0 8px">Icon sizes 192 / 180 / 96 / 64 / 48 (maskable uses the 0.9 safe scale)</p>
      ${tile(master, 96, 0.22)}${tile(master, 64, 0.22)}${tile(master, 48, 0.22)}${small(sized(master, 96, { safe: true }), 96)}
      <p style="margin:12px 0 8px">Favicon (simplified) 64 / 48 / 32 / 16</p>
      ${small(favicon, 64)}${small(favicon, 48)}${small(favicon, 32)}${small(favicon, 16)}
      <p style="margin:12px 0 8px">Wordmark</p>
      <div style="display:flex;align-items:center;gap:10px;font:800 28px -apple-system,system-ui,sans-serif;letter-spacing:-0.03em">
        <span style="line-height:0;border-radius:8px;overflow:hidden">${sized(master, 36)}</span>OctaviApp</div>
    </section>`;
  };
  fs.mkdirSync(sheetDir, { recursive: true });
  await page.setViewportSize({ width: 1100, height: 560 });
  await page.setContent(`<body style="margin:0;display:grid;grid-template-columns:1fr 1fr">${cell("#F2F2F7", "#111")}${cell("#000", "#eee")}</body>`);
  await page.screenshot({ path: path.join(sheetDir, "contact-sheet.png"), fullPage: true });
}

await browser.close();
