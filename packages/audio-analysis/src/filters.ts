/** Biquad filters (RBJ cookbook), direct form I, processing in place. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  private constructor(b0: number, b1: number, b2: number, a0: number, a1: number, a2: number) {
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
  }

  static highPass(sampleRate: number, frequency: number, q = Math.SQRT1_2): Biquad {
    const w = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    return new Biquad((1 + cos) / 2, -(1 + cos), (1 + cos) / 2, 1 + alpha, -2 * cos, 1 - alpha);
  }

  static notch(sampleRate: number, frequency: number, q = 30): Biquad {
    const w = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    return new Biquad(1, -2 * cos, 1, 1 + alpha, -2 * cos, 1 - alpha);
  }

  process(samples: Float32Array | Float64Array): void {
    let { x1, x2, y1, y2 } = this;
    const { b0, b1, b2, a1, a2 } = this;
    for (let i = 0; i < samples.length; i++) {
      const x = samples[i]!;
      const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x;
      y2 = y1;
      y1 = Math.abs(y) < 1e-30 ? 0 : y;
      samples[i] = y1;
    }
    this.x1 = x1;
    this.x2 = x2;
    this.y1 = y1;
    this.y2 = y2;
  }
}
