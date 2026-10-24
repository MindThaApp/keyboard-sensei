// Writes the Midivory mark sources from one description of the "Ring":
// twelve keys in a circle, one lit red, a glass hub.
//
//   node brand/generate-sources.mjs
//
// Output:
//   brand/midivory-icon.svg                       master, 108x108, #background + #foreground
//   apps/web/public/favicon.svg                    simplified: ring and one red dot
//   apps/mobile/.../drawable/ic_launcher_*.xml     Android adaptive icon layers
//
// The PNG sizes are rasterised from these SVGs (see brand/README.md).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "apps/mobile/android/app/src/main/res");

const IVORY = "#F4F1EA";
const RED = "#D9475A";
const RED_DEEP = "#B4323E";
const LIT_KEY = 1; // the key at 30 degrees

/** Key geometry in the 108 unit grid: 7.6 x 16, rounded 2.4, 12 of them around (54, 54). */
const KEY = { x: 50.2, y: 19, w: 7.6, h: 16, r: 2.4 };
const keyPath = () => {
  const { x, y, w, h, r } = KEY;
  const x2 = x + w;
  const y2 = y + h;
  return (
    `M${x + r},${y} H${x2 - r} A${r},${r} 0 0 1 ${x2},${y + r} V${y2 - r} ` +
    `A${r},${r} 0 0 1 ${x2 - r},${y2} H${x + r} A${r},${r} 0 0 1 ${x},${y2 - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
  );
};
const circlePath = (cx, cy, r) => `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;

/* ---------- master SVG ---------- */
const keysSvg = Array.from({ length: 12 }, (_, i) => {
  const fill = i === LIT_KEY ? "url(#o-red)" : "url(#o-ivory)";
  return `<rect x="${KEY.x}" y="${KEY.y}" width="${KEY.w}" height="${KEY.h}" rx="${KEY.r}" fill="${fill}" transform="rotate(${i * 30} 54 54)"/>`;
}).join("");

const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">
  <!-- Midivory "Ring": twelve keys in a circle (an octave), one lit red, a glass hub.
       #background and #foreground are separate so the same file feeds the Android adaptive
       icon, the maskable PWA icon and the favicons. The mark stays inside the 66 unit safe zone
       when #foreground is scaled to 0.9. -->
  <defs>
    <linearGradient id="o-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262A"/><stop offset="1" stop-color="#0B0B0D"/></linearGradient>
    <radialGradient id="o-glow" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="${RED_DEEP}" stop-opacity="0"/><stop offset="1" stop-color="${RED_DEEP}" stop-opacity=".25"/></radialGradient>
    <linearGradient id="o-ivory" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DAD7CF"/></linearGradient>
    <linearGradient id="o-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E35A6A"/><stop offset="1" stop-color="#9A2A35"/></linearGradient>
    <linearGradient id="o-glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>
  </defs>
  <g id="background"><rect width="108" height="108" fill="url(#o-bg)"/><circle cx="54" cy="54" r="40" fill="url(#o-glow)"/></g>
  <g id="foreground">
    <g id="keys">${keysSvg}</g>
    <circle cx="54" cy="54" r="13" fill="url(#o-glass)" stroke="#fff" stroke-opacity=".55" stroke-width=".8"/>
    <circle cx="54" cy="54" r="4.2" fill="${RED_DEEP}"/>
  </g>
</svg>
`;

/* ---------- simplified favicon: a ring and one red dot, no hub, no keys ---------- */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <!-- Simplified Midivory mark for 16 to 32 px. Twelve keys blur into a spinner at this size,
       so the favicon keeps only the ring and the one red dot. -->
  <rect width="32" height="32" rx="7" fill="#17171A"/>
  <circle cx="16" cy="16" r="8.6" fill="none" stroke="${IVORY}" stroke-width="3.6"/>
  <circle cx="21.3" cy="8.4" r="3.4" fill="${RED}"/>
</svg>
`;

/* ---------- Android adaptive icon layers ---------- */
const group = (inner) =>
  `    <group android:pivotX="54" android:pivotY="54" android:scaleX="0.9" android:scaleY="0.9">\n${inner}    </group>\n`;

const keyGroups = (colorFor) =>
  Array.from({ length: 12 }, (_, i) =>
    `        <group android:pivotX="54" android:pivotY="54" android:rotation="${i * 30}">\n` +
    `            <path android:fillColor="${colorFor(i)}" android:pathData="${keyPath()}" />\n` +
    `        </group>\n`,
  ).join("");

const vectorHead = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
`;

const foregroundXml =
  vectorHead +
  group(
    keyGroups((i) => (i === LIT_KEY ? RED : IVORY)) +
      `        <path android:fillColor="#38FFFFFF" android:strokeColor="#8CFFFFFF" android:strokeWidth="0.8" android:pathData="${circlePath(54, 54, 13)}" />\n` +
      `        <path android:fillColor="${RED_DEEP}" android:pathData="${circlePath(54, 54, 4.2)}" />\n`,
  ) +
  `</vector>\n`;

/* Android 13+ themed icon: one tint, so the lit key is the only fully opaque one. */
const monochromeXml =
  vectorHead +
  group(
    keyGroups((i) => (i === LIT_KEY ? "#FF000000" : "#99000000")) +
      `        <path android:fillColor="#00000000" android:strokeColor="#FF000000" android:strokeWidth="1.6" android:pathData="${circlePath(54, 54, 13)}" />\n` +
      `        <path android:fillColor="#FF000000" android:pathData="${circlePath(54, 54, 4.2)}" />\n`,
  ) +
  `</vector>\n`;

const backgroundXml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:aapt="http://schemas.android.com/aapt"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path android:pathData="M0,0h108v108h-108z">
        <aapt:attr name="android:fillColor">
            <gradient android:startX="54" android:startY="0" android:endX="54" android:endY="108" android:type="linear">
                <item android:offset="0" android:color="#26262A" />
                <item android:offset="1" android:color="#0B0B0D" />
            </gradient>
        </aapt:attr>
    </path>
    <path android:pathData="${circlePath(54, 54, 40)}">
        <aapt:attr name="android:fillColor">
            <gradient android:centerX="54" android:centerY="54" android:gradientRadius="40" android:type="radial">
                <item android:offset="0.55" android:color="#00B4323E" />
                <item android:offset="1" android:color="#40B4323E" />
            </gradient>
        </aapt:attr>
    </path>
</vector>
`;

const adaptiveXml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
    <monochrome android:drawable="@drawable/ic_launcher_monochrome"/>
</adaptive-icon>
`;

const write = (file, content) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

write(path.join(root, "brand/midivory-icon.svg"), master);
write(path.join(root, "apps/web/public/favicon.svg"), favicon);
write(path.join(res, "drawable/ic_launcher_foreground.xml"), foregroundXml);
write(path.join(res, "drawable/ic_launcher_monochrome.xml"), monochromeXml);
write(path.join(res, "drawable/ic_launcher_background.xml"), backgroundXml);
write(path.join(res, "mipmap-anydpi-v26/ic_launcher.xml"), adaptiveXml);
write(path.join(res, "mipmap-anydpi-v26/ic_launcher_round.xml"), adaptiveXml);
