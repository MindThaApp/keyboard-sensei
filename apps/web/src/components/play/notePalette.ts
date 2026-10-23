/**
 * The falling-notes and keyboard palette: the single source of truth for every notes
 * style (Classic today; Neon 2D and Neon 3D later). A renderer reads the JS object;
 * DOM pieces (keys, the hand legend) read the CSS variables from `notePaletteCssVars`.
 * No renderer defines colours of its own.
 *
 * Hands differ in hue AND lightness (rose-coral ≈352°, azure ≈225°), and judgements
 * never rely on red versus green: a hit is a ring and a tick, a miss is hatched grey
 * with a cross.
 */

export type StageTone = "dark" | "light";

export interface HandPalette {
  /** Top of the bar gradient. */
  hi: string;
  base: string;
  /** Bottom of the bar gradient. */
  lo: string;
  /** Outer glow of a sounding note, and the burst tint. */
  glow: string;
}

export interface NotePalette {
  tone: StageTone;
  note: { right: HandPalette; left: HandPalette };
  key: { lit: { right: string; left: string } };
  judge: {
    /** Hit ring and tick. */
    hitCore: string;
    /** Missed bar fill. */
    miss: string;
    /** Missed bar dashed edge and cross. */
    missEdge: string;
    /** Wait-mode target outline. */
    waiting: string;
  };
  stage: {
    top: string;
    mid: string;
    bottom: string;
    /** C-lane guides. */
    lane: string;
    barline: string;
    /** Hit line colour at its centre, as r g b; the line fades out towards the edges. */
    hitlineRgb: string;
    hitlinePeak: number;
  };
}

export const NOTE_MOTION = {
  /** Hit ring expansion. */
  burstMs: 260,
  /** Active-note glow pulse. */
  glowPulseMs: 180,
} as const;

/** Both motion timings collapse to zero under prefers-reduced-motion. */
export function noteMotion(reducedMotion: boolean): { burstMs: number; glowPulseMs: number } {
  return reducedMotion ? { burstMs: 0, glowPulseMs: 0 } : NOTE_MOTION;
}

export const NOTE_PALETTE_DARK: NotePalette = {
  tone: "dark",
  note: {
    right: { hi: "#FF8A9B", base: "#F2475F", lo: "#B4233D", glow: "rgb(242 71 95 / 0.55)" },
    left: { hi: "#8FB8FF", base: "#4C7DFF", lo: "#2A4FD0", glow: "rgb(76 125 255 / 0.55)" },
  },
  key: { lit: { right: "#FFD1D8", left: "#D3E1FF" } },
  judge: { hitCore: "#FFFFFF", miss: "#6E7180", missEdge: "#A2A5B3", waiting: "#FFFFFF" },
  stage: {
    top: "#07070B",
    mid: "#0E0F16",
    bottom: "#171823",
    lane: "rgb(255 255 255 / 0.035)",
    barline: "rgb(255 255 255 / 0.09)",
    hitlineRgb: "255 255 255",
    hitlinePeak: 0.75,
  },
};

export const NOTE_PALETTE_LIGHT: NotePalette = {
  tone: "light",
  note: {
    right: { hi: "#F06478", base: "#D42F49", lo: "#9E1B33", glow: "rgb(212 47 73 / 0.30)" },
    left: { hi: "#6E98FF", base: "#3563E9", lo: "#2140B8", glow: "rgb(53 99 233 / 0.30)" },
  },
  key: { lit: { right: "#FFD1D8", left: "#D3E1FF" } },
  judge: { hitCore: "#1C1C1E", miss: "#B4B6C0", missEdge: "#8A8D99", waiting: "#1C1C1E" },
  stage: {
    top: "#FBFBFD",
    mid: "#F2F3F7",
    bottom: "#E6E8EF",
    lane: "rgb(0 0 0 / 0.04)",
    barline: "rgb(0 0 0 / 0.08)",
    hitlineRgb: "0 0 0",
    hitlinePeak: 0.35,
  },
};

export function notePalette(tone: StageTone): NotePalette {
  return tone === "light" ? NOTE_PALETTE_LIGHT : NOTE_PALETTE_DARK;
}

/**
 * The stage is dark in both themes while playing (glow and contrast read best there);
 * the light stage is only for a Light-theme user with the Classic style, outside play.
 */
export function stageToneFor(options: { scheme: "light" | "dark"; style: string; playing: boolean }): StageTone {
  return options.scheme === "light" && options.style === "classic" && !options.playing ? "light" : "dark";
}

/** CSS custom properties for DOM pieces drawn in the same colours (keys, legend chips). */
export function notePaletteCssVars(palette: NotePalette): Record<string, string> {
  return {
    "--note-right": palette.note.right.base,
    "--note-right-hi": palette.note.right.hi,
    "--note-left": palette.note.left.base,
    "--note-left-hi": palette.note.left.hi,
    "--key-lit-right": palette.key.lit.right,
    "--key-lit-left": palette.key.lit.left,
    "--stage-top": palette.stage.top,
    "--stage-mid": palette.stage.mid,
    "--stage-bottom": palette.stage.bottom,
  };
}
