import * as THREE from "three";

/**
 * Selective bloom by dual filtering (Kawase down/up sampling), the cheapest good-looking
 * blur there is: each level reads 5 (down) or 8 (up) taps at half the previous size.
 *
 * Selective: only the emissive layer blooms. The renderer draws its emissive meshes
 * straight into `input` (already at the reduced bloom resolution, so there is no
 * full-size copy to downsample), `run` blurs it, and `composite` adds the result over
 * the frame together with the stage-floor reflection: a mirrored, 15%-opacity copy of
 * the blurred emissive layer in a thin band just above the hit line.
 */

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec4 sum = texture2D(uSource, vUv) * 4.0;
  sum += texture2D(uSource, vUv - o);
  sum += texture2D(uSource, vUv + o);
  sum += texture2D(uSource, vUv + vec2(o.x, -o.y));
  sum += texture2D(uSource, vUv - vec2(o.x, -o.y));
  gl_FragColor = sum / 8.0;
}
`;

const UP_FRAGMENT = /* glsl */ `
uniform sampler2D uSource;
uniform sampler2D uSkip;
uniform float uSkipGain;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec4 sum = texture2D(uSource, vUv + vec2(-o.x * 2.0, 0.0));
  sum += texture2D(uSource, vUv + vec2(-o.x, o.y)) * 2.0;
  sum += texture2D(uSource, vUv + vec2(0.0, o.y * 2.0));
  sum += texture2D(uSource, vUv + vec2(o.x, o.y)) * 2.0;
  sum += texture2D(uSource, vUv + vec2(o.x * 2.0, 0.0));
  sum += texture2D(uSource, vUv + vec2(o.x, -o.y)) * 2.0;
  sum += texture2D(uSource, vUv + vec2(0.0, -o.y * 2.0));
  sum += texture2D(uSource, vUv + vec2(-o.x, -o.y)) * 2.0;
  // Mixing in the same-size level keeps a tight inner glow under the wide one.
  gl_FragColor = sum / 12.0 + texture2D(uSkip, vUv) * uSkipGain;
}
`;

const COMPOSITE_FRAGMENT = /* glsl */ `
uniform sampler2D uBloom;
uniform float uIntensity;
uniform float uFloorUv;
uniform float uReflection;
varying vec2 vUv;
void main() {
  vec3 glow = texture2D(uBloom, vUv).rgb * uIntensity;
  if (uReflection > 0.0 && vUv.y < uFloorUv) {
    // Mirror about the top of the floor band; fade out towards the hit line.
    float mirrored = 2.0 * uFloorUv - vUv.y;
    float fade = vUv.y / uFloorUv;
    glow += texture2D(uBloom, vec2(vUv.x, mirrored)).rgb * uReflection * fade;
  }
  // Light adds to whatever is under it; alpha lets it show over the page's stage gradient.
  float a = clamp(max(glow.r, max(glow.g, glow.b)), 0.0, 1.0);
  gl_FragColor = vec4(glow, a);
}
`;

function fullscreenMaterial(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    transparent: blending !== THREE.NoBlending,
    premultipliedAlpha: true,
    blending,
  });
}

export interface BloomConfig {
  /** Drawing-buffer size of the frame, device px. */
  width: number;
  height: number;
  /** Bloom resolution as a fraction of the frame. */
  scale: number;
  mips: number;
}

export class Bloom {
  /** The emissive layer is drawn into this. */
  input: THREE.WebGLRenderTarget | null = null;
  private down: THREE.WebGLRenderTarget[] = [];
  private up: THREE.WebGLRenderTarget[] = [];
  private config: BloomConfig | null = null;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  private readonly downMaterial: THREE.ShaderMaterial;
  private readonly upMaterial: THREE.ShaderMaterial;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly type: THREE.TextureDataType;

  constructor(renderer: THREE.WebGLRenderer) {
    // Half-float keeps bright cores from clipping before they spread; 8-bit otherwise.
    const halfFloat = renderer.extensions.has("EXT_color_buffer_float") || renderer.extensions.has("EXT_color_buffer_half_float");
    this.type = halfFloat ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.downMaterial = fullscreenMaterial(DOWN_FRAGMENT, { uSource: { value: null }, uTexel: { value: new THREE.Vector2() } }, THREE.NoBlending);
    this.upMaterial = fullscreenMaterial(
      UP_FRAGMENT,
      { uSource: { value: null }, uSkip: { value: null }, uSkipGain: { value: 0.6 }, uTexel: { value: new THREE.Vector2() } },
      THREE.NoBlending,
    );
    this.compositeMaterial = fullscreenMaterial(
      COMPOSITE_FRAGMENT,
      { uBloom: { value: null }, uIntensity: { value: 1 }, uFloorUv: { value: 0.05 }, uReflection: { value: 0 } },
      THREE.AdditiveBlending,
    );
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.downMaterial);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get enabled(): boolean {
    return this.input !== null;
  }

  /** (Re)allocates the targets only when the size, scale or mip count really changed. */
  configure(config: BloomConfig): void {
    const previous = this.config;
    if (
      previous &&
      previous.width === config.width &&
      previous.height === config.height &&
      previous.scale === config.scale &&
      previous.mips === config.mips
    ) {
      return;
    }
    this.releaseTargets();
    this.config = { ...config };
    if (config.scale <= 0 || config.mips <= 0) return;
    const make = (w: number, h: number) =>
      new THREE.WebGLRenderTarget(w, h, {
        type: this.type,
        depthBuffer: false,
        stencilBuffer: false,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        generateMipmaps: false,
      });
    let w = Math.max(1, Math.round(config.width * config.scale));
    let h = Math.max(1, Math.round(config.height * config.scale));
    this.input = make(w, h);
    for (let level = 0; level < config.mips; level++) {
      w = Math.max(1, Math.round(w / 2));
      h = Math.max(1, Math.round(h / 2));
      this.down.push(make(w, h));
    }
    // up[i] is the size of the level above down[i], i.e. down[i-1] (or the input).
    for (let level = 0; level < config.mips; level++) {
      const above = level === 0 ? this.input : this.down[level - 1]!;
      this.up.push(make(above.width, above.height));
    }
  }

  /** Blur `input` down the mip chain and back up. */
  run(renderer: THREE.WebGLRenderer): void {
    const input = this.input;
    if (!input) return;
    this.quad.material = this.downMaterial;
    let source: THREE.WebGLRenderTarget = input;
    for (const target of this.down) {
      this.downMaterial.uniforms.uSource!.value = source.texture;
      (this.downMaterial.uniforms.uTexel!.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
      renderer.setRenderTarget(target);
      renderer.render(this.scene, this.camera);
      source = target;
    }
    this.quad.material = this.upMaterial;
    for (let level = this.up.length - 1; level >= 0; level--) {
      const target = this.up[level]!;
      const skip = level === 0 ? input : this.down[level - 1]!;
      this.upMaterial.uniforms.uSource!.value = source.texture;
      this.upMaterial.uniforms.uSkip!.value = skip.texture;
      (this.upMaterial.uniforms.uTexel!.value as THREE.Vector2).set(1 / source.width, 1 / source.height);
      renderer.setRenderTarget(target);
      renderer.render(this.scene, this.camera);
      source = target;
    }
  }

  /** Add the bloom (and the floor reflection) over whatever is in the current target. */
  composite(renderer: THREE.WebGLRenderer, options: { intensity: number; floorUv: number; reflection: number }): void {
    const result = this.up[0];
    if (!result) return;
    const uniforms = this.compositeMaterial.uniforms;
    uniforms.uBloom!.value = result.texture;
    uniforms.uIntensity!.value = options.intensity;
    uniforms.uFloorUv!.value = options.floorUv;
    uniforms.uReflection!.value = options.reflection;
    this.quad.material = this.compositeMaterial;
    renderer.render(this.scene, this.camera);
  }

  private releaseTargets(): void {
    this.input?.dispose();
    this.input = null;
    for (const target of this.down) target.dispose();
    for (const target of this.up) target.dispose();
    this.down = [];
    this.up = [];
  }

  dispose(): void {
    this.releaseTargets();
    this.config = null;
    this.quad.geometry.dispose();
    this.downMaterial.dispose();
    this.upMaterial.dispose();
    this.compositeMaterial.dispose();
  }
}
