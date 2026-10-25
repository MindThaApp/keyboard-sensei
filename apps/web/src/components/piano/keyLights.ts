/**
 * Keys a notes style lights up in its own colours: FX lights each key while its note
 * sounds, in that note's colour. The style writes a frame's lit keys into a
 * `KeyLightWriter`, which tells the keyboard only when the set or a colour changed.
 * `VirtualPiano` applies that straight to its key elements (a data attribute and a CSS
 * colour variable), so a light never re-renders React, however often notes come and go.
 *
 * One channel per page: there is only one play-along keyboard on screen.
 */

/** Packed `0x01RRGGBB` per MIDI note; 0 means the key is not lit. */
export type KeyLightTable = Uint32Array;

export interface KeyLightState {
  /** A style that lights keys is on: the keyboard dims its keys so the lit ones glow. */
  active: boolean;
  lit: KeyLightTable;
  /** Packed colour of the look's accent: what a key you press lights in when the song is not on it. 0 when unknown. */
  accent: number;
}

type Listener = (state: KeyLightState) => void;

const listeners = new Set<Listener>();
let state: KeyLightState = { active: false, lit: new Uint32Array(128), accent: 0 };
/** The writer whose lights are showing; a writer that was replaced never clears them. */
let owner: KeyLightWriter | null = null;

export function getKeyLights(): KeyLightState {
  return state;
}

export function subscribeKeyLights(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: KeyLightState): void {
  state = next;
  for (const listener of [...listeners]) listener(next);
}

const channel = (value: number): number => Math.max(0, Math.min(255, Math.round(value * 255)));

/** Packs 0..1 rgb into a table entry. */
export function packKeyLight(r: number, g: number, b: number): number {
  return (0x1000000 | (channel(r) << 16) | (channel(g) << 8) | channel(b)) >>> 0;
}

/** `"r g b"` for `rgb(var(--key-light) / a)`. */
export function keyLightRgb(packed: number): string {
  return `${(packed >> 16) & 255} ${(packed >> 8) & 255} ${packed & 255}`;
}

/**
 * One writer per renderer. `begin`, `light` each sounding key, `commit`: nothing is
 * published (and nothing allocated) unless the lit keys differ from the last commit.
 */
export class KeyLightWriter {
  private next = new Uint32Array(128);
  private shown = new Uint32Array(128);
  private active = false;
  private accent = 0;

  /** The look's accent colour (0..1 rgb), for keys the player presses that the song is not on. */
  setAccent(r: number, g: number, b: number): void {
    const packed = packKeyLight(r, g, b);
    if (packed === this.accent) return;
    this.accent = packed;
    if (this.active && owner === this) publish({ active: true, lit: this.shown, accent: packed });
  }

  /** The style is drawing (true) or gone (false); turning off clears every light. */
  setActive(active: boolean): void {
    if (active === this.active) return;
    this.active = active;
    if (!active) this.next.fill(0);
    this.shown = this.next.slice();
    if (active) owner = this;
    else if (owner !== this) return;
    else owner = null;
    publish({ active, lit: this.shown, accent: this.accent });
  }

  begin(): void {
    this.next.fill(0);
  }

  light(midi: number, r: number, g: number, b: number): void {
    if (midi >= 0 && midi < 128) this.next[midi] = packKeyLight(r, g, b);
  }

  /** Publishes the frame's lights if they changed. Returns whether it did. */
  commit(): boolean {
    if (!this.active || owner !== this) return false;
    let changed = false;
    for (let i = 0; i < 128; i++) {
      if (this.next[i] !== this.shown[i]) {
        changed = true;
        break;
      }
    }
    if (!changed) return false;
    this.shown = this.next.slice();
    publish({ active: true, lit: this.shown, accent: this.accent });
    return true;
  }
}
