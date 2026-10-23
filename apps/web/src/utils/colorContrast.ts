/**
 * Colour maths for the appearance engine: WCAG 2 contrast and the alpha compositing
 * browsers do when stacking translucent layers. Everything works on 0–255 sRGB
 * triples; blending is in gamma-encoded sRGB, which is what CSS does.
 */

export type Rgb = readonly [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const full = value.length === 3 ? value.split("").map((c) => c + c).join("") : value;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** "180 50 62" — the space-separated form Tailwind's `<alpha-value>` mapping needs. */
export function rgbTriplet(rgb: Rgb): string {
  return rgb.map((c) => Math.round(c)).join(" ");
}

function channelToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channelToLinear(rgb[0]) + 0.7152 * channelToLinear(rgb[1]) + 0.0722 * channelToLinear(rgb[2]);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Source-over: `fg` at `alpha` painted onto an opaque `bg`. */
export function blend(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map((i) => fg[i] * alpha + bg[i] * (1 - alpha)) as unknown as Rgb;
}

/** `mix-blend-mode: soft-light` (W3C compositing spec) of `src` over `dst`, at `alpha`. */
export function softLight(src: Rgb, alpha: number, dst: Rgb): Rgb {
  const blended = [0, 1, 2].map((i) => {
    const cb = dst[i] / 255;
    const cs = src[i] / 255;
    if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
    const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
    return cb + (2 * cs - 1) * (d - cb);
  });
  return [0, 1, 2].map((i) => blended[i] * 255 * alpha + dst[i] * (1 - alpha)) as unknown as Rgb;
}

/** Mix two colours (`t` = share of `b`), used to derive the legacy accent ramp from a tint. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return blend(b, t, a);
}
