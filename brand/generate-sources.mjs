// Writes the Music Portal mark sources from one description of the "Portal":
// a ring with an eighth note stepping through it and one red light on the rim.
//
//   node brand/generate-sources.mjs
//
// Output:
//   brand/music-portal-icon.svg                   master, 108x108, #background + #foreground
//   apps/web/public/favicon.svg                    simplified for 16 to 32 px
//   apps/mobile/.../drawable/ic_launcher_*.xml     Android adaptive icon layers
//
// The PNG sizes are rasterised from these SVGs by brand/rasterize.mjs.
// brand/midivory-icon.svg is the previous mark, kept (and no longer written) until the new one
// has shipped on every platform.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const res = path.join(root, "apps/mobile/android/app/src/main/res");

const IVORY = "#F4F1EA";
const RED = "#D9475A";
const RED_DEEP = "#B4323E";

/*
 * The "Portal": a ring (the doorway) with an eighth note stepping through it and one red
 * light on the rim. Everything is in the 108 unit grid around (54, 54); the mark stays inside
 * the 66 unit safe zone when #foreground is scaled to 0.9.
 */
const RING = { cx: 54, cy: 54, outer: 31, inner: 24.5 };
const LIGHT = { cx: 54 + 27.75 * Math.sin(Math.PI / 6), cy: 54 - 27.75 * Math.cos(Math.PI / 6), r: 5.2 };
const round = (n) => Math.round(n * 100) / 100;

const circlePath = (cx, cy, r) => `M${cx - r},${cy} a${r},${r} 0 1 0 ${2 * r},0 a${r},${r} 0 1 0 ${-2 * r},0 Z`;
/** The ring as one even-odd path (outer circle minus inner circle). */
const ringPath = () => `${circlePath(RING.cx, RING.cy, RING.outer)} ${circlePath(RING.cx, RING.cy, RING.inner)}`;
/** The note: a tilted oval head, a stem and one flag, as a single path. */
const NOTE_HEAD = { cx: 49.6, cy: 64.6, rx: 7.2, ry: 5.2, tilt: -22 };
const notePath = () => {
  const { cx, cy, rx, ry, tilt } = NOTE_HEAD;
  const t = (tilt * Math.PI) / 180;
  const dx = round(rx * Math.cos(t));
  const dy = round(rx * Math.sin(t));
  const head = `M${round(cx - dx)},${round(cy - dy)} a${rx},${ry} ${tilt} 1 1 ${round(2 * dx)},${round(2 * dy)} a${rx},${ry} ${tilt} 1 1 ${round(-2 * dx)},${round(-2 * dy)} Z`;
  const stem = "M53.4,64 V37 H57.4 V64 Z";
  const flag = "M57.4,37 C57.4,43.5 67.6,45.6 67.6,54.2 C67.6,57.4 66.6,60 65.2,61.8 C66,55.6 62.4,51.6 57.4,50.6 Z";
  return `${head} ${stem} ${flag}`;
};

/* ---------- master SVG ---------- */
const master = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="512" height="512">
  <defs>
    <linearGradient id="p-bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26262A"/><stop offset="1" stop-color="#0B0B0D"/></linearGradient>
    <radialGradient id="p-glow" cx=".5" cy=".5" r=".5"><stop offset=".55" stop-color="${RED_DEEP}" stop-opacity="0"/><stop offset="1" stop-color="${RED_DEEP}" stop-opacity=".25"/></radialGradient>
    <linearGradient id="p-ivory" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#DAD7CF"/></linearGradient>
    <linearGradient id="p-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E35A6A"/><stop offset="1" stop-color="#9A2A35"/></linearGradient>
  </defs>
  <g id="background"><rect width="108" height="108" fill="url(#p-bg)"/><circle cx="54" cy="54" r="40" fill="url(#p-glow)"/></g>
  <g id="foreground">
    <path id="ring" fill="url(#p-ivory)" fill-rule="evenodd" d="${ringPath()}"/>
    <path id="note" fill="url(#p-ivory)" d="${notePath()}"/>
    <circle id="light" cx="${round(LIGHT.cx)}" cy="${round(LIGHT.cy)}" r="${LIGHT.r}" fill="url(#p-red)"/>
  </g>
</svg>
`;

/* ---------- simplified favicon: the ring, the note and the red light, thicker ---------- */
const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
  <rect width="32" height="32" rx="7" fill="#17171A"/>
  <circle cx="16" cy="16" r="10.4" fill="none" stroke="${IVORY}" stroke-width="2.6"/>
  <path fill="${IVORY}" d="M12.5,21 a2.7,2 -22 1 1 5,-2 a2.7,2 -22 1 1 -5,2 Z M16.1,20.4 V10.4 H17.9 V20.4 Z M17.9,10.4 C17.9,12.6 21.2,13.4 21.2,16.4 C21.2,17.5 20.9,18.4 20.4,19 C20.6,16.9 19.6,15.6 17.9,15.2 Z"/>
  <circle cx="21.3" cy="7" r="3.2" fill="${RED}"/>
</svg>
`;

/* ---------- Android adaptive icon layers ---------- */
const group = (inner) =>
  `    <group android:pivotX="54" android:pivotY="54" android:scaleX="0.9" android:scaleY="0.9">\n${inner}    </group>\n`;

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
    `        <path android:fillColor="${IVORY}" android:fillType="evenOdd" android:pathData="${ringPath()}" />\n` +
      `        <path android:fillColor="${IVORY}" android:pathData="${notePath()}" />\n` +
      `        <path android:fillColor="${RED}" android:pathData="${circlePath(round(LIGHT.cx), round(LIGHT.cy), LIGHT.r)}" />\n`,
  ) +
  `</vector>\n`;

/* Android 13+ themed icon: one tint, so the red light becomes a solid dot on a lighter ring. */
const monochromeXml =
  vectorHead +
  group(
    `        <path android:fillColor="#99000000" android:fillType="evenOdd" android:pathData="${ringPath()}" />\n` +
      `        <path android:fillColor="#FF000000" android:pathData="${notePath()}" />\n` +
      `        <path android:fillColor="#FF000000" android:pathData="${circlePath(round(LIGHT.cx), round(LIGHT.cy), LIGHT.r)}" />\n`,
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

write(path.join(root, "brand/music-portal-icon.svg"), master);
write(path.join(root, "apps/web/public/favicon.svg"), favicon);
write(path.join(res, "drawable/ic_launcher_foreground.xml"), foregroundXml);
write(path.join(res, "drawable/ic_launcher_monochrome.xml"), monochromeXml);
write(path.join(res, "drawable/ic_launcher_background.xml"), backgroundXml);
write(path.join(res, "mipmap-anydpi-v26/ic_launcher.xml"), adaptiveXml);
write(path.join(res, "mipmap-anydpi-v26/ic_launcher_round.xml"), adaptiveXml);
