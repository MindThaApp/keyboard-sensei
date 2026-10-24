/** Side of the tiling noise texture the shaders sample (texels). */
export const NOISE_SIZE = 128;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * RGBA bytes of four independent, seamlessly tiling value-noise fields (three octaves
 * each). Made once when the renderer mounts; deterministic, so looks never change between
 * visits.
 */
export function generateNoise(size: number = NOISE_SIZE): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const rand = mulberry32(0x5eed);
  for (let channel = 0; channel < 4; channel++) {
    const octaves: { cells: number; lattice: Float32Array; weight: number }[] = [];
    for (let o = 0; o < 3; o++) {
      const cells = 4 << o;
      const lattice = new Float32Array(cells * cells);
      for (let i = 0; i < lattice.length; i++) lattice[i] = rand();
      octaves.push({ cells, lattice, weight: 1 / (1 << o) });
    }
    const total = octaves.reduce((sum, octave) => sum + octave.weight, 0);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let value = 0;
        for (const { cells, lattice, weight } of octaves) {
          const fx = (x / size) * cells;
          const fy = (y / size) * cells;
          const x0 = Math.floor(fx);
          const y0 = Math.floor(fy);
          const tx = fx - x0;
          const ty = fy - y0;
          const sx = tx * tx * (3 - 2 * tx);
          const sy = ty * ty * (3 - 2 * ty);
          const x1 = (x0 + 1) % cells;
          const y1 = (y0 + 1) % cells;
          const a = lattice[y0 * cells + x0]!;
          const b = lattice[y0 * cells + x1]!;
          const c = lattice[y1 * cells + x0]!;
          const d = lattice[y1 * cells + x1]!;
          value += weight * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy);
        }
        out[(y * size + x) * 4 + channel] = Math.round((value / total) * 255);
      }
    }
  }
  return out;
}
